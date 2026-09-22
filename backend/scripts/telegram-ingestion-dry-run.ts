import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import { TelegramDryRunIngestionPipeline } from '../src/integrations/telegram/ingestion/telegram-dry-run-ingestion.pipeline';
import { TELEGRAM_INGESTION_CONTEXT_MESSAGE_LIMIT } from '../src/integrations/telegram/ingestion/telegram-ingestion.constants';
import { buildTelegramDryRunReport } from '../src/integrations/telegram/ingestion/telegram-ingestion-report';
import type { TelegramDryRunReportEntry } from '../src/integrations/telegram/ingestion/telegram-ingestion-report';
import { TelegramLocationResolver } from '../src/integrations/telegram/location-resolver/telegram-location-resolver';
import { TelegramMessageParser } from '../src/integrations/telegram/parser/telegram-message.parser';
import { TelegramMtprotoClientFactory } from '../src/integrations/telegram/telegram-mtproto-client.factory';
import { TelegramMtprotoClient } from '../src/integrations/telegram/telegram-mtproto.client';
import { TelegramMtprotoSource } from '../src/integrations/telegram/telegram-mtproto.source';
import { TelegramCitySourceRegistry } from '../src/integrations/telegram/telegram-city-source.registry';
import { TelegramIntegrationError } from '../src/integrations/telegram/telegram.errors';
import { TomTomClient } from '../src/integrations/tomtom/tomtom.client';
import { TomTomIntegrationError } from '../src/integrations/tomtom/tomtom.errors';
import { TomTomSearchProvider } from '../src/integrations/tomtom/tomtom-search.provider';

export const TELEGRAM_INGESTION_DRY_RUN_DEFAULT_LIMIT = 300;
export const TELEGRAM_INGESTION_DRY_RUN_MAX_LIMIT = 1_000;
export const TELEGRAM_INGESTION_DRY_RUN_USAGE =
  'Usage: npm run telegram:ingestion-dry-run -- --limit <1..1000>';

export const parseTelegramIngestionDryRunLimit = (
  args: readonly string[],
): number => {
  if (args.length === 0) {
    return TELEGRAM_INGESTION_DRY_RUN_DEFAULT_LIMIT;
  }

  if (args.length !== 2 || args[0] !== '--limit') {
    throw new Error('INVALID_ARGUMENTS');
  }

  const limit = Number(args[1]);

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > TELEGRAM_INGESTION_DRY_RUN_MAX_LIMIT
  ) {
    throw new Error('INVALID_LIMIT');
  }

  return limit;
};

const run = async (): Promise<void> => {
  let limit: number;

  try {
    limit = parseTelegramIngestionDryRunLimit(process.argv.slice(2));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'INVALID_ARGUMENTS';

    process.stderr.write(`${reason}\n${TELEGRAM_INGESTION_DRY_RUN_USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const configService = new ConfigService(process.env);
  const mtprotoClient = new TelegramMtprotoClient(
    configService,
    new TelegramMtprotoClientFactory(),
  );
  const source = new TelegramMtprotoSource(
    mtprotoClient,
    new TelegramCitySourceRegistry(configService),
  );
  const searchProvider = new TomTomSearchProvider(
    new TomTomClient(configService),
  );
  const pipeline = new TelegramDryRunIngestionPipeline(
    new TelegramMessageParser(),
    new TelegramLocationResolver(searchProvider),
  );

  try {
    const messages = [...(await source.getRecentMessages(limit))].sort(
      (left, right) =>
        Date.parse(left.publishedAt) - Date.parse(right.publishedAt),
    );
    const byExternalId = new Map(
      messages.map((message) => [message.externalId, message]),
    );
    const entries: TelegramDryRunReportEntry[] = [];

    for (const [index, message] of messages.entries()) {
      const replyMessage = message.replyToExternalId
        ? byExternalId.get(message.replyToExternalId)
        : undefined;
      const result = await pipeline.process({
        message,
        ...(replyMessage === undefined ? {} : { replyMessage }),
        previousMessages: messages.slice(
          Math.max(0, index - TELEGRAM_INGESTION_CONTEXT_MESSAGE_LIMIT),
          index,
        ),
      });

      entries.push({ message, result });
    }

    process.stdout.write(
      `${JSON.stringify(buildTelegramDryRunReport(entries), null, 2)}\n`,
    );
  } finally {
    await source.disconnect();
  }
};

const formatControlledError = (error: unknown): string => {
  if (error instanceof TelegramIntegrationError) {
    return `TELEGRAM_${error.code}`;
  }

  if (error instanceof TomTomIntegrationError) {
    return `TOMTOM_${error.code}`;
  }

  return error instanceof Error &&
    /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u.test(error.name)
    ? error.name
    : 'UNKNOWN_ERROR';
};

if (require.main === module) {
  void run().catch((error: unknown) => {
    process.stderr.write(
      `Telegram ingestion dry-run failed: ${formatControlledError(error)}\n`,
    );
    process.exitCode = 1;
  });
}
