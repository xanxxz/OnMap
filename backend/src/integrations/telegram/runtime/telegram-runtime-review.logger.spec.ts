import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NormalizedTelegramEvent } from '../ingestion/telegram-ingestion.types';
import type { TelegramParserResult } from '../parser/telegram-parser.types';
import type { TelegramMessage } from '../telegram.types';

import {
  TelegramRuntimeReviewLogger,
  type TelegramRuntimeReviewLogInput,
} from './telegram-runtime-review.logger';

const message = (
  overrides: Partial<TelegramMessage> = {},
): TelegramMessage => ({
  externalId: 'telegram:-1001:101',
  source: 'TELEGRAM',
  cityId: 'balakovo',
  chatId: '-1001',
  text: 'авария на комарова',
  publishedAt: '2026-09-07T12:00:00.000Z',
  rawSourceType: 'message',
  ...overrides,
});

const parserResult = (
  overrides: Partial<TelegramParserResult> = {},
): TelegramParserResult => ({
  matched: true,
  eventType: 'ACCIDENT',
  intent: 'REPORT',
  state: 'ACTIVE',
  locationText: 'комарова',
  locationAlias: 'komarova',
  locations: [{ text: 'комарова', alias: 'komarova' }],
  locationResolutionAllowed: true,
  confidence: 0.86,
  matchedTerms: ['авария'],
  contextUsed: false,
  ...overrides,
});

const normalizedEvent = (
  overrides: Partial<NormalizedTelegramEvent> = {},
): NormalizedTelegramEvent => ({
  source: 'TELEGRAM',
  cityId: 'balakovo',
  telegramMessageId: 'telegram:-1001:101',
  externalId: 'telegram:-1001:101',
  sourceChatId: '-1001',
  timestamp: '2026-09-07T12:00:00.000Z',
  messageVersion: '2026-09-07T12:00:00.000Z',
  eventType: 'ACCIDENT',
  intent: 'REPORT',
  state: 'ACTIVE',
  sourceText: 'авария на комарова',
  locationInput: 'комарова',
  canonicalLocationId: 'komarova',
  canonicalLocationTitle: 'Улица Комарова',
  latitude: 52.02,
  longitude: 47.8,
  geometry: { type: 'Point', coordinates: [47.8, 52.02] },
  locationPrecision: 'LANDMARK',
  geometryProvider: null,
  geometryStatus: null,
  locationConfidence: 0.99,
  parserConfidence: 0.86,
  contextUsed: false,
  replyContextUsed: false,
  resolverStatus: 'RESOLVED',
  decision: 'CREATE',
  reason: 'READY_TO_CREATE',
  ...overrides,
});

const input = (
  overrides: Partial<TelegramRuntimeReviewLogInput> = {},
): TelegramRuntimeReviewLogInput => ({
  message: message(),
  ingestionSource: 'LIVE',
  parserResult: parserResult(),
  event: normalizedEvent(),
  persistenceResult: { status: 'CREATED', roadEventId: 'event-1' },
  ...overrides,
});

const configService = (
  directory: string,
  enabled: string | boolean = 'true',
): Pick<ConfigService, 'get'> => ({
  get: jest.fn((key: string) => {
    if (key === 'TELEGRAM_REVIEW_LOGS_ENABLED') {
      return enabled;
    }

    return key === 'TELEGRAM_REVIEW_LOG_DIR' ? directory : undefined;
  }),
});

const lines = async (directory: string, fileName: string) =>
  (await readFile(join(directory, fileName), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const doesNotExist = async (path: string): Promise<boolean> =>
  access(path).then(
    () => false,
    () => true,
  );

describe('TelegramRuntimeReviewLogger', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'roadradar-telegram-logs-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('writes a matched message to the matched file', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));

    await logger.record(input());

    expect(await lines(directory, 'telegram-matched.ndjson')).toHaveLength(1);
  });

  it('records whether a message came from live updates or recovery', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));

    await logger.record(input({ ingestionSource: 'RECOVERY' }));

    expect(
      (await lines(directory, 'telegram-matched.ndjson'))[0],
    ).toMatchObject({ ingestionSource: 'RECOVERY' });
  });

  it('initializes all three append-only files when enabled', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));

    await logger.initialize();

    await expect(
      readFile(join(directory, 'telegram-matched.ndjson'), 'utf8'),
    ).resolves.toBe('');
    await expect(
      readFile(join(directory, 'telegram-review.ndjson'), 'utf8'),
    ).resolves.toBe('');
    await expect(
      readFile(join(directory, 'telegram-ignored.ndjson'), 'utf8'),
    ).resolves.toBe('');
  });

  it('accepts a boolean true feature flag from ConfigService', async () => {
    const logger = new TelegramRuntimeReviewLogger(
      configService(directory, true),
    );

    await logger.record(input());

    expect(await lines(directory, 'telegram-matched.ndjson')).toHaveLength(1);
  });

  it('writes REVIEW to both review and matched files', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));
    const event = normalizedEvent({
      decision: 'REVIEW',
      reason: 'LOCATION_NOT_FOUND',
      resolverStatus: 'NOT_FOUND',
    });

    await logger.record(input({ event }));

    expect(await lines(directory, 'telegram-matched.ndjson')).toHaveLength(1);
    expect(await lines(directory, 'telegram-review.ndjson')).toHaveLength(1);
  });

  it('writes unmatched IGNORE only to the ignored file', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));
    const parsed = parserResult({ matched: false, intent: 'NOISE' });
    const event = normalizedEvent({
      eventType: 'OTHER',
      intent: 'NOISE',
      state: 'UNKNOWN',
      decision: 'IGNORE',
      reason: 'NOISE',
      resolverStatus: 'SKIPPED',
    });

    await logger.record(input({ parserResult: parsed, event }));

    expect(await lines(directory, 'telegram-ignored.ndjson')).toHaveLength(1);
    expect(await doesNotExist(join(directory, 'telegram-matched.ndjson'))).toBe(
      true,
    );
  });

  it('writes matched IGNORE to matched and ignored files', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));
    const event = normalizedEvent({
      intent: 'QUESTION',
      state: 'UNKNOWN',
      decision: 'IGNORE',
      reason: 'QUESTION',
      resolverStatus: 'SKIPPED',
    });

    await logger.record(input({ event }));

    expect(await lines(directory, 'telegram-matched.ndjson')).toHaveLength(1);
    expect(await lines(directory, 'telegram-ignored.ndjson')).toHaveLength(1);
  });

  it('marks unresolved extracted text as an unknown location candidate', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));
    const event = normalizedEvent({
      canonicalLocationId: null,
      canonicalLocationTitle: null,
      latitude: null,
      longitude: null,
      locationConfidence: null,
      resolverStatus: 'NOT_FOUND',
      decision: 'REVIEW',
      reason: 'LOCATION_NOT_FOUND',
      locationInput: 'генезис',
    });

    await logger.record(input({ event }));

    expect((await lines(directory, 'telegram-review.ndjson'))[0]).toMatchObject(
      {
        cityId: 'balakovo',
        unknownLocationCandidate: 'генезис',
        resolverReason: 'LOCATION_NOT_FOUND',
      },
    );
  });

  it('does not mark a resolved canonical location as unknown', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));

    await logger.record(input());

    expect(
      (await lines(directory, 'telegram-matched.ndjson'))[0],
    ).toMatchObject({
      canonicalLocation: 'Улица Комарова',
      unknownLocationCandidate: null,
    });
  });

  it('stores sanitized text without author metadata or source chat id', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));
    const privateMessage = message({
      authorName: 'Private Author',
      text: 'пишите @private_user или +7 (999) 123-45-67',
    });

    await logger.record(input({ message: privateMessage }));

    const serialized = JSON.stringify(
      (await lines(directory, 'telegram-matched.ndjson'))[0],
    );
    expect(serialized).toContain('[redacted-username]');
    expect(serialized).toContain('[redacted-phone]');
    expect(serialized).not.toContain('Private Author');
    expect(serialized).not.toContain('-1001');
  });

  it('redacts credential-shaped values from message text', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));
    const secretMessage = message({
      text: 'TELEGRAM_SESSION=private-session API_HASH=private-hash',
    });

    await logger.record(input({ message: secretMessage }));

    const serialized = JSON.stringify(
      (await lines(directory, 'telegram-matched.ndjson'))[0],
    );
    expect(serialized).not.toContain('private-session');
    expect(serialized).not.toContain('private-hash');
  });

  it('deduplicates the same message version per category', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));

    await logger.record(input());
    await logger.record(input());

    expect(await lines(directory, 'telegram-matched.ndjson')).toHaveLength(1);
  });

  it('logs an edited message as a new version', async () => {
    const logger = new TelegramRuntimeReviewLogger(configService(directory));

    await logger.record(input());
    await logger.record(
      input({
        message: message({
          editedAt: '2026-09-07T12:05:00.000Z',
          rawSourceType: 'edited_message',
        }),
      }),
    );

    expect(await lines(directory, 'telegram-matched.ndjson')).toHaveLength(2);
  });

  it('does not create files when review logging is disabled', async () => {
    const logger = new TelegramRuntimeReviewLogger(
      configService(directory, false),
    );

    await logger.initialize();
    await logger.record(input());

    expect(await doesNotExist(join(directory, 'telegram-matched.ndjson'))).toBe(
      true,
    );
  });

  it('contains file write failures and emits only a safe warning', async () => {
    const blockedPath = join(directory, 'not-a-directory');
    await writeFile(blockedPath, 'blocked');
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const logger = new TelegramRuntimeReviewLogger(configService(blockedPath));

    await expect(logger.record(input())).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Telegram review log write failed');
  });

  it('rotates an oversized file to one .1 backup', async () => {
    const logger = new TelegramRuntimeReviewLogger(
      configService(directory),
      100,
    );

    await logger.record(input());
    await logger.record(
      input({
        message: message({
          externalId: 'telegram:-1001:102',
          publishedAt: '2026-09-07T12:01:00.000Z',
        }),
      }),
    );

    expect(await lines(directory, 'telegram-matched.ndjson')).toHaveLength(1);
    expect(await lines(directory, 'telegram-matched.ndjson.1')).toHaveLength(1);
  });
});
