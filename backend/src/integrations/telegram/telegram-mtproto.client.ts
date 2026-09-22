import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Api, helpers, TelegramClient, utils } from 'telegram';
import type { Entity, EntityLike } from 'telegram/define';
import { EditedMessage } from 'telegram/events/EditedMessage';
import type { EditedMessageEvent } from 'telegram/events/EditedMessage';
import { NewMessage } from 'telegram/events/NewMessage';
import type { NewMessageEvent } from 'telegram/events/NewMessage';

import {
  TELEGRAM_BOOTSTRAP_HISTORY_LIMIT,
  TELEGRAM_MAX_HISTORY_LIMIT,
  TELEGRAM_RECOVERY_CURSOR_OVERLAP,
  TELEGRAM_RECOVERY_MAX_MESSAGES,
} from './telegram.constants';
import { TelegramIntegrationError } from './telegram.errors';
import {
  TelegramMtprotoClientFactory,
  type TelegramMtprotoConnectionConfig,
} from './telegram-mtproto-client.factory';
import type {
  TelegramConnectionErrorCategory,
  TelegramConnectionErrorStage,
  TelegramMtprotoConnectionSnapshot,
  TelegramMtprotoEnvelopeListener,
  TelegramMtprotoMessageEnvelope,
  TelegramRuntimeConnectionState,
} from './telegram.types';

interface TelegramMtprotoRecoveryBatch {
  readonly envelopes: readonly TelegramMtprotoMessageEnvelope[];
  readonly truncated: boolean;
}

export interface TelegramMtprotoHistoryPage {
  readonly envelopes: readonly TelegramMtprotoMessageEnvelope[];
  readonly sourceChatId: string;
  readonly nextOffsetId: number | null;
  readonly exhausted: boolean;
  readonly fetched: number;
}

type TelegramMtprotoReconnectListener = (
  sourceChatId: string,
) => void | Promise<void>;

const CONNECTION_MONITOR_INTERVAL_MS = 1_000;
const RECONNECT_SUCCESS_GRACE_MS = 2_000;

interface TelegramResolvedSource {
  readonly entity: Entity;
  readonly chatId: string;
  readonly isChannel: boolean;
}

interface TelegramRuntimeConfig extends TelegramMtprotoConnectionConfig {
  readonly sourceChatId: string;
}

@Injectable()
export class TelegramMtprotoClient {
  private readonly logger = new Logger(TelegramMtprotoClient.name);

  private client: TelegramClient | undefined;
  private source: TelegramResolvedSource | undefined;
  private connectionPromise: Promise<TelegramResolvedSource> | undefined;
  private newMessageBuilder: NewMessage | undefined;
  private editedMessageBuilder: EditedMessage | undefined;
  private newMessageHandler: ((event: NewMessageEvent) => void) | undefined;
  private editedMessageHandler:
    ((event: EditedMessageEvent) => void) | undefined;
  private connectionMonitor: NodeJS.Timeout | undefined;
  private monitoredClient: TelegramClient | undefined;
  private connectionState: TelegramRuntimeConnectionState = 'DISCONNECTED';
  private connectionErrors = 0;
  private reconnectAttempts = 0;
  private reconnectSuccesses = 0;
  private lastConnectionErrorAt: string | null = null;
  private lastConnectionErrorCategory: TelegramConnectionErrorCategory | null =
    null;
  private lastConnectedAt: string | null = null;
  private lastDisconnectedAt: string | null = null;
  private reconnectStartedAt: number | null = null;
  private currentReconnectAttempt = 0;
  private reconnectObservedDisconnected = false;
  private lastHandledClientError: unknown;
  private readonly reconnectListeners =
    new Set<TelegramMtprotoReconnectListener>();

  constructor(
    private readonly configService: ConfigService,
    private readonly clientFactory: TelegramMtprotoClientFactory,
  ) {}

  isAvailable(): boolean {
    return this.getRuntimeConfig() !== undefined;
  }

  getConnectionSnapshot(): TelegramMtprotoConnectionSnapshot {
    return {
      connectionState: this.connectionState,
      connectionErrors: this.connectionErrors,
      reconnectAttempts: this.reconnectAttempts,
      reconnectSuccesses: this.reconnectSuccesses,
      lastConnectionErrorAt: this.lastConnectionErrorAt,
      lastConnectionErrorCategory: this.lastConnectionErrorCategory,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
    };
  }

  async getSourceChatId(): Promise<string> {
    return (await this.connect()).chatId;
  }

  async connect(): Promise<TelegramResolvedSource> {
    if (this.source !== undefined) {
      return this.source;
    }

    if (this.connectionPromise !== undefined) {
      return this.connectionPromise;
    }

    const config = this.getRuntimeConfig();

    if (config === undefined) {
      throw new TelegramIntegrationError(
        'DISABLED',
        'Telegram integration is disabled because MTProto configuration is incomplete',
      );
    }

    this.connectionState = 'CONNECTING';

    const connection = this.initialize(config).finally(() => {
      if (this.connectionPromise === connection) {
        this.connectionPromise = undefined;
      }
    });
    this.connectionPromise = connection;

    return connection;
  }

  async getRecentMessages(
    limit = TELEGRAM_BOOTSTRAP_HISTORY_LIMIT,
  ): Promise<readonly TelegramMtprotoMessageEnvelope[]> {
    const source = await this.connect();
    const client = this.requireClient();
    const normalizedLimit = Number.isFinite(limit)
      ? Math.trunc(limit)
      : TELEGRAM_BOOTSTRAP_HISTORY_LIMIT;
    const safeLimit = Math.min(
      TELEGRAM_MAX_HISTORY_LIMIT,
      Math.max(1, normalizedLimit),
    );

    try {
      const messages = await client.getMessages(source.entity, {
        limit: safeLimit,
      });

      return messages.map((message) =>
        this.createEnvelope(message, source, hasEditDate(message)),
      );
    } catch {
      this.logger.warn('Telegram MTProto history fetch failed');

      throw new TelegramIntegrationError(
        'CONNECTION_ERROR',
        'Telegram MTProto history fetch failed',
      );
    }
  }

  /**
   * Development/history tooling only. Runtime ingestion deliberately keeps
   * using the bounded getRecentMessages/getMessagesAfter methods above.
   */
  async getHistoryPage(
    limit: number,
    offsetId?: number,
  ): Promise<TelegramMtprotoHistoryPage> {
    const source = await this.connect();
    const client = this.requireClient();
    const safeLimit = Math.max(1, Math.trunc(limit));

    try {
      const messages = await client.getMessages(source.entity, {
        limit: safeLimit,
        ...(offsetId === undefined ? {} : { offsetId }),
      });
      const messageIds = messages
        .map((message) => message.id)
        .filter((id): id is number => Number.isSafeInteger(id) && id > 0);
      const nextOffsetId =
        messageIds.length === 0 ? null : Math.min(...messageIds);

      return {
        envelopes: messages.map((message) =>
          this.createEnvelope(message, source, hasEditDate(message)),
        ),
        sourceChatId: source.chatId,
        nextOffsetId,
        exhausted: messages.length < safeLimit || nextOffsetId === null,
        fetched: messages.length,
      };
    } catch {
      this.logger.warn('Telegram MTProto historical page fetch failed');

      throw new TelegramIntegrationError(
        'CONNECTION_ERROR',
        'Telegram MTProto historical page fetch failed',
      );
    }
  }

  async getMessagesAfter(
    lastMessageId: string,
    limit: number,
  ): Promise<TelegramMtprotoRecoveryBatch> {
    const source = await this.connect();
    const client = this.requireClient();
    const cursorMessageId = parseTelegramMessageId(lastMessageId);
    const safeLimit = Math.min(
      TELEGRAM_RECOVERY_MAX_MESSAGES,
      Math.max(1, Math.trunc(limit)),
    );
    const minId = Math.max(
      0,
      cursorMessageId - TELEGRAM_RECOVERY_CURSOR_OVERLAP,
    );

    try {
      const messages = await client.getMessages(source.entity, {
        limit: safeLimit + 1,
        minId,
        reverse: true,
      });
      const truncated = messages.length > safeLimit;
      const bounded = truncated ? messages.slice(0, safeLimit) : messages;

      return {
        envelopes: bounded.map((message) =>
          this.createEnvelope(message, source, hasEditDate(message)),
        ),
        truncated,
      };
    } catch {
      this.logger.warn('Telegram MTProto recovery history fetch failed');

      throw new TelegramIntegrationError(
        'CONNECTION_ERROR',
        'Telegram MTProto recovery history fetch failed',
      );
    }
  }

  onReconnected(listener: TelegramMtprotoReconnectListener): () => void {
    this.reconnectListeners.add(listener);

    return () => {
      this.reconnectListeners.delete(listener);
    };
  }

  async subscribe(listener: TelegramMtprotoEnvelopeListener): Promise<void> {
    const source = await this.connect();
    const client = this.requireClient();

    this.unsubscribe();

    const newMessageBuilder = new NewMessage({ chats: [source.chatId] });
    const editedMessageBuilder = new EditedMessage({ chats: [source.chatId] });
    const newMessageHandler = (event: NewMessageEvent): void => {
      const envelope = this.createEnvelope(event.message, source, false);

      if (envelope.chatId === source.chatId) {
        void this.dispatchEnvelope(listener, envelope);
      }
    };
    const editedMessageHandler = (event: EditedMessageEvent): void => {
      const envelope = this.createEnvelope(event.message, source, true);

      if (envelope.chatId === source.chatId) {
        void this.dispatchEnvelope(listener, envelope);
      }
    };

    try {
      await Promise.all([
        newMessageBuilder.resolve(client),
        editedMessageBuilder.resolve(client),
      ]);
      client.addEventHandler(newMessageHandler, newMessageBuilder);
      client.addEventHandler(editedMessageHandler, editedMessageBuilder);
    } catch {
      client.removeEventHandler(newMessageHandler, newMessageBuilder);
      client.removeEventHandler(editedMessageHandler, editedMessageBuilder);
      this.logger.warn('Telegram MTProto live subscription failed');

      throw new TelegramIntegrationError(
        'CONNECTION_ERROR',
        'Telegram MTProto live subscription failed',
      );
    }

    this.newMessageBuilder = newMessageBuilder;
    this.editedMessageBuilder = editedMessageBuilder;
    this.newMessageHandler = newMessageHandler;
    this.editedMessageHandler = editedMessageHandler;
  }

  unsubscribe(): void {
    if (this.client !== undefined) {
      if (
        this.newMessageHandler !== undefined &&
        this.newMessageBuilder !== undefined
      ) {
        this.client.removeEventHandler(
          this.newMessageHandler,
          this.newMessageBuilder,
        );
      }

      if (
        this.editedMessageHandler !== undefined &&
        this.editedMessageBuilder !== undefined
      ) {
        this.client.removeEventHandler(
          this.editedMessageHandler,
          this.editedMessageBuilder,
        );
      }
    }

    this.newMessageBuilder = undefined;
    this.editedMessageBuilder = undefined;
    this.newMessageHandler = undefined;
    this.editedMessageHandler = undefined;
  }

  async disconnect(): Promise<void> {
    const pendingConnection = this.connectionPromise;

    if (pendingConnection !== undefined) {
      await pendingConnection.catch(() => undefined);
    }

    this.unsubscribe();
    this.stopConnectionMonitor();

    const client = this.client;
    this.client = undefined;
    this.source = undefined;
    this.connectionPromise = undefined;

    this.connectionState = 'DISCONNECTED';
    this.lastDisconnectedAt = new Date().toISOString();

    if (client === undefined) {
      return;
    }

    try {
      await client.disconnect();
    } catch (error: unknown) {
      this.recordConnectionError(error, 'DISCONNECT');
    }
  }

  private async initialize(
    config: TelegramRuntimeConfig,
  ): Promise<TelegramResolvedSource> {
    let client: TelegramClient;

    try {
      client = this.clientFactory.create(config);
    } catch (error: unknown) {
      this.recordConnectionError(error, 'CONNECT');
      this.connectionState = 'ERROR';

      throw new TelegramIntegrationError(
        'INVALID_SESSION',
        'Telegram MTProto session is invalid',
      );
    }

    this.client = client;
    client.onError = (error: Error) => {
      this.recordConnectionError(error, this.getConnectionErrorStage());
      this.lastHandledClientError = error;

      return Promise.resolve();
    };

    try {
      await client.connect();
    } catch (error) {
      await this.clearFailedClient(client);

      if (this.lastHandledClientError !== error) {
        this.recordConnectionError(error, 'CONNECT');
      }

      this.lastHandledClientError = undefined;
      this.connectionState = 'ERROR';

      if (isInvalidSessionError(error)) {
        throw new TelegramIntegrationError(
          'INVALID_SESSION',
          'Telegram MTProto session is invalid',
        );
      }

      throw new TelegramIntegrationError(
        'CONNECTION_ERROR',
        'Telegram MTProto connection failed',
      );
    }

    let authorized: boolean;

    try {
      authorized = await client.checkAuthorization();
    } catch (error: unknown) {
      await this.clearFailedClient(client);
      this.recordConnectionError(error, 'CONNECT');
      this.connectionState = 'ERROR';

      throw new TelegramIntegrationError(
        'INVALID_SESSION',
        'Telegram MTProto session could not be verified',
      );
    }

    if (!authorized) {
      await this.clearFailedClient(client);
      this.connectionState = 'ERROR';

      throw new TelegramIntegrationError(
        'AUTH_FAILED',
        'Telegram MTProto session is not authorized',
      );
    }

    let entity: Entity;

    try {
      entity = await resolveSourceEntity(client, config.sourceChatId);
    } catch {
      await this.clearFailedClient(client);
      this.connectionState = 'ERROR';

      throw new TelegramIntegrationError(
        'SOURCE_NOT_FOUND',
        'Configured Telegram source could not be resolved',
      );
    }

    const source = {
      entity,
      chatId: utils.getPeerId(entity),
      isChannel: entity instanceof Api.Channel && entity.broadcast === true,
    } satisfies TelegramResolvedSource;

    this.source = source;
    this.markConnected();
    this.startConnectionMonitor(client);

    return source;
  }

  private getConnectionErrorStage(): TelegramConnectionErrorStage {
    if (this.connectionState === 'CONNECTING') {
      return 'CONNECT';
    }

    if (this.connectionState === 'RUNNING_RECONNECTING') {
      return 'RECONNECT';
    }

    if (this.connectionState === 'RUNNING_CONNECTED') {
      return 'KEEPALIVE';
    }

    if (this.connectionState === 'DISCONNECTED') {
      return 'DISCONNECT';
    }

    return 'UNKNOWN';
  }

  private recordConnectionError(
    error: unknown,
    stage: TelegramConnectionErrorStage,
  ): void {
    const now = Date.now();
    const category = classifyTelegramConnectionError(error);
    this.connectionErrors += 1;
    this.lastConnectionErrorAt = new Date(now).toISOString();
    this.lastConnectionErrorCategory = category;

    if (stage === 'KEEPALIVE' || stage === 'RECONNECT') {
      if (this.reconnectStartedAt === null) {
        this.reconnectStartedAt = now;
      }

      this.currentReconnectAttempt += 1;
      this.reconnectAttempts += 1;
      this.reconnectObservedDisconnected = this.client?.connected === false;
      this.connectionState = 'RUNNING_RECONNECTING';
      this.lastDisconnectedAt = new Date(now).toISOString();
    }

    const details = createSafeConnectionErrorDetails(
      error,
      category,
      stage,
      this.connectionState,
      this.currentReconnectAttempt,
      this.getRuntimeConfig(),
    );

    this.logger.warn(
      `Telegram MTProto connection error ${JSON.stringify(details)}`,
    );
  }

  private startConnectionMonitor(client: TelegramClient): void {
    this.stopConnectionMonitor();
    this.monitoredClient = client;
    this.connectionMonitor = setInterval(() => {
      this.observeConnectionState(client);
    }, CONNECTION_MONITOR_INTERVAL_MS);
    this.connectionMonitor.unref();
  }

  private stopConnectionMonitor(): void {
    if (this.connectionMonitor !== undefined) {
      clearInterval(this.connectionMonitor);
      this.connectionMonitor = undefined;
    }

    this.monitoredClient = undefined;
  }

  private observeConnectionState(client: TelegramClient): void {
    if (this.monitoredClient !== client || this.client !== client) {
      return;
    }

    const connected = client.connected;

    if (this.connectionState === 'RUNNING_CONNECTED' && connected === false) {
      const now = Date.now();
      this.connectionState = 'RUNNING_RECONNECTING';
      this.reconnectStartedAt = now;
      this.currentReconnectAttempt = 1;
      this.reconnectAttempts += 1;
      this.reconnectObservedDisconnected = true;
      this.lastDisconnectedAt = new Date(now).toISOString();
      return;
    }

    if (this.connectionState !== 'RUNNING_RECONNECTING') {
      return;
    }

    if (connected === false) {
      this.reconnectObservedDisconnected = true;
      return;
    }

    const reconnectDuration =
      this.reconnectStartedAt === null
        ? 0
        : Date.now() - this.reconnectStartedAt;

    if (
      connected === true &&
      (this.reconnectObservedDisconnected ||
        reconnectDuration >= RECONNECT_SUCCESS_GRACE_MS)
    ) {
      this.markConnected();
    }
  }

  private markConnected(): void {
    const now = Date.now();
    const wasReconnecting = this.connectionState === 'RUNNING_RECONNECTING';
    const reconnectAttempt = this.currentReconnectAttempt;
    const downtimeMs =
      this.reconnectStartedAt === null ? 0 : now - this.reconnectStartedAt;

    this.connectionState = 'RUNNING_CONNECTED';
    this.lastConnectedAt = new Date(now).toISOString();

    if (wasReconnecting) {
      this.reconnectSuccesses += 1;
      this.logger.log(
        `Telegram MTProto reconnected ${JSON.stringify({
          reconnectAttempt,
          downtimeMs,
          connectionState: this.connectionState,
        })}`,
      );

      const sourceChatId = this.source?.chatId;

      if (sourceChatId !== undefined) {
        for (const listener of this.reconnectListeners) {
          void Promise.resolve(listener(sourceChatId)).catch(() => {
            this.logger.warn('Telegram MTProto reconnect handler failed');
          });
        }
      }
    }

    this.reconnectStartedAt = null;
    this.currentReconnectAttempt = 0;
    this.reconnectObservedDisconnected = false;
    this.lastHandledClientError = undefined;
  }

  private createEnvelope(
    message: Api.Message,
    source: TelegramResolvedSource,
    isEdited: boolean,
  ): TelegramMtprotoMessageEnvelope {
    let chatId = '';

    try {
      chatId = utils.getPeerId(message.peerId);
    } catch {
      // Invalid/empty MTProto messages are filtered by the source.
    }

    return {
      rawMessage: message,
      chatId,
      isChannel: source.isChannel,
      isEdited,
    };
  }

  private async dispatchEnvelope(
    listener: TelegramMtprotoEnvelopeListener,
    envelope: TelegramMtprotoMessageEnvelope,
  ): Promise<void> {
    try {
      await listener(envelope);
    } catch {
      this.logger.warn('Telegram MTProto message handler failed');
    }
  }

  private async clearFailedClient(client: TelegramClient): Promise<void> {
    this.stopConnectionMonitor();

    if (this.client === client) {
      this.client = undefined;
    }

    try {
      await client.disconnect();
    } catch {
      // The original controlled error remains the useful result.
    }
  }

  private requireClient(): TelegramClient {
    if (this.client === undefined) {
      throw new TelegramIntegrationError(
        'CONNECTION_ERROR',
        'Telegram MTProto client is not connected',
      );
    }

    return this.client;
  }

  private getRuntimeConfig(): TelegramRuntimeConfig | undefined {
    const apiIdText = this.getConfigValue('TELEGRAM_API_ID');
    const apiHash = this.getConfigValue('TELEGRAM_API_HASH');
    const session = this.getConfigValue('TELEGRAM_SESSION');
    const sourceChatId = this.getConfigValue('TELEGRAM_SOURCE_CHAT_ID');
    const apiId = Number(apiIdText);

    if (
      apiIdText.length === 0 ||
      apiHash.length === 0 ||
      session.length === 0 ||
      sourceChatId.length === 0 ||
      !Number.isSafeInteger(apiId) ||
      apiId <= 0
    ) {
      return undefined;
    }

    return { apiId, apiHash, session, sourceChatId };
  }

  private getConfigValue(key: string): string {
    return this.configService.get<string>(key)?.trim() ?? '';
  }
}

const resolveSourceEntity = async (
  client: TelegramClient,
  sourceChatId: string,
): Promise<Entity> => {
  if (!/^-?\d+$/u.test(sourceChatId)) {
    return client.getEntity(sourceChatId);
  }

  const markedId = helpers.returnBigInt(sourceChatId);
  const canonicalChatId = markedId.toString();
  const peer = markedIdToPeer(markedId);

  try {
    const entity = await client.getEntity(peer);

    if (utils.getPeerId(entity) === canonicalChatId) {
      return entity;
    }
  } catch {
    // A StringSession may not contain the channel access hash until dialogs
    // have populated GramJS' entity cache.
  }

  const dialogs = await client.getDialogs({ limit: undefined });
  const matchingDialog = dialogs.find(
    (dialog) => dialog.id?.toString() === canonicalChatId,
  );

  if (matchingDialog?.entity === undefined) {
    throw new Error('Configured Telegram source is not present in dialogs');
  }

  return matchingDialog.entity;
};

const markedIdToPeer = (
  markedId: ReturnType<typeof helpers.returnBigInt>,
): EntityLike => {
  const [id, peerType] = utils.resolveId(markedId);

  if (peerType === Api.PeerChannel) {
    return new Api.PeerChannel({ channelId: id });
  }

  if (peerType === Api.PeerChat) {
    return new Api.PeerChat({ chatId: id });
  }

  return new Api.PeerUser({ userId: id });
};

const hasEditDate = (message: Api.Message): boolean =>
  message.editDate !== null && message.editDate !== undefined;

const parseTelegramMessageId = (value: string): number => {
  const messageId = Number(value);

  if (!Number.isSafeInteger(messageId) || messageId < 0) {
    throw new TelegramIntegrationError(
      'CONNECTION_ERROR',
      'Telegram recovery cursor is invalid',
    );
  }

  return messageId;
};

const isInvalidSessionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /AUTH_KEY|SESSION_REVOKED|USER_DEACTIVATED/u.test(
    `${error.name} ${error.message}`,
  );
};

export const classifyTelegramConnectionError = (
  error: unknown,
): TelegramConnectionErrorCategory => {
  const name = readErrorText(error, 'name').toUpperCase();
  const constructorName = getErrorConstructorName(error).toUpperCase();
  const code = readErrorText(error, 'code').toUpperCase();
  const message = readErrorText(error, 'message').toUpperCase();
  const searchable = `${name} ${constructorName} ${code} ${message}`;

  if (
    /AUTH_KEY|AUTH_FAILED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|UNAUTHORIZED/u.test(
      searchable,
    )
  ) {
    return 'AUTH';
  }

  if (/FLOOD(?:_WAIT)?|PEER_FLOOD/u.test(searchable)) {
    return 'FLOOD';
  }

  if (code === 'ETIMEDOUT' || /\bTIME(?:D?\s*OUT|OUT)\b/u.test(searchable)) {
    return 'TIMEOUT';
  }

  if (
    code === 'ECONNRESET' ||
    /CONNECTION RESET|SOCKET HANG UP/u.test(searchable)
  ) {
    return 'CONNECTION_RESET';
  }

  if (
    ['ECONNABORTED', 'EPIPE'].includes(code) ||
    /CONNECTION (?:IS )?CLOSED|NOT CONNECTED/u.test(searchable)
  ) {
    return 'CONNECTION_CLOSED';
  }

  if (
    ['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL'].includes(code) ||
    /GETADDRINFO|DNS/u.test(searchable)
  ) {
    return 'DNS';
  }

  if (/RPCERROR|RPC_ERROR|RPC CALL/u.test(searchable)) {
    return 'RPC';
  }

  if (
    [
      'ECONNREFUSED',
      'ENETDOWN',
      'ENETUNREACH',
      'EHOSTDOWN',
      'EHOSTUNREACH',
    ].includes(code) ||
    /NETWORK|SOCKET/u.test(searchable)
  ) {
    return 'NETWORK';
  }

  return 'UNKNOWN';
};

interface SafeConnectionErrorDetails {
  readonly category: TelegramConnectionErrorCategory;
  readonly name: string;
  readonly message: string;
  readonly stage: TelegramConnectionErrorStage;
  readonly connectionState: TelegramRuntimeConnectionState;
  readonly reconnectAttempt: number;
  readonly code?: string | number;
  readonly errno?: string | number;
  readonly syscall?: string;
  readonly address?: string;
}

const createSafeConnectionErrorDetails = (
  error: unknown,
  category: TelegramConnectionErrorCategory,
  stage: TelegramConnectionErrorStage,
  connectionState: TelegramRuntimeConnectionState,
  reconnectAttempt: number,
  config: TelegramRuntimeConfig | undefined,
): SafeConnectionErrorDetails => {
  const code = readSafeScalar(error, 'code');
  const errno = readSafeScalar(error, 'errno');
  const syscall = readSafeToken(error, 'syscall');
  const addressCandidate =
    readSafeToken(error, 'address') || readSafeToken(error, 'host');
  const address = isSafeTelegramAddress(addressCandidate)
    ? addressCandidate
    : undefined;

  return {
    category,
    name: getSafeErrorName(error),
    message: sanitizeErrorMessage(
      readErrorText(error, 'message') || String(error),
      config,
    ),
    stage,
    connectionState,
    reconnectAttempt,
    ...(code === undefined ? {} : { code }),
    ...(errno === undefined ? {} : { errno }),
    ...(syscall === undefined ? {} : { syscall }),
    ...(address === undefined ? {} : { address }),
  };
};

const sanitizeErrorMessage = (
  message: string,
  config: TelegramRuntimeConfig | undefined,
): string => {
  let safeMessage = message.replace(/[\r\n\t]+/gu, ' ').trim();
  const secrets = config
    ? [config.session, config.apiHash, String(config.apiId)]
    : [];

  for (const secret of secrets) {
    if (secret.length > 0) {
      safeMessage = safeMessage.split(secret).join('[REDACTED]');
    }
  }

  safeMessage = safeMessage
    .replace(/(?:\+?\d[\d ()-]{8,}\d)/gu, '[REDACTED_PHONE]')
    .replace(
      /((?:auth[_ -]?key|session|api[_ -]?hash)\s*[:=]\s*)\S+/giu,
      '$1[REDACTED]',
    );

  return safeMessage.slice(0, 240) || 'Unknown connection error';
};

const getSafeErrorName = (error: unknown): string => {
  const candidate =
    readErrorText(error, 'name') || getErrorConstructorName(error);

  return /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u.test(candidate)
    ? candidate
    : 'Error';
};

const getErrorConstructorName = (error: unknown): string => {
  if (!isObject(error)) {
    return '';
  }

  const constructor: unknown = error.constructor;

  return typeof constructor === 'function' ? constructor.name : '';
};

const readErrorText = (error: unknown, field: string): string => {
  if (!isObject(error)) {
    return '';
  }

  const value = (error as Record<string, unknown>)[field];

  return typeof value === 'string' ? value : '';
};

const readSafeScalar = (
  error: unknown,
  field: string,
): string | number | undefined => {
  if (!isObject(error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[field];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^[A-Za-z0-9_.:+-]{1,80}$/u.test(value)) {
    return value;
  }

  return undefined;
};

const readSafeToken = (error: unknown, field: string): string | undefined => {
  const value = readSafeScalar(error, field);

  return typeof value === 'string' ? value : undefined;
};

const isSafeTelegramAddress = (address: string | undefined): boolean => {
  if (address === undefined) {
    return false;
  }

  if (/^[0-9a-f:]+$/iu.test(address) && address.includes(':')) {
    return true;
  }

  if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(address)) {
    return address
      .split('.')
      .every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
  }

  return /^(?:[a-z0-9-]+\.)*telegram\.org$/iu.test(address);
};

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;
