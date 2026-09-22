import type { TelegramMessage } from '../telegram.types';

export interface TelegramHistoryCorpusMetadata {
  readonly schemaVersion: 1;
  readonly cityId: string;
  readonly sourceChatId: string;
  readonly requested: number;
  readonly saved: number;
  readonly fetchedFromTelegram: number;
  readonly pagesFetched: number;
  readonly afterSourceFiltering: number;
  readonly oldestMessageId: number | null;
  readonly newestMessageId: number | null;
  readonly status: 'FULL' | 'PARTIAL';
  readonly historyExhausted: boolean;
  readonly updatedAt: string;
  readonly errorCode?: string;
}

export interface TelegramHistoryFetchProgress {
  readonly page: number;
  readonly fetched: number;
  readonly accepted: number;
  readonly saved: number;
}

export interface TelegramHistoryFetchResult {
  readonly messages: readonly TelegramMessage[];
  readonly metadata: TelegramHistoryCorpusMetadata;
}
