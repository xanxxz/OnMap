import {
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';

import type { TelegramMessage } from '../telegram.types';
import type { TelegramHistoryCorpusMetadata } from './telegram-history.types';

export class TelegramHistoryCorpusStore {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async read(corpusPath: string): Promise<readonly TelegramMessage[]> {
    return (await this.readEntries(corpusPath)).map(({ message }) => message);
  }

  async readEntries(
    corpusPath: string,
  ): Promise<readonly TelegramHistoryCorpusEntry[]> {
    let content: string;
    let legacySavedAt: string;

    try {
      const [fileContent, fileStats] = await Promise.all([
        readFile(corpusPath, 'utf8'),
        stat(corpusPath),
      ]);
      content = fileContent;
      legacySavedAt = fileStats.mtime.toISOString();
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        return [];
      }

      throw error;
    }

    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => parseCorpusLine(line, legacySavedAt));
  }

  async readMetadata(
    metadataPath: string,
  ): Promise<TelegramHistoryCorpusMetadata | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(metadataPath, 'utf8'));

      return isCorpusMetadata(value) ? value : undefined;
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async write(
    corpusPath: string,
    metadataPath: string,
    messages: readonly TelegramMessage[],
    metadata: TelegramHistoryCorpusMetadata,
  ): Promise<void> {
    await Promise.all([
      mkdir(dirname(corpusPath), { recursive: true, mode: 0o700 }),
      mkdir(dirname(metadataPath), { recursive: true, mode: 0o700 }),
    ]);
    await Promise.all([
      chmod(dirname(corpusPath), 0o700).catch(() => undefined),
      chmod(dirname(metadataPath), 0o700).catch(() => undefined),
    ]);

    const corpusTemporaryPath = `${corpusPath}.tmp`;
    const metadataTemporaryPath = `${metadataPath}.tmp`;
    const existingEntries = await this.readEntries(corpusPath);
    const existingByExternalId = new Map(
      existingEntries.map((entry) => [entry.message.externalId, entry]),
    );
    const savedAt = this.now().toISOString();
    const corpus = messages
      .map((message) => {
        const existing = existingByExternalId.get(message.externalId);
        const sameVersion =
          existing !== undefined &&
          (existing.message.editedAt ?? existing.message.publishedAt) ===
            (message.editedAt ?? message.publishedAt);

        return toCorpusLine({
          message,
          savedAt: sameVersion ? existing.savedAt : savedAt,
        });
      })
      .join('\n');

    await Promise.all([
      writeFile(corpusTemporaryPath, corpus.length === 0 ? '' : `${corpus}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      }),
      writeFile(
        metadataTemporaryPath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      ),
    ]);
    await Promise.all([
      rename(corpusTemporaryPath, corpusPath),
      rename(metadataTemporaryPath, metadataPath),
    ]);
    await Promise.all([chmod(corpusPath, 0o600), chmod(metadataPath, 0o600)]);
  }
}

export interface TelegramHistoryCorpusEntry {
  readonly message: TelegramMessage;
  readonly savedAt: string;
}

export const toCorpusLine = (entry: TelegramHistoryCorpusEntry): string =>
  JSON.stringify({
    externalId: entry.message.externalId,
    source: entry.message.source,
    cityId: entry.message.cityId,
    chatId: entry.message.chatId,
    text: entry.message.text,
    publishedAt: entry.message.publishedAt,
    savedAt: entry.savedAt,
    ...(entry.message.editedAt === undefined
      ? {}
      : { editedAt: entry.message.editedAt }),
    ...(entry.message.replyToExternalId === undefined
      ? {}
      : { replyToExternalId: entry.message.replyToExternalId }),
    rawSourceType: entry.message.rawSourceType,
  });

const parseCorpusLine = (
  line: string,
  legacySavedAt: string,
): TelegramHistoryCorpusEntry => {
  const value: unknown = JSON.parse(line);

  if (!isCorpusMessage(value)) {
    throw new Error('INVALID_TELEGRAM_CORPUS_LINE');
  }

  const candidate = value as Partial<TelegramMessage> & { savedAt?: unknown };
  const message = { ...candidate };
  delete message.savedAt;

  return {
    message: message as TelegramMessage,
    savedAt:
      typeof candidate.savedAt === 'string' &&
      Number.isFinite(Date.parse(candidate.savedAt))
        ? candidate.savedAt
        : legacySavedAt,
  };
};

const isCorpusMessage = (value: unknown): value is TelegramMessage => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<TelegramMessage>;

  return (
    candidate.source === 'TELEGRAM' &&
    typeof candidate.externalId === 'string' &&
    typeof candidate.cityId === 'string' &&
    typeof candidate.chatId === 'string' &&
    typeof candidate.text === 'string' &&
    typeof candidate.publishedAt === 'string' &&
    typeof candidate.rawSourceType === 'string'
  );
};

const isCorpusMetadata = (
  value: unknown,
): value is TelegramHistoryCorpusMetadata => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<TelegramHistoryCorpusMetadata>;

  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.cityId === 'string' &&
    typeof candidate.sourceChatId === 'string' &&
    typeof candidate.requested === 'number' &&
    typeof candidate.saved === 'number' &&
    typeof candidate.fetchedFromTelegram === 'number' &&
    typeof candidate.pagesFetched === 'number' &&
    typeof candidate.afterSourceFiltering === 'number' &&
    (candidate.status === 'FULL' || candidate.status === 'PARTIAL')
  );
};

const isMissingFile = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';
