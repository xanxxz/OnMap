import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { TelegramMessage } from '../telegram.types';
import type { TelegramHistoryCorpusMetadata } from './telegram-history.types';

export class TelegramHistoryCorpusStore {
  async read(corpusPath: string): Promise<readonly TelegramMessage[]> {
    let content: string;

    try {
      content = await readFile(corpusPath, 'utf8');
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        return [];
      }

      throw error;
    }

    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => parseCorpusLine(line));
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
      mkdir(dirname(corpusPath), { recursive: true }),
      mkdir(dirname(metadataPath), { recursive: true }),
    ]);

    const corpusTemporaryPath = `${corpusPath}.tmp`;
    const metadataTemporaryPath = `${metadataPath}.tmp`;
    const corpus = messages.map(toCorpusLine).join('\n');

    await Promise.all([
      writeFile(
        corpusTemporaryPath,
        corpus.length === 0 ? '' : `${corpus}\n`,
        'utf8',
      ),
      writeFile(
        metadataTemporaryPath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      ),
    ]);
    await Promise.all([
      rename(corpusTemporaryPath, corpusPath),
      rename(metadataTemporaryPath, metadataPath),
    ]);
  }
}

const toCorpusLine = (message: TelegramMessage): string =>
  JSON.stringify({
    externalId: message.externalId,
    source: message.source,
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

const parseCorpusLine = (line: string): TelegramMessage => {
  const value: unknown = JSON.parse(line);

  if (!isCorpusMessage(value)) {
    throw new Error('INVALID_TELEGRAM_CORPUS_LINE');
  }

  return value;
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
