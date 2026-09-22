export type TelegramRawSourceType =
  'message' | 'edited_message' | 'channel_post' | 'edited_channel_post';

export interface TelegramMessage {
  readonly externalId: string;
  readonly source: 'TELEGRAM';
  readonly cityId: string;
  readonly chatId: string;
  readonly text: string;
  readonly publishedAt: string;
  readonly editedAt?: string;
  readonly authorName?: string;
  readonly replyToExternalId?: string;
  readonly rawSourceType: TelegramRawSourceType;
}

export type TelegramMessageListener = (
  message: TelegramMessage,
) => void | Promise<void>;

export type TelegramIngestionSource = 'LIVE' | 'RECOVERY';

export interface TelegramSourceCursor {
  readonly cityId: string;
  readonly sourceChatId: string;
  readonly lastMessageId: string;
  readonly lastMessageTimestamp: string | null;
}

export interface TelegramRecoveryBatch {
  readonly messages: readonly TelegramMessage[];
  readonly truncated: boolean;
}

export type TelegramReconnectListener = (
  source: TelegramCitySource,
) => void | Promise<void>;

export interface TelegramMessageSource {
  isAvailable(): boolean;
  getConnectionSnapshot(): TelegramMtprotoConnectionSnapshot;
  getSourceChatId(): Promise<string>;
  getCitySources(): Promise<readonly TelegramCitySource[]>;
  getRecentMessages(limit?: number): Promise<readonly TelegramMessage[]>;
  getMessagesAfter(
    source: TelegramCitySource,
    cursor: TelegramSourceCursor,
    limit: number,
  ): Promise<TelegramRecoveryBatch>;
  onReconnected(listener: TelegramReconnectListener): () => void;
  start(listener: TelegramMessageListener): Promise<void>;
  stop(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface TelegramCitySource {
  readonly cityId: string;
  readonly sourceChatId: string;
}

export interface TelegramMtprotoMessageEnvelope {
  readonly rawMessage: unknown;
  readonly chatId: string;
  readonly isChannel: boolean;
  readonly isEdited: boolean;
}

export type TelegramMtprotoEnvelopeListener = (
  envelope: TelegramMtprotoMessageEnvelope,
) => void | Promise<void>;

export type TelegramConnectionErrorCategory =
  | 'TIMEOUT'
  | 'CONNECTION_RESET'
  | 'CONNECTION_CLOSED'
  | 'DNS'
  | 'AUTH'
  | 'FLOOD'
  | 'RPC'
  | 'NETWORK'
  | 'UNKNOWN';

export type TelegramConnectionErrorStage =
  'CONNECT' | 'KEEPALIVE' | 'RECONNECT' | 'DISCONNECT' | 'UNKNOWN';

export type TelegramRuntimeConnectionState =
  | 'CONNECTING'
  | 'RUNNING_CONNECTED'
  | 'RUNNING_RECONNECTING'
  | 'DISCONNECTED'
  | 'ERROR';

export interface TelegramMtprotoConnectionSnapshot {
  readonly connectionState: TelegramRuntimeConnectionState;
  readonly connectionErrors: number;
  readonly reconnectAttempts: number;
  readonly reconnectSuccesses: number;
  readonly lastConnectionErrorAt: string | null;
  readonly lastConnectionErrorCategory: TelegramConnectionErrorCategory | null;
  readonly lastConnectedAt: string | null;
  readonly lastDisconnectedAt: string | null;
}
