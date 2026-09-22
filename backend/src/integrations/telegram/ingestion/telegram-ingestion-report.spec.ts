import { parseTelegramIngestionDryRunLimit } from '../../../../scripts/telegram-ingestion-dry-run';
import type { TelegramParserResult } from '../parser/telegram-parser.types';
import type { TelegramMessage } from '../telegram.types';

import {
  buildDuplicatePreview,
  buildTelegramDryRunReport,
} from './telegram-ingestion-report';
import type {
  NormalizedTelegramEvent,
  TelegramDryRunIngestionResult,
} from './telegram-ingestion.types';

const normalizedEvent = (
  overrides: Partial<NormalizedTelegramEvent> = {},
): NormalizedTelegramEvent => ({
  source: 'TELEGRAM',
  cityId: 'balakovo',
  telegramMessageId: 'message-1',
  externalId: 'message-1',
  sourceChatId: '-1001',
  timestamp: '2026-08-31T08:00:00.000Z',
  eventType: 'ACCIDENT',
  intent: 'REPORT',
  state: 'ACTIVE',
  sourceText: 'авария на комарова',
  locationInput: 'Комарова',
  canonicalLocationId: 'komarova',
  canonicalLocationTitle: 'Комарова',
  latitude: 52.02,
  longitude: 47.8,
  geometry: { type: 'Point', coordinates: [47.8, 52.02] },
  locationPrecision: 'LANDMARK',
  geometryProvider: null,
  geometryStatus: null,
  locationConfidence: 0.9,
  parserConfidence: 0.86,
  contextUsed: false,
  replyContextUsed: false,
  resolverStatus: 'RESOLVED',
  decision: 'CREATE',
  reason: 'READY_TO_CREATE',
  ...overrides,
});

const parserResult: TelegramParserResult = {
  matched: true,
  eventType: 'ACCIDENT',
  intent: 'REPORT',
  state: 'ACTIVE',
  locationText: 'Комарова',
  locationAlias: 'komarova',
  locations: [{ text: 'Комарова', alias: 'komarova' }],
  locationResolutionAllowed: true,
  confidence: 0.86,
  matchedTerms: ['авария'],
  contextUsed: false,
};

const reportEntry = (event: NormalizedTelegramEvent) => {
  const message: TelegramMessage = {
    externalId: event.externalId,
    source: 'TELEGRAM',
    cityId: event.cityId,
    chatId: event.sourceChatId,
    text: 'авария на комарова @participant +79990000000',
    publishedAt: event.timestamp,
    authorName: 'Private Author',
    rawSourceType: 'message',
  };
  const result: TelegramDryRunIngestionResult = {
    parserResult,
    events: [event],
  };

  return { message, result };
};

describe('Telegram ingestion dry-run diagnostics', () => {
  it('uses 300 by default and accepts limits up to 1000', () => {
    expect(parseTelegramIngestionDryRunLimit([])).toBe(300);
    expect(parseTelegramIngestionDryRunLimit(['--limit', '1000'])).toBe(1000);
    expect(() =>
      parseTelegramIngestionDryRunLimit(['--limit', '1001']),
    ).toThrow('INVALID_LIMIT');
  });

  it('builds compact decision statistics and sanitized samples', () => {
    const report = buildTelegramDryRunReport([
      reportEntry(normalizedEvent()),
      reportEntry(
        normalizedEvent({
          externalId: 'message-2',
          telegramMessageId: 'message-2',
          decision: 'REVIEW',
          reason: 'LOCATION_AMBIGUOUS',
          resolverStatus: 'AMBIGUOUS',
          latitude: null,
          longitude: null,
        }),
      ),
    ]);

    expect(report).toMatchObject({
      total: 2,
      normalized: 2,
      parserMatched: 2,
      resolverResolved: 1,
      resolverAmbiguous: 1,
      decisions: { CREATE: 1, REVIEW: 1 },
      reviewReasons: { LOCATION_AMBIGUOUS: 1 },
    });
    expect(report.samples.review[0].textExcerpt).toContain('[user]');
    expect(report.samples.review[0].textExcerpt).toContain('[number]');
    expect(JSON.stringify(report)).not.toContain('Private Author');
  });

  it('previews duplicate groups without changing decisions', () => {
    const first = normalizedEvent();
    const second = normalizedEvent({
      externalId: 'message-2',
      telegramMessageId: 'message-2',
      timestamp: '2026-08-31T08:20:00.000Z',
    });
    const outsideWindow = normalizedEvent({
      externalId: 'message-3',
      telegramMessageId: 'message-3',
      timestamp: '2026-08-31T09:00:00.000Z',
    });

    const preview = buildDuplicatePreview([first, second, outsideWindow]);

    expect(preview).toMatchObject({
      groupCount: 1,
      groups: [{ eventType: 'ACCIDENT', size: 2 }],
    });
    expect(
      [first, second, outsideWindow].every(
        ({ decision }) => decision === 'CREATE',
      ),
    ).toBe(true);
  });
});
