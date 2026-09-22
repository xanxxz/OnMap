import 'dotenv/config';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { DatabaseModule } from '../src/database/database.module';

import { TelegramDryRunIngestionPipeline } from '../src/integrations/telegram/ingestion/telegram-dry-run-ingestion.pipeline';
import { TELEGRAM_INGESTION_CONTEXT_MESSAGE_LIMIT } from '../src/integrations/telegram/ingestion/telegram-ingestion.constants';
import type {
  NormalizedTelegramEvent,
  TelegramIngestionDecision,
} from '../src/integrations/telegram/ingestion/telegram-ingestion.types';
import { TelegramLocationResolver } from '../src/integrations/telegram/location-resolver/telegram-location-resolver';
import { TelegramMessageParser } from '../src/integrations/telegram/parser/telegram-message.parser';
import {
  parseTelegramIngestionApplyOptions,
  TELEGRAM_INGESTION_APPLY_USAGE,
} from '../src/integrations/telegram/persistence/telegram-ingestion-apply-options';
import { TelegramIngestionPersistenceService } from '../src/integrations/telegram/persistence/telegram-ingestion-persistence.service';
import type { TelegramPersistenceResult } from '../src/integrations/telegram/persistence/telegram-ingestion-persistence.types';
import { TelegramRoadEventRealtimeBridge } from '../src/integrations/telegram/persistence/telegram-road-event-realtime.bridge';
import { TelegramMtprotoClientFactory } from '../src/integrations/telegram/telegram-mtproto-client.factory';
import { TelegramMtprotoClient } from '../src/integrations/telegram/telegram-mtproto.client';
import { TelegramMtprotoSource } from '../src/integrations/telegram/telegram-mtproto.source';
import { TelegramCitySourceRegistry } from '../src/integrations/telegram/telegram-city-source.registry';
import { TelegramIntegrationError } from '../src/integrations/telegram/telegram.errors';
import { TomTomClient } from '../src/integrations/tomtom/tomtom.client';
import { TomTomIntegrationError } from '../src/integrations/tomtom/tomtom.errors';
import { TomTomSearchProvider } from '../src/integrations/tomtom/tomtom-search.provider';
import { RoadEventsGateway } from '../src/road-events/realtime/road-events.gateway';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
  providers: [
    RoadEventsGateway,
    TelegramIngestionPersistenceService,
    TelegramRoadEventRealtimeBridge,
  ],
})
class TelegramIngestionApplyModule {}

interface ApplyCounters {
  CREATED: number;
  UPDATED: number;
  RESOLVED: number;
  NOOP: number;
  REVIEW_SKIPPED: number;
  IGNORE_SKIPPED: number;
  ERROR: number;
}

interface ApplyPersistence {
  apply(event: NormalizedTelegramEvent): Promise<TelegramPersistenceResult>;
}

const createCounters = (): ApplyCounters => ({
  CREATED: 0,
  UPDATED: 0,
  RESOLVED: 0,
  NOOP: 0,
  REVIEW_SKIPPED: 0,
  IGNORE_SKIPPED: 0,
  ERROR: 0,
});

const countPersistenceResult = (
  counters: ApplyCounters,
  result: TelegramPersistenceResult,
): void => {
  if (result.status === 'CREATED') counters.CREATED += 1;
  else if (result.status === 'UPDATED') counters.UPDATED += 1;
  else if (result.status === 'RESOLVED') counters.RESOLVED += 1;
  else if (result.status === 'NOOP') counters.NOOP += 1;
  else counters.REVIEW_SKIPPED += 1;
};

const isActionDecision = (
  decision: TelegramIngestionDecision,
): decision is 'CREATE' | 'UPDATE' | 'RESOLVE' =>
  decision === 'CREATE' || decision === 'UPDATE' || decision === 'RESOLVE';

const run = async (): Promise<void> => {
  let options: ReturnType<typeof parseTelegramIngestionApplyOptions>;

  try {
    options = parseTelegramIngestionApplyOptions(process.argv.slice(2));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'INVALID_ARGUMENTS';
    process.stderr.write(`${reason}\n${TELEGRAM_INGESTION_APPLY_USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const configService = new ConfigService(process.env);
  const source = new TelegramMtprotoSource(
    new TelegramMtprotoClient(
      configService,
      new TelegramMtprotoClientFactory(),
    ),
    new TelegramCitySourceRegistry(configService),
  );
  const pipeline = new TelegramDryRunIngestionPipeline(
    new TelegramMessageParser(),
    new TelegramLocationResolver(
      new TomTomSearchProvider(new TomTomClient(configService)),
    ),
  );
  let application: INestApplication | null = null;
  let persistence: ApplyPersistence | null = null;

  if (options.mode === 'APPLY') {
    application = await NestFactory.create(TelegramIngestionApplyModule, {
      logger: ['error', 'warn'],
    });
    await application.listen(Number(process.env.PORT ?? 4000));
    persistence = application.get(TelegramRoadEventRealtimeBridge);
  }
  const counters = createCounters();
  const dryRunCandidates = { CREATE: 0, UPDATE: 0, RESOLVE: 0 };

  try {
    const messages = [...(await source.getRecentMessages(options.limit))].sort(
      (left, right) =>
        Date.parse(left.publishedAt) - Date.parse(right.publishedAt),
    );
    const byExternalId = new Map(
      messages.map((message) => [message.externalId, message]),
    );

    for (const [index, message] of messages.entries()) {
      try {
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

        for (const event of result.events) {
          if (event.decision === 'REVIEW') {
            counters.REVIEW_SKIPPED += 1;
          } else if (event.decision === 'IGNORE') {
            counters.IGNORE_SKIPPED += 1;
          } else if (isActionDecision(event.decision)) {
            if (persistence === null) {
              dryRunCandidates[event.decision] += 1;
            } else {
              countPersistenceResult(counters, await persistence.apply(event));
            }
          }
        }
      } catch {
        counters.ERROR += 1;
      }
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          mode: options.mode,
          messages: messages.length,
          counters,
          ...(options.mode === 'DRY_RUN' ? { dryRunCandidates } : {}),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await source.disconnect();

    if (application !== null) {
      await application.close();
    }
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
      `Telegram ingestion apply failed: ${formatControlledError(error)}\n`,
    );
    process.exitCode = 1;
  });
}
