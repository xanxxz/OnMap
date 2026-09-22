import type {
  TelegramMtprotoClient,
  TelegramMtprotoHistoryPage,
} from '../telegram-mtproto.client';
import { normalizeTelegramMtprotoMessage } from '../telegram-mtproto.mapper';
import type { TelegramCitySourceRegistry } from '../telegram-city-source.registry';
import { TelegramIntegrationError } from '../telegram.errors';
import type { TelegramMessage } from '../telegram.types';
import {
  TELEGRAM_HISTORY_BATCH_SIZE,
  TELEGRAM_HISTORY_MAX_RETRIES,
  TELEGRAM_HISTORY_OPERATION_TIMEOUT_MS,
  TELEGRAM_HISTORY_RETRY_DELAY_MS,
} from './telegram-history.constants';
import { TelegramHistoryCorpusStore } from './telegram-history-corpus.store';
import type {
  TelegramHistoryFetchProgress,
  TelegramHistoryFetchResult,
} from './telegram-history.types';

interface TelegramHistoryFetchOptions {
  readonly limit: number;
  readonly corpusPath: string;
  readonly metadataPath: string;
  readonly onProgress?: (progress: TelegramHistoryFetchProgress) => void;
  readonly shouldStop?: () => boolean;
}

type HistoryClient = Pick<TelegramMtprotoClient, 'getHistoryPage'>;
type SourceRegistry = Pick<TelegramCitySourceRegistry, 'getPrimarySource'>;

export class TelegramHistoryFetcher {
  constructor(
    private readonly client: HistoryClient,
    private readonly sources: SourceRegistry,
    private readonly store = new TelegramHistoryCorpusStore(),
    private readonly timeoutMs = TELEGRAM_HISTORY_OPERATION_TIMEOUT_MS,
    private readonly maxRetries = TELEGRAM_HISTORY_MAX_RETRIES,
  ) {}

  async fetch(
    options: TelegramHistoryFetchOptions,
  ): Promise<TelegramHistoryFetchResult> {
    const configured = this.sources.getPrimarySource();

    if (configured === undefined) {
      throw new TelegramIntegrationError(
        'DISABLED',
        'Telegram source is not configured',
      );
    }

    const [existing, existingMetadata] = await Promise.all([
      this.store.read(options.corpusPath),
      this.store.readMetadata(options.metadataPath),
    ]);
    const byExternalId = new Map(
      existing.map((message) => [message.externalId, message]),
    );
    let offsetId = oldestMessageId(existing) ?? undefined;
    let fetchedFromTelegram = existingMetadata?.fetchedFromTelegram ?? 0;
    let pagesFetched = existingMetadata?.pagesFetched ?? 0;
    let afterSourceFiltering = existingMetadata?.afterSourceFiltering ?? 0;
    let historyExhausted = false;
    let errorCode: string | undefined;

    while (
      byExternalId.size < options.limit &&
      !historyExhausted &&
      options.shouldStop?.() !== true
    ) {
      const remaining = options.limit - byExternalId.size;
      const batchSize = Math.min(TELEGRAM_HISTORY_BATCH_SIZE, remaining);
      let page: TelegramMtprotoHistoryPage;

      try {
        page = await this.fetchPageWithRetry(batchSize, offsetId);
      } catch (error: unknown) {
        errorCode = safeErrorCode(error);
        break;
      }

      pagesFetched += 1;
      fetchedFromTelegram += page.fetched;
      const normalized = page.envelopes
        .map((envelope) =>
          normalizeTelegramMtprotoMessage(
            envelope,
            page.sourceChatId,
            configured.cityId,
          ),
        )
        .filter((message): message is TelegramMessage => message !== null);
      afterSourceFiltering += normalized.length;

      for (const message of normalized) {
        const previous = byExternalId.get(message.externalId);

        if (previous === undefined || isNewerVersion(message, previous)) {
          byExternalId.set(message.externalId, sanitizeCorpusMessage(message));
        }
      }

      const previousOffset = offsetId;
      offsetId = page.nextOffsetId ?? offsetId;
      historyExhausted =
        page.exhausted ||
        page.nextOffsetId === null ||
        page.nextOffsetId === previousOffset;

      const messages = sortedMessages(byExternalId.values()).slice(
        -options.limit,
      );
      const metadata = buildMetadata({
        messages,
        cityId: configured.cityId,
        sourceChatId: page.sourceChatId,
        requested: options.limit,
        fetchedFromTelegram,
        pagesFetched,
        afterSourceFiltering,
        historyExhausted,
        stopped: options.shouldStop?.() === true,
      });

      await this.store.write(
        options.corpusPath,
        options.metadataPath,
        messages,
        metadata,
      );
      options.onProgress?.({
        page: pagesFetched,
        fetched: page.fetched,
        accepted: normalized.length,
        saved: messages.length,
      });
    }

    const messages = sortedMessages(byExternalId.values()).slice(
      -options.limit,
    );
    const sourceChatId = messages[0]?.chatId ?? configured.sourceChatId;
    const metadata = buildMetadata({
      messages,
      cityId: configured.cityId,
      sourceChatId,
      requested: options.limit,
      fetchedFromTelegram,
      pagesFetched,
      afterSourceFiltering,
      historyExhausted,
      stopped: options.shouldStop?.() === true,
      ...(errorCode === undefined ? {} : { errorCode }),
    });

    await this.store.write(
      options.corpusPath,
      options.metadataPath,
      messages,
      metadata,
    );

    return { messages, metadata };
  }

  private async fetchPageWithRetry(
    limit: number,
    offsetId?: number,
  ): Promise<TelegramMtprotoHistoryPage> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await withTimeout(
          this.client.getHistoryPage(limit, offsetId),
          this.timeoutMs,
        );
      } catch (error: unknown) {
        lastError = error;

        if (attempt < this.maxRetries) {
          await delay(TELEGRAM_HISTORY_RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastError;
  }
}

interface MetadataInput {
  readonly messages: readonly TelegramMessage[];
  readonly cityId: string;
  readonly sourceChatId: string;
  readonly requested: number;
  readonly fetchedFromTelegram: number;
  readonly pagesFetched: number;
  readonly afterSourceFiltering: number;
  readonly historyExhausted: boolean;
  readonly stopped: boolean;
  readonly errorCode?: string;
}

const buildMetadata = (input: MetadataInput) => ({
  schemaVersion: 1 as const,
  cityId: input.cityId,
  sourceChatId: input.sourceChatId,
  requested: input.requested,
  saved: input.messages.length,
  fetchedFromTelegram: input.fetchedFromTelegram,
  pagesFetched: input.pagesFetched,
  afterSourceFiltering: input.afterSourceFiltering,
  oldestMessageId: oldestMessageId(input.messages) ?? null,
  newestMessageId: newestMessageId(input.messages) ?? null,
  status:
    input.errorCode === undefined && !input.stopped
      ? ('FULL' as const)
      : ('PARTIAL' as const),
  historyExhausted: input.historyExhausted,
  updatedAt: new Date().toISOString(),
  ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
});

const sortedMessages = (
  messages: Iterable<TelegramMessage>,
): TelegramMessage[] =>
  [...messages].sort(
    (left, right) =>
      Date.parse(left.publishedAt) - Date.parse(right.publishedAt) ||
      messageId(left) - messageId(right),
  );

const oldestMessageId = (
  messages: readonly TelegramMessage[],
): number | undefined => {
  const ids = messages.map(messageId).filter((id) => id > 0);

  return ids.length === 0 ? undefined : Math.min(...ids);
};

const newestMessageId = (
  messages: readonly TelegramMessage[],
): number | undefined => {
  const ids = messages.map(messageId).filter((id) => id > 0);

  return ids.length === 0 ? undefined : Math.max(...ids);
};

const messageId = (message: TelegramMessage): number => {
  const value = Number(message.externalId.split(':').at(-1));

  return Number.isSafeInteger(value) ? value : 0;
};

const sanitizeCorpusMessage = (message: TelegramMessage): TelegramMessage => ({
  externalId: message.externalId,
  source: 'TELEGRAM',
  cityId: message.cityId,
  chatId: message.chatId,
  text: message.text,
  publishedAt: message.publishedAt,
  ...(message.editedAt === undefined ? {} : { editedAt: message.editedAt }),
  ...(message.replyToExternalId === undefined
    ? {}
    : { replyToExternalId: message.replyToExternalId }),
  rawSourceType: message.rawSourceType,
});

const isNewerVersion = (
  candidate: TelegramMessage,
  current: TelegramMessage,
): boolean =>
  Date.parse(candidate.editedAt ?? candidate.publishedAt) >
  Date.parse(current.editedAt ?? current.publishedAt);

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('TELEGRAM_HISTORY_TIMEOUT')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};

const delay = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const safeErrorCode = (error: unknown): string => {
  if (error instanceof TelegramIntegrationError) {
    return `TELEGRAM_${error.code}`;
  }

  return error instanceof Error && /^[A-Z][A-Z0-9_]{1,79}$/u.test(error.message)
    ? error.message
    : 'UNKNOWN_ERROR';
};
