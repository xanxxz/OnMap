import 'dotenv/config';

import { resolve } from 'node:path';

import { ConfigService } from '@nestjs/config';

import {
  TELEGRAM_HISTORY_DEFAULT_CORPUS_PATH,
  TELEGRAM_HISTORY_DEFAULT_LIMIT,
  TELEGRAM_HISTORY_DEFAULT_METADATA_PATH,
  TELEGRAM_HISTORY_MAX_LIMIT,
} from '../src/integrations/telegram/history/telegram-history.constants';
import { TelegramHistoryFetcher } from '../src/integrations/telegram/history/telegram-history.fetcher';
import { TelegramMtprotoClientFactory } from '../src/integrations/telegram/telegram-mtproto-client.factory';
import { TelegramMtprotoClient } from '../src/integrations/telegram/telegram-mtproto.client';
import { TelegramCitySourceRegistry } from '../src/integrations/telegram/telegram-city-source.registry';
import { TelegramIntegrationError } from '../src/integrations/telegram/telegram.errors';

export interface TelegramHistoryFetchCliOptions {
  readonly limit: number;
  readonly corpusPath: string;
  readonly metadataPath: string;
}

export const TELEGRAM_HISTORY_FETCH_USAGE =
  'Usage: npm run telegram:history-fetch -- [--limit <1..5000>] [--corpus <path>] [--metadata <path>]';

export const parseTelegramHistoryFetchOptions = (
  args: readonly string[],
): TelegramHistoryFetchCliOptions => {
  let limit = TELEGRAM_HISTORY_DEFAULT_LIMIT;
  let corpusPath = TELEGRAM_HISTORY_DEFAULT_CORPUS_PATH;
  let metadataPath = TELEGRAM_HISTORY_DEFAULT_METADATA_PATH;

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];

    if (value === undefined) {
      throw new Error('INVALID_ARGUMENTS');
    }

    if (flag === '--limit') {
      limit = Number(value);
    } else if (flag === '--corpus') {
      corpusPath = value;
    } else if (flag === '--metadata') {
      metadataPath = value;
    } else {
      throw new Error('INVALID_ARGUMENTS');
    }
  }

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > TELEGRAM_HISTORY_MAX_LIMIT ||
    corpusPath.trim().length === 0 ||
    metadataPath.trim().length === 0
  ) {
    throw new Error('INVALID_ARGUMENTS');
  }

  return {
    limit,
    corpusPath: resolve(corpusPath),
    metadataPath: resolve(metadataPath),
  };
};

const run = async (): Promise<void> => {
  let options: TelegramHistoryFetchCliOptions;

  try {
    options = parseTelegramHistoryFetchOptions(process.argv.slice(2));
  } catch {
    process.stderr.write(`${TELEGRAM_HISTORY_FETCH_USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const config = new ConfigService(process.env);
  const client = new TelegramMtprotoClient(
    config,
    new TelegramMtprotoClientFactory(),
  );
  const fetcher = new TelegramHistoryFetcher(
    client,
    new TelegramCitySourceRegistry(config),
  );
  let interrupted = false;
  const stop = (): void => {
    interrupted = true;
  };

  process.once('SIGINT', stop);

  try {
    const result = await fetcher.fetch({
      limit: options.limit,
      corpusPath: options.corpusPath,
      metadataPath: options.metadataPath,
      shouldStop: () => interrupted,
      onProgress: ({ page, fetched, accepted, saved }) => {
        process.stdout.write(
          `History batch ${page}: ${fetched} fetched, ${accepted} after filtering, ${saved} saved\n`,
        );
      },
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          requested: result.metadata.requested,
          fetchedFromTelegram: result.metadata.fetchedFromTelegram,
          pagesFetched: result.metadata.pagesFetched,
          afterSourceFiltering: result.metadata.afterSourceFiltering,
          saved: result.metadata.saved,
          status: result.metadata.status,
          historyExhausted: result.metadata.historyExhausted,
          ...(result.metadata.errorCode === undefined
            ? {}
            : { errorCode: result.metadata.errorCode }),
          corpusPath: options.corpusPath,
          metadataPath: options.metadataPath,
        },
        null,
        2,
      )}\n`,
    );

    if (result.metadata.status === 'PARTIAL') {
      process.exitCode = 2;
    }
  } finally {
    process.removeListener('SIGINT', stop);
    await client.disconnect();
  }
};

const safeError = (error: unknown): string =>
  error instanceof TelegramIntegrationError
    ? `TELEGRAM_${error.code}`
    : error instanceof Error && /^[A-Z][A-Z0-9_]{1,79}$/u.test(error.message)
      ? error.message
      : 'UNKNOWN_ERROR';

if (require.main === module) {
  void run().catch((error: unknown) => {
    process.stderr.write(
      `Telegram history fetch failed: ${safeError(error)}\n`,
    );
    process.exitCode = 1;
  });
}
