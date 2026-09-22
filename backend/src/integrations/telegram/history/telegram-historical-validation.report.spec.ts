import type { TelegramDryRunReportEntry } from '../ingestion/telegram-ingestion-report';
import type { TelegramMessage } from '../telegram.types';
import { buildTelegramHistoricalValidationReport } from './telegram-historical-validation.report';

describe('buildTelegramHistoricalValidationReport', () => {
  it('keeps message, parser, resolver-candidate and decision-candidate layers consistent', () => {
    const entries = [
      entry('one', true, ['CREATE']),
      entry('two', false, ['IGNORE', 'IGNORE']),
    ];
    const report = buildTelegramHistoricalValidationReport(entries);

    expect(report.messages.processed).toBe(2);
    expect(report.parser.matched + report.parser.noiseOrUnmatched).toBe(
      report.messages.processed,
    );
    expect(report.resolverCandidates.total).toBe(3);
    expect(
      Object.values(report.resolverCandidates.counts).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(report.resolverCandidates.total);
    expect(
      Object.values(report.decisionCandidates.counts).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(report.decisionCandidates.total);
  });

  const entry = (
    suffix: string,
    matched: boolean,
    decisions: readonly ('CREATE' | 'IGNORE')[],
  ): TelegramDryRunReportEntry => {
    const message: TelegramMessage = {
      externalId: `message-${suffix}`,
      source: 'TELEGRAM',
      cityId: 'balakovo',
      chatId: '-1001',
      text: matched ? 'авария на комарова' : 'спасибо',
      publishedAt: '2026-09-01T00:00:00.000Z',
      rawSourceType: 'message',
    };

    return {
      message,
      result: {
        parserResult: {
          matched,
          eventType: matched ? 'ACCIDENT' : 'OTHER',
          intent: matched ? 'REPORT' : 'NOISE',
          state: matched ? 'ACTIVE' : 'UNKNOWN',
          locationText: matched ? 'Комарова' : null,
          locationAlias: matched ? 'komarova' : null,
          locations: matched ? [{ text: 'Комарова', alias: 'komarova' }] : [],
          locationResolutionAllowed: matched,
          confidence: matched ? 0.9 : 0,
          matchedTerms: matched ? ['авария'] : [],
          contextUsed: false,
          contextSource: 'NONE',
          contextMessageId: null,
        },
        events: decisions.map((decision) => ({
          source: 'TELEGRAM' as const,
          cityId: 'balakovo',
          telegramMessageId: message.externalId,
          externalId: message.externalId,
          sourceChatId: '-1001',
          timestamp: message.publishedAt,
          eventType: matched ? ('ACCIDENT' as const) : ('OTHER' as const),
          intent: matched ? ('REPORT' as const) : ('NOISE' as const),
          state: matched ? ('ACTIVE' as const) : ('UNKNOWN' as const),
          sourceText: message.text,
          locationInput: matched ? 'Комарова' : null,
          canonicalLocationId: matched ? 'komarova' : null,
          canonicalLocationTitle: matched ? 'Комарова' : null,
          latitude: matched ? 52 : null,
          longitude: matched ? 47 : null,
          geometry: matched
            ? ({ type: 'Point', coordinates: [47, 52] } as const)
            : null,
          locationPrecision: matched ? ('STREET' as const) : null,
          geometryProvider: null,
          geometryStatus: matched ? ('RESOLVED' as const) : null,
          locationConfidence: matched ? 0.99 : null,
          parserConfidence: matched ? 0.9 : 0,
          contextUsed: false,
          replyContextUsed: false,
          resolverStatus: matched
            ? ('RESOLVED' as const)
            : ('SKIPPED' as const),
          decision,
          reason:
            decision === 'CREATE'
              ? ('READY_TO_CREATE' as const)
              : ('NOISE' as const),
        })),
      },
    };
  };
});
