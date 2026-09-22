import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { NormalizedTelegramEvent } from '../ingestion/telegram-ingestion.types';
import type { TelegramParserResult } from '../parser/telegram-parser.types';
import type { TelegramPersistenceResult } from '../persistence/telegram-ingestion-persistence.types';
import type {
  TelegramIngestionSource,
  TelegramMessage,
} from '../telegram.types';

import {
  TELEGRAM_REVIEW_LOG_DIR_DEFAULT,
  TELEGRAM_REVIEW_LOG_DIR_ENV,
  TELEGRAM_REVIEW_LOG_FILE_MAX_BYTES,
  TELEGRAM_REVIEW_LOGS_ENABLED_ENV,
  TELEGRAM_REVIEW_LOG_DEDUP_LIMIT,
} from './telegram-ingestion-runtime.constants';

export type TelegramReviewLogCategory = 'matched' | 'review' | 'ignored';

export interface TelegramRuntimeReviewLogInput {
  readonly message: TelegramMessage;
  readonly ingestionSource: TelegramIngestionSource;
  readonly parserResult: TelegramParserResult;
  readonly event: NormalizedTelegramEvent;
  readonly persistenceResult: TelegramPersistenceResult | null;
}

interface TelegramRuntimeReviewLogRecord {
  readonly loggedAt: string;
  readonly ingestionSource: TelegramIngestionSource;
  readonly externalMessageId: string;
  readonly cityId: string;
  readonly messageTimestamp: string;
  readonly messageVersion: string;
  readonly rawSourceType: TelegramMessage['rawSourceType'];
  readonly text: string;
  readonly eventType: TelegramParserResult['eventType'];
  readonly intent: TelegramParserResult['intent'];
  readonly state: TelegramParserResult['state'];
  readonly matched: boolean;
  readonly parserConfidence: number;
  readonly contextUsed: boolean;
  readonly replyContextUsed: boolean;
  readonly locationInput: string | null;
  readonly locations: TelegramParserResult['locations'];
  readonly canonicalLocation: string | null;
  readonly resolverStatus: NormalizedTelegramEvent['resolverStatus'];
  readonly resolverReason: string | null;
  readonly locationConfidence: number | null;
  readonly locationPrecision: NormalizedTelegramEvent['locationPrecision'];
  readonly geometryType: 'Point' | 'LineString' | 'MultiLineString' | null;
  readonly geometryProvider: NormalizedTelegramEvent['geometryProvider'];
  readonly geometryStatus: NormalizedTelegramEvent['geometryStatus'];
  readonly decision: NormalizedTelegramEvent['decision'];
  readonly decisionReason: NormalizedTelegramEvent['reason'];
  readonly persistenceResult: {
    readonly status: TelegramPersistenceResult['status'];
    readonly reason: string | null;
  } | null;
  readonly unknownLocationCandidate: string | null;
}

export const TELEGRAM_REVIEW_LOG_FILE_NAMES: Readonly<
  Record<TelegramReviewLogCategory, string>
> = {
  matched: 'telegram-matched.ndjson',
  review: 'telegram-review.ndjson',
  ignored: 'telegram-ignored.ndjson',
};

export class TelegramRuntimeReviewLogger {
  private readonly logger = new Logger(TelegramRuntimeReviewLogger.name);
  private readonly enabled: boolean;
  private readonly directory: string;
  private readonly loggedVersions = new Map<string, true>();
  private writeQueue = Promise.resolve();

  constructor(
    configService: Pick<ConfigService, 'get'>,
    private readonly maxFileBytes = TELEGRAM_REVIEW_LOG_FILE_MAX_BYTES,
  ) {
    const enabled = configService.get<string | boolean>(
      TELEGRAM_REVIEW_LOGS_ENABLED_ENV,
    );

    this.enabled =
      enabled === true ||
      (typeof enabled === 'string' && enabled.trim().toLowerCase() === 'true');
    const configuredDirectory = configService
      .get<string>(TELEGRAM_REVIEW_LOG_DIR_ENV)
      ?.trim();

    this.directory = resolve(
      process.cwd(),
      configuredDirectory || TELEGRAM_REVIEW_LOG_DIR_DEFAULT,
    );
  }

  initialize(): Promise<void> {
    if (!this.enabled) {
      return Promise.resolve();
    }

    const queued = this.writeQueue.then(async () => {
      await mkdir(this.directory, { recursive: true });

      await Promise.all(
        Object.values(TELEGRAM_REVIEW_LOG_FILE_NAMES).map((fileName) =>
          appendFile(resolve(this.directory, fileName), '', {
            encoding: 'utf8',
            flag: 'a',
          }),
        ),
      );
    });

    this.writeQueue = queued.catch(() => undefined);

    return queued.catch(() => {
      this.logger.warn('Telegram review log write failed');
    });
  }

  record(input: TelegramRuntimeReviewLogInput): Promise<void> {
    if (!this.enabled) {
      return Promise.resolve();
    }

    const queued = this.writeQueue.then(() => this.recordInternal(input));

    this.writeQueue = queued.catch(() => undefined);

    return queued.catch(() => {
      this.logger.warn('Telegram review log write failed');
    });
  }

  private async recordInternal(
    input: TelegramRuntimeReviewLogInput,
  ): Promise<void> {
    const categories = categoriesFor(input);

    if (categories.length === 0) {
      return;
    }

    await mkdir(this.directory, { recursive: true });

    for (const category of categories) {
      const dedupKey = this.dedupKey(input, category);

      if (this.loggedVersions.has(dedupKey)) {
        continue;
      }

      const filePath = resolve(
        this.directory,
        TELEGRAM_REVIEW_LOG_FILE_NAMES[category],
      );
      const line = `${JSON.stringify(toLogRecord(input))}\n`;

      await this.rotateIfNeeded(filePath, Buffer.byteLength(line));
      await appendFile(filePath, line, { encoding: 'utf8', flag: 'a' });
      this.remember(dedupKey);
    }
  }

  private async rotateIfNeeded(
    filePath: string,
    incomingBytes: number,
  ): Promise<void> {
    const currentSize = await stat(filePath)
      .then((file) => file.size)
      .catch((error: unknown) => {
        if (isMissingFileError(error)) {
          return 0;
        }

        throw error;
      });

    if (currentSize === 0 || currentSize + incomingBytes <= this.maxFileBytes) {
      return;
    }

    const backupPath = `${filePath}.1`;

    await rm(backupPath, { force: true });
    await rename(filePath, backupPath);
  }

  private dedupKey(
    input: TelegramRuntimeReviewLogInput,
    category: TelegramReviewLogCategory,
  ): string {
    return [
      input.message.externalId,
      input.message.editedAt ?? input.message.publishedAt,
      category,
    ].join(':');
  }

  private remember(key: string): void {
    this.loggedVersions.delete(key);
    this.loggedVersions.set(key, true);

    if (this.loggedVersions.size <= TELEGRAM_REVIEW_LOG_DEDUP_LIMIT) {
      return;
    }

    const oldest = this.loggedVersions.keys().next().value as
      string | undefined;

    if (oldest !== undefined) {
      this.loggedVersions.delete(oldest);
    }
  }
}

const categoriesFor = (
  input: TelegramRuntimeReviewLogInput,
): readonly TelegramReviewLogCategory[] => {
  const categories: TelegramReviewLogCategory[] = [];

  if (input.parserResult.matched) {
    categories.push('matched');
  }

  if (input.event.decision === 'REVIEW') {
    categories.push('review');
  } else if (input.event.decision === 'IGNORE') {
    categories.push('ignored');
  }

  return categories;
};

const toLogRecord = (
  input: TelegramRuntimeReviewLogInput,
): TelegramRuntimeReviewLogRecord => ({
  loggedAt: new Date().toISOString(),
  ingestionSource: input.ingestionSource,
  externalMessageId: safeExternalMessageId(input.message),
  cityId: input.event.cityId,
  messageTimestamp: input.message.publishedAt,
  messageVersion: input.message.editedAt ?? input.message.publishedAt,
  rawSourceType: input.message.rawSourceType,
  text: sanitizeText(input.message.text),
  eventType: input.parserResult.eventType,
  intent: input.parserResult.intent,
  state: input.parserResult.state,
  matched: input.parserResult.matched,
  parserConfidence: input.parserResult.confidence,
  contextUsed: input.parserResult.contextUsed,
  replyContextUsed: input.event.replyContextUsed,
  locationInput: input.event.locationInput,
  locations: input.parserResult.locations.map(({ text, alias }) => ({
    text,
    alias,
  })),
  canonicalLocation:
    input.event.canonicalLocationTitle ?? input.event.canonicalLocationId,
  resolverStatus: input.event.resolverStatus,
  resolverReason:
    input.event.resolverStatus === 'RESOLVED' ? null : input.event.reason,
  locationConfidence: input.event.locationConfidence,
  locationPrecision: input.event.locationPrecision,
  geometryType: input.event.geometry?.type ?? null,
  geometryProvider: input.event.geometryProvider,
  geometryStatus: input.event.geometryStatus,
  decision: input.event.decision,
  decisionReason: input.event.reason,
  persistenceResult: sanitizePersistenceResult(input.persistenceResult),
  unknownLocationCandidate: unknownLocationCandidate(input.event),
});

const unknownLocationCandidate = (
  event: NormalizedTelegramEvent,
): string | null =>
  event.locationInput !== null &&
  ['AMBIGUOUS', 'NOT_FOUND', 'MULTIPLE'].includes(event.resolverStatus)
    ? event.locationInput
    : null;

const sanitizePersistenceResult = (
  result: TelegramPersistenceResult | null,
): TelegramRuntimeReviewLogRecord['persistenceResult'] => {
  if (result === null) {
    return null;
  }

  return {
    status: result.status,
    reason: 'reason' in result ? result.reason : null,
  };
};

const safeExternalMessageId = (message: TelegramMessage): string => {
  const chatScopedPrefix = `telegram:${message.chatId}:`;

  return message.externalId.startsWith(chatScopedPrefix)
    ? message.externalId.slice(chatScopedPrefix.length)
    : message.externalId;
};

const sanitizeText = (text: string): string =>
  text
    .replace(
      /\b(TELEGRAM_SESSION|TELEGRAM_API_HASH|TELEGRAM_API_ID|API_HASH|API_ID|AUTH_KEY)\s*[:=]\s*\S+/giu,
      '$1=[redacted]',
    )
    .replace(/@[a-z0-9_]{5,32}/giu, '[redacted-username]')
    .replace(/(?:\+7|8)[\s()-]*\d(?:[\s()-]*\d){9}\b/gu, '[redacted-phone]');

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';
