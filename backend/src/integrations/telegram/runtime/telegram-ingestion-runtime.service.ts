import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TelegramDryRunIngestionPipeline } from '../ingestion/telegram-dry-run-ingestion.pipeline';
import { TELEGRAM_INGESTION_SUPPORTED_EVENT_TYPES } from '../ingestion/telegram-ingestion.constants';
import type {
  NormalizedTelegramEvent,
  TelegramDryRunIngestionResult,
  TelegramIngestionDecision,
} from '../ingestion/telegram-ingestion.types';
import { TelegramRoadEventRealtimeBridge } from '../persistence/telegram-road-event-realtime.bridge';
import type { TelegramPersistenceResult } from '../persistence/telegram-ingestion-persistence.types';
import {
  TELEGRAM_RECOVERY_MAX_MESSAGES,
  TELEGRAM_RUNTIME_DEDUP_LIMIT,
} from '../telegram.constants';
import { TelegramIntegrationError } from '../telegram.errors';
import { TelegramMtprotoSource } from '../telegram-mtproto.source';
import type {
  TelegramCitySource,
  TelegramIngestionSource,
  TelegramMessage,
  TelegramSourceCursor,
} from '../telegram.types';

import {
  TELEGRAM_INGESTION_ENABLED_ENV,
  TELEGRAM_RUNTIME_CONTEXT_SEED_LIMIT,
  TELEGRAM_RUNTIME_SHUTDOWN_TIMEOUT_MS,
} from './telegram-ingestion-runtime.constants';
import type {
  TelegramIngestionRuntimeCounters,
  TelegramIngestionRuntimeSnapshot,
  TelegramIngestionRuntimeStatus,
} from './telegram-ingestion-runtime.types';
import { TelegramRuntimeReviewLogger } from './telegram-runtime-review.logger';
import { TelegramRuntimeContextStore } from './telegram-runtime-context.store';
import { TelegramSourceCursorStore } from './telegram-source-cursor.store';
import { DpsActivityTracker } from '../../../road-events/dps-activity-tracker.service';

type MutableCounters = {
  -readonly [
    Key in keyof TelegramIngestionRuntimeCounters
  ]: TelegramIngestionRuntimeCounters[Key];
};

@Injectable()
export class TelegramIngestionRuntimeService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramIngestionRuntimeService.name);
  private readonly counters: MutableCounters = createCounters();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly processedVersions = new Map<string, string>();
  private readonly sourceQueues = new Map<string, Promise<void>>();
  private readonly cursors = new Map<string, TelegramSourceCursor>();
  private readonly recoveryRequired = new Set<string>();
  private readonly failedVersions = new Map<
    string,
    {
      readonly identity: string;
      readonly version: string;
      readonly messageId: bigint;
    }
  >();
  private nextTaskId = 0;

  private status: TelegramIngestionRuntimeStatus = 'DISABLED';
  private citySources: readonly TelegramCitySource[] = [];
  private removeReconnectListener: (() => void) | null = null;
  private startupPromise: Promise<void> | null = null;
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly source: TelegramMtprotoSource,
    private readonly pipeline: TelegramDryRunIngestionPipeline,
    private readonly realtimeBridge: TelegramRoadEventRealtimeBridge,
    private readonly context: TelegramRuntimeContextStore,
    private readonly reviewLogger: TelegramRuntimeReviewLogger,
    private readonly cursorStore: TelegramSourceCursorStore,
    private readonly dpsActivityTracker: DpsActivityTracker,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return this.start();
  }

  onModuleDestroy(): Promise<void> {
    return this.shutdown();
  }

  start(): Promise<void> {
    if (this.startupPromise !== null) {
      return this.startupPromise;
    }

    if (this.status === 'RUNNING') {
      return Promise.resolve();
    }

    this.startupPromise = this.startInternal().finally(() => {
      this.startupPromise = null;
    });

    return this.startupPromise;
  }

  async handleMessage(message: TelegramMessage): Promise<void> {
    this.counters.received += 1;

    if (
      (this.status !== 'RUNNING' && this.status !== 'STARTING') ||
      !this.isConfiguredSource(message)
    ) {
      this.counters.ignored += 1;
      return;
    }

    const source = this.findSource(message);

    if (source === undefined) {
      this.counters.ignored += 1;
      return;
    }

    await this.enqueueSourceTask(source, async () => {
      if (this.recoveryRequired.has(sourceKey(source))) {
        try {
          await this.recoverSource(source);
        } catch (error: unknown) {
          this.recordRecoveryFailure(source, error);
          return;
        }

        if (this.recoveryRequired.has(sourceKey(source))) {
          return;
        }
      }

      await this.processAcceptedMessage(source, message, 'LIVE');
    }).catch((error: unknown) => {
      this.recordProcessingFailure(message, error);
    });
  }

  getSnapshot(): TelegramIngestionRuntimeSnapshot {
    return {
      status: this.status,
      connection: this.source.getConnectionSnapshot(),
      counters: { ...this.counters },
      inFlight: this.inFlight.size,
    };
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise !== null) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.shutdownInternal();

    return this.shutdownPromise;
  }

  private async startInternal(): Promise<void> {
    if (!this.isEnabled()) {
      this.status = 'DISABLED';
      return;
    }

    if (!this.source.isAvailable()) {
      this.status = 'DISABLED';
      this.logger.warn(
        'Telegram ingestion runtime disabled because MTProto configuration is incomplete',
      );
      return;
    }

    this.status = 'STARTING';

    try {
      await this.reviewLogger.initialize();
      this.citySources = await this.source.getCitySources();

      if (this.citySources.length === 0) {
        throw new Error('No Telegram city source is configured');
      }
      const history = await this.source.getRecentMessages(
        TELEGRAM_RUNTIME_CONTEXT_SEED_LIMIT,
      );

      this.context.seed(history);

      for (const source of this.citySources) {
        const cursor = await this.cursorStore.get(source);

        if (cursor === null) {
          const baseline = latestMessageForSource(history, source);
          const initialized = await this.cursorStore.initialize(
            source,
            baseline,
          );
          this.cursors.set(sourceKey(source), initialized);
        } else {
          this.cursors.set(sourceKey(source), cursor);
          this.recoveryRequired.add(sourceKey(source));
        }
      }

      this.removeReconnectListener = this.source.onReconnected((source) => {
        this.recoveryRequired.add(sourceKey(source));

        return this.requestRecovery(source);
      });

      await this.source.start((message) => this.handleMessage(message));
      this.status = 'RUNNING';

      await Promise.all(
        this.citySources.map((source) => this.requestRecovery(source)),
      );
      this.logger.log('Telegram ingestion runtime started');
    } catch (error: unknown) {
      this.status = 'ERROR';
      this.removeReconnectListener?.();
      this.removeReconnectListener = null;
      this.logger.error(
        `Telegram ingestion runtime startup failed stage=STARTUP code=${safeErrorCode(error)}`,
      );
      await this.source.stop().catch(() => undefined);
      await this.source.disconnect().catch(() => undefined);
    }
  }

  private async processMessage(
    message: TelegramMessage,
    ingestionSource: TelegramIngestionSource,
  ): Promise<void> {
    this.counters.normalized += 1;
    const input = this.context.buildInput(message);

    const result = await this.pipeline.process(input);

    if (result.parserResult.matched) {
      this.counters.matched += 1;
    }

    for (const event of result.events) {
      let persistenceResult: TelegramPersistenceResult | null = null;

      try {
        persistenceResult = await this.processEvent(event);
      } finally {
        await this.writeReviewLog(
          message,
          result.parserResult,
          event,
          persistenceResult,
          ingestionSource,
        );
      }
    }

    this.context.remember(message);
  }

  private async writeReviewLog(
    message: TelegramMessage,
    parserResult: TelegramDryRunIngestionResult['parserResult'],
    event: NormalizedTelegramEvent,
    persistenceResult: TelegramPersistenceResult | null,
    ingestionSource: TelegramIngestionSource,
  ): Promise<void> {
    await this.reviewLogger
      .record({
        message,
        ingestionSource,
        parserResult,
        event,
        persistenceResult,
      })
      .catch(() => {
        this.logger.warn('Telegram review log write failed');
      });
  }

  private async processEvent(
    event: NormalizedTelegramEvent,
  ): Promise<TelegramPersistenceResult | null> {
    this.trackDpsObservation(event);

    if (!TELEGRAM_INGESTION_SUPPORTED_EVENT_TYPES.includes(event.eventType)) {
      this.counters.ignored += 1;
      return null;
    }

    if (event.decision === 'IGNORE') {
      this.counters.ignored += 1;
      return null;
    }

    if (event.decision === 'REVIEW') {
      this.counters.reviewed += 1;
      return null;
    }

    this.countCandidate(event.decision);
    const result = await this.realtimeBridge.apply(event);

    this.countPersistence(result);
    this.logger.log(
      `Telegram ingestion externalId=${safeExternalId(event.externalId)} eventType=${event.eventType} decision=${event.decision} persistence=${result.status}`,
    );

    return result;
  }

  private trackDpsObservation(event: NormalizedTelegramEvent): void {
    if (event.eventType !== 'DPS') return;

    if (
      event.decision === 'REVIEW' &&
      event.state === 'ACTIVE' &&
      [
        'LOCATION_NOT_FOUND',
        'LOCATION_AMBIGUOUS',
        'MISSING_COORDINATES',
      ].includes(event.reason)
    ) {
      this.dpsActivityTracker.recordUnlocated({
        cityId: event.cityId,
        externalId: event.externalId,
        observedAt: event.messageVersion ?? event.timestamp,
      });
      return;
    }

    if (['CREATE', 'UPDATE', 'RESOLVE'].includes(event.decision)) {
      this.dpsActivityTracker.clear(event.externalId);
    }
  }

  private countCandidate(decision: TelegramIngestionDecision): void {
    if (decision === 'CREATE') this.counters.createCandidates += 1;
    else if (decision === 'UPDATE') this.counters.updateCandidates += 1;
    else if (decision === 'RESOLVE') this.counters.resolveCandidates += 1;
  }

  private countPersistence(result: TelegramPersistenceResult): void {
    if (result.status === 'CREATED') this.counters.created += 1;
    else if (result.status === 'UPDATED') this.counters.updated += 1;
    else if (result.status === 'RESOLVED') this.counters.resolved += 1;
    else if (result.status === 'REVIEW') this.counters.reviewed += 1;
    else this.counters.noop += 1;
  }

  private rememberVersion(identity: string, version: string): void {
    this.processedVersions.delete(identity);
    this.processedVersions.set(identity, version);

    if (this.processedVersions.size <= TELEGRAM_RUNTIME_DEDUP_LIMIT) {
      return;
    }

    const oldest = this.processedVersions.keys().next().value as
      string | undefined;

    if (oldest !== undefined) {
      this.processedVersions.delete(oldest);
    }
  }

  private async shutdownInternal(): Promise<void> {
    if (this.status !== 'DISABLED' && this.status !== 'STOPPED') {
      this.status = 'STOPPING';
    }

    this.removeReconnectListener?.();
    this.removeReconnectListener = null;
    await this.source.stop().catch(() => undefined);
    await waitForInflight(this.inFlight, TELEGRAM_RUNTIME_SHUTDOWN_TIMEOUT_MS);
    await this.source.disconnect().catch(() => undefined);
    this.citySources = [];
    this.cursors.clear();
    this.recoveryRequired.clear();
    this.failedVersions.clear();
    this.status = 'STOPPED';
  }

  private requestRecovery(source: TelegramCitySource): Promise<void> {
    if (!this.recoveryRequired.has(sourceKey(source))) {
      return Promise.resolve();
    }

    return this.enqueueSourceTask(source, async () => {
      if (this.recoveryRequired.has(sourceKey(source))) {
        await this.recoverSource(source);
      }
    }).catch((error: unknown) => {
      this.recordRecoveryFailure(source, error);
    });
  }

  private async recoverSource(source: TelegramCitySource): Promise<void> {
    const key = sourceKey(source);
    const cursor =
      this.cursors.get(key) ?? (await this.cursorStore.get(source));

    if (cursor === null) {
      return;
    }

    this.cursors.set(key, cursor);
    this.logger.log(
      `Telegram recovery started city=${safeLogValue(source.cityId)} fromMessage=${safeLogValue(cursor.lastMessageId)}`,
    );

    const batch = await this.source.getMessagesAfter(
      source,
      cursor,
      TELEGRAM_RECOVERY_MAX_MESSAGES,
    );
    let processed = 0;
    let duplicates = 0;

    try {
      for (const message of batch.messages) {
        if (this.isBlockedByFailedVersion(source, message)) {
          break;
        }

        const accepted = await this.processAcceptedMessage(
          source,
          message,
          'RECOVERY',
        );

        if (accepted) processed += 1;
        else duplicates += 1;
      }
    } catch (error: unknown) {
      this.recoveryRequired.add(key);
      this.logger.warn(
        `Telegram recovery incomplete city=${safeLogValue(source.cityId)} fetched=${batch.messages.length} processed=${processed} duplicates=${duplicates} failed=1 cursor=${safeLogValue(this.cursors.get(key)?.lastMessageId ?? cursor.lastMessageId)}`,
      );
      throw error;
    }

    if (this.failedVersions.has(key)) {
      this.recoveryRequired.add(key);
      this.logger.warn(
        `Telegram recovery incomplete city=${safeLogValue(source.cityId)} fetched=${batch.messages.length} processed=${processed} duplicates=${duplicates} failed=1 cursor=${safeLogValue(this.cursors.get(key)?.lastMessageId ?? cursor.lastMessageId)}`,
      );
      return;
    }

    if (batch.truncated) {
      this.recoveryRequired.add(key);

      this.logger.warn(
        `Telegram recovery truncated city=${safeLogValue(source.cityId)} maxMessages=${TELEGRAM_RECOVERY_MAX_MESSAGES}`,
      );
    } else {
      this.recoveryRequired.delete(key);
    }

    this.logger.log(
      `Telegram recovery complete city=${safeLogValue(source.cityId)} fetched=${batch.messages.length} processed=${processed} duplicates=${duplicates} failed=0 cursor=${safeLogValue(this.cursors.get(key)?.lastMessageId ?? cursor.lastMessageId)}`,
    );
  }

  private async processAcceptedMessage(
    source: TelegramCitySource,
    message: TelegramMessage,
    ingestionSource: TelegramIngestionSource,
  ): Promise<boolean> {
    const identity = `${message.chatId}:${message.externalId}`;
    const version = message.editedAt ?? message.publishedAt;

    if (
      this.processedVersions.get(identity) === version ||
      this.isCoveredByCursor(source, message)
    ) {
      this.counters.noop += 1;
      return false;
    }

    try {
      await this.processMessage(message, ingestionSource);
      const cursor = await this.cursorStore.advance(source, message);
      this.cursors.set(sourceKey(source), cursor);
      this.rememberVersion(identity, version);
      this.clearFailedVersion(source, identity, version);
    } catch (error: unknown) {
      this.rememberFailedVersion(source, identity, version);
      throw error;
    }

    return true;
  }

  private isCoveredByCursor(
    source: TelegramCitySource,
    message: TelegramMessage,
  ): boolean {
    const cursor = this.cursors.get(sourceKey(source));

    if (cursor === undefined) {
      return false;
    }

    const currentId = telegramMessageId(message);
    const cursorId = BigInt(cursor.lastMessageId);

    if (currentId > cursorId) {
      return false;
    }

    if (!isEditedMessage(message)) {
      return true;
    }

    if (currentId < cursorId || cursor.lastMessageTimestamp === null) {
      return false;
    }

    return (
      Date.parse(message.editedAt ?? message.publishedAt) <=
      Date.parse(cursor.lastMessageTimestamp)
    );
  }

  private enqueueSourceTask(
    source: TelegramCitySource,
    task: () => Promise<void>,
  ): Promise<void> {
    const key = sourceKey(source);
    const previous = this.sourceQueues.get(key) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(task);
    const taskId = `${key}:${this.nextTaskId++}`;
    const cleanup = (): void => {
      if (this.sourceQueues.get(key) === queued) {
        this.sourceQueues.delete(key);
      }

      this.inFlight.delete(taskId);
    };

    this.sourceQueues.set(key, queued);
    this.inFlight.set(taskId, queued);
    void queued.then(cleanup, cleanup);

    return queued;
  }

  private recordProcessingFailure(
    message: TelegramMessage,
    error: unknown,
  ): void {
    this.counters.errors += 1;
    const source = { cityId: message.cityId, sourceChatId: message.chatId };
    this.rememberFailedVersion(
      source,
      `${message.chatId}:${message.externalId}`,
      message.editedAt ?? message.publishedAt,
    );
    this.logger.error(
      `Telegram runtime message failed externalId=${safeExternalId(message.externalId)} stage=PROCESS code=${safeErrorCode(error)}`,
    );
  }

  private rememberFailedVersion(
    source: TelegramCitySource,
    identity: string,
    version: string,
  ): void {
    const key = sourceKey(source);
    this.failedVersions.set(key, {
      identity,
      version,
      messageId: telegramMessageIdFromIdentity(identity),
    });
    this.recoveryRequired.add(key);
  }

  private isBlockedByFailedVersion(
    source: TelegramCitySource,
    message: TelegramMessage,
  ): boolean {
    const failed = this.failedVersions.get(sourceKey(source));

    if (failed === undefined) {
      return false;
    }

    const identity = `${message.chatId}:${message.externalId}`;
    const version = message.editedAt ?? message.publishedAt;

    if (identity === failed.identity && version === failed.version) {
      return false;
    }

    return telegramMessageId(message) >= failed.messageId;
  }

  private clearFailedVersion(
    source: TelegramCitySource,
    identity: string,
    version: string,
  ): void {
    const key = sourceKey(source);
    const failed = this.failedVersions.get(key);

    if (failed?.identity === identity && failed.version === version) {
      this.failedVersions.delete(key);
    }
  }

  private recordRecoveryFailure(
    source: TelegramCitySource,
    error: unknown,
  ): void {
    this.counters.errors += 1;
    this.recoveryRequired.add(sourceKey(source));
    this.logger.warn(
      `Telegram recovery failed city=${safeLogValue(source.cityId)} stage=RECOVERY code=${safeErrorCode(error)}`,
    );
  }

  private isConfiguredSource(message: TelegramMessage): boolean {
    return this.findSource(message) !== undefined;
  }

  private findSource(message: TelegramMessage): TelegramCitySource | undefined {
    return this.citySources.find(
      (source) =>
        source.sourceChatId === message.chatId &&
        source.cityId === message.cityId,
    );
  }

  private isEnabled(): boolean {
    return (
      this.configService
        .get<string>(TELEGRAM_INGESTION_ENABLED_ENV)
        ?.trim()
        .toLowerCase() === 'true'
    );
  }
}

const createCounters = (): MutableCounters => ({
  received: 0,
  normalized: 0,
  matched: 0,
  ignored: 0,
  reviewed: 0,
  createCandidates: 0,
  updateCandidates: 0,
  resolveCandidates: 0,
  created: 0,
  updated: 0,
  resolved: 0,
  noop: 0,
  errors: 0,
});

const waitForInflight = async (
  inFlight: ReadonlyMap<string, Promise<void>>,
  timeoutMs: number,
): Promise<void> => {
  if (inFlight.size === 0) {
    return;
  }

  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, timeoutMs);
  });

  await Promise.race([
    Promise.allSettled([...inFlight.values()]).then(() => undefined),
    timeoutPromise,
  ]);

  if (timeout !== undefined) {
    clearTimeout(timeout);
  }
};

const safeExternalId = (externalId: string): string =>
  /^[A-Za-z0-9:_-]{1,180}$/u.test(externalId) ? externalId : 'redacted';

const safeErrorCode = (error: unknown): string => {
  if (error instanceof TelegramIntegrationError) {
    return error.code;
  }

  return error instanceof Error &&
    /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u.test(error.name)
    ? error.name
    : 'UNKNOWN_ERROR';
};

const sourceKey = (source: TelegramCitySource): string =>
  `${source.cityId}:${source.sourceChatId}`;

const latestMessageForSource = (
  history: readonly TelegramMessage[],
  source: TelegramCitySource,
): TelegramMessage | null =>
  history
    .filter(
      (message) =>
        message.cityId === source.cityId &&
        message.chatId === source.sourceChatId,
    )
    .reduce<TelegramMessage | null>(
      (latest, message) =>
        latest === null ||
        telegramMessageId(message) > telegramMessageId(latest)
          ? message
          : latest,
      null,
    );

const telegramMessageId = (message: TelegramMessage): bigint => {
  const rawId = message.externalId.slice(
    message.externalId.lastIndexOf(':') + 1,
  );

  return /^\d+$/u.test(rawId) ? BigInt(rawId) : -1n;
};

const telegramMessageIdFromIdentity = (identity: string): bigint => {
  const rawId = identity.slice(identity.lastIndexOf(':') + 1);

  return /^\d+$/u.test(rawId) ? BigInt(rawId) : -1n;
};

const isEditedMessage = (message: TelegramMessage): boolean =>
  message.rawSourceType === 'edited_message' ||
  message.rawSourceType === 'edited_channel_post';

const safeLogValue = (value: string): string =>
  /^[A-Za-z0-9:_-]{1,180}$/u.test(value) ? value : 'redacted';
