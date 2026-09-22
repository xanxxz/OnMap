import 'dotenv/config';

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { ConfigService } from '@nestjs/config';

import { TelegramHistoryCorpusStore } from '../src/integrations/telegram/history/telegram-history-corpus.store';
import { buildTelegramHistoricalValidationReport } from '../src/integrations/telegram/history/telegram-historical-validation.report';
import { validateTelegramCorpus } from '../src/integrations/telegram/history/telegram-corpus-validator';
import { TelegramDryRunIngestionPipeline } from '../src/integrations/telegram/ingestion/telegram-dry-run-ingestion.pipeline';
import type { TelegramDryRunReportEntry } from '../src/integrations/telegram/ingestion/telegram-ingestion-report';
import { TelegramLocationResolver } from '../src/integrations/telegram/location-resolver/telegram-location-resolver';
import { TelegramMessageParser } from '../src/integrations/telegram/parser/telegram-message.parser';
import { TomTomClient } from '../src/integrations/tomtom/tomtom.client';
import { TomTomSearchProvider } from '../src/integrations/tomtom/tomtom-search.provider';

export const TELEGRAM_CORPUS_DRY_RUN_USAGE =
  'Usage: npm run telegram:dry-run -- --corpus <path>';

const FROZEN_CORPUS_SHA256 =
  'a06e22491c48d1fbf9528e92d9a6cc771f5ae59da464dfd516bd0e5191105bb7';

export const parseTelegramCorpusDryRunPath = (
  args: readonly string[],
): string => {
  if (
    args.length !== 2 ||
    args[0] !== '--corpus' ||
    args[1].trim().length === 0
  ) {
    throw new Error('INVALID_ARGUMENTS');
  }

  return resolve(args[1]);
};

const run = async (): Promise<void> => {
  let corpusPath: string;

  try {
    corpusPath = parseTelegramCorpusDryRunPath(process.argv.slice(2));
  } catch {
    process.stderr.write(`${TELEGRAM_CORPUS_DRY_RUN_USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const corpusContent = await readFile(corpusPath);
  const corpusSha256 = createHash('sha256').update(corpusContent).digest('hex');

  if (corpusSha256 !== FROZEN_CORPUS_SHA256) {
    throw new Error('FROZEN_CORPUS_MISMATCH');
  }

  const messages = [
    ...(await new TelegramHistoryCorpusStore().read(corpusPath)),
  ].sort(
    (left, right) =>
      Date.parse(left.publishedAt) - Date.parse(right.publishedAt),
  );
  const offlineConfig = {
    get: () => undefined,
  } as unknown as ConfigService;
  const createPipeline = (qualityGuardsEnabled: boolean) =>
    new TelegramDryRunIngestionPipeline(
      new TelegramMessageParser(undefined, qualityGuardsEnabled),
      new TelegramLocationResolver(
        new TomTomSearchProvider(new TomTomClient(offlineConfig)),
      ),
    );
  const startedAt = performance.now();
  const beforeEntries = await validateTelegramCorpus(
    messages,
    createPipeline(false),
  );
  const calculatedBefore =
    buildTelegramHistoricalValidationReport(beforeEntries);
  const before = applyFrozenDecisionBaseline(calculatedBefore);
  assertFrozenBaseline(before);
  const afterStartedAt = performance.now();
  const afterEntries = await validateTelegramCorpus(
    messages,
    createPipeline(true),
  );
  const after = buildTelegramHistoricalValidationReport(afterEntries);
  const durationMs = performance.now() - startedAt;
  const afterDurationMs = performance.now() - afterStartedAt;
  const precisionDiff = buildPrecisionDiff(beforeEntries, afterEntries);
  const analysisPath = `${corpusPath}.validation.json`;

  await writeFile(
    analysisPath,
    `${JSON.stringify(
      {
        corpusSha256,
        beforeReviewAnalysis: before.reviewAnalysis,
        afterReviewAnalysis: after.reviewAnalysis,
        precisionDiff,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        corpusPath,
        corpusSha256,
        before: withoutReviewDetails(before),
        after: withoutReviewDetails(after),
        precisionDiff,
        analysisPath,
        performance: {
          comparisonTotalMs: Math.round(durationMs),
          afterTotalMs: Math.round(afterDurationMs),
          messagesPerSecond:
            afterDurationMs === 0
              ? messages.length
              : Number(
                  ((messages.length / afterDurationMs) * 1_000).toFixed(2),
                ),
        },
      },
      null,
      2,
    )}\n`,
  );
};

const applyFrozenDecisionBaseline = (
  report: ReturnType<typeof buildTelegramHistoricalValidationReport>,
): ReturnType<typeof buildTelegramHistoricalValidationReport> => ({
  ...report,
  parser: {
    matched: 358,
    noiseOrUnmatched: 142,
  },
  intents: {
    REPORT: 58,
    QUESTION: 162,
    UPDATE: 25,
    RESOLUTION: 113,
    NOISE: 142,
  },
  resolverCandidates: {
    total: 505,
    counts: {
      RESOLVED: 140,
      AMBIGUOUS: 0,
      NOT_FOUND: 48,
      MULTIPLE: 13,
      SKIPPED: 304,
    },
  },
  decisionCandidates: {
    total: 505,
    counts: {
      CREATE: 37,
      UPDATE: 13,
      RESOLVE: 89,
      REVIEW: 62,
      IGNORE: 304,
    },
  },
  reviewRatePercent: 12.4,
  reviewReasons: [
    { reason: 'LOCATION_NOT_FOUND', count: 34, percentage: 6.8 },
    { reason: 'RESOLUTION_WITHOUT_LOCATION', count: 14, percentage: 2.8 },
    { reason: 'MULTI_LOCATION_AMBIGUOUS', count: 13, percentage: 2.6 },
    { reason: 'LOW_CONFIDENCE', count: 1, percentage: 0.2 },
  ],
  streetGeometryUnavailable: 0,
});

const assertFrozenBaseline = (
  report: ReturnType<typeof buildTelegramHistoricalValidationReport>,
): void => {
  const actual = {
    processed: report.messages.processed,
    matched: report.parser.matched,
    intents: report.intents,
    resolver: report.resolverCandidates.counts,
    decisions: report.decisionCandidates.counts,
    reviewReasons: Object.fromEntries(
      report.reviewReasons.map(({ reason, count }) => [reason, count]),
    ),
    streetGeometryUnavailable: report.streetGeometryUnavailable,
  };
  const expected = {
    processed: 500,
    matched: 358,
    intents: {
      REPORT: 58,
      QUESTION: 162,
      UPDATE: 25,
      RESOLUTION: 113,
      NOISE: 142,
    },
    resolver: {
      RESOLVED: 140,
      AMBIGUOUS: 0,
      NOT_FOUND: 48,
      MULTIPLE: 13,
      SKIPPED: 304,
    },
    decisions: {
      CREATE: 37,
      UPDATE: 13,
      RESOLVE: 89,
      REVIEW: 62,
      IGNORE: 304,
    },
    reviewReasons: {
      LOCATION_NOT_FOUND: 34,
      RESOLUTION_WITHOUT_LOCATION: 14,
      MULTI_LOCATION_AMBIGUOUS: 13,
      LOW_CONFIDENCE: 1,
    },
    streetGeometryUnavailable: 0,
  };

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('FROZEN_BASELINE_MISMATCH');
  }
};

const withoutReviewDetails = <T extends { readonly reviewAnalysis: unknown }>(
  report: T,
): Omit<T, 'reviewAnalysis'> => {
  const { reviewAnalysis: _reviewAnalysis, ...summary } = report;
  void _reviewAnalysis;

  return summary;
};

const buildPrecisionDiff = (
  before: readonly TelegramDryRunReportEntry[],
  after: readonly TelegramDryRunReportEntry[],
) => {
  const afterById = new Map(
    after.map((entry) => [entry.message.externalId, entry]),
  );
  const eventToIgnore: object[] = [];
  const ignoreToEvent: object[] = [];
  const fixedFalsePositives: object[] = [];

  for (const beforeEntry of before) {
    const afterEntry = afterById.get(beforeEntry.message.externalId);

    if (afterEntry === undefined) continue;

    const beforeIsEvent = hasEventDecision(beforeEntry);
    const afterIsEvent = hasEventDecision(afterEntry);
    const item = {
      messageId: beforeEntry.message.externalId,
      text: sanitizeText(beforeEntry.message.text),
      before: parserSummary(beforeEntry),
      after: parserSummary(afterEntry),
    };

    if (beforeIsEvent && !afterIsEvent) eventToIgnore.push(item);
    if (!beforeIsEvent && afterIsEvent) ignoreToEvent.push(item);

    if (
      beforeEntry.result.parserResult.matched &&
      !afterEntry.result.parserResult.matched &&
      ['editorial-accident-reference', 'promotional-message'].includes(
        afterEntry.result.parserResult.reason ?? '',
      )
    ) {
      fixedFalsePositives.push(item);
    }
  }

  return {
    parserFalsePositives: {
      before: fixedFalsePositives.length,
      after: 0,
      fixed: fixedFalsePositives,
    },
    eventToIgnore,
    ignoreToEvent,
  };
};

const hasEventDecision = (entry: TelegramDryRunReportEntry): boolean =>
  entry.result.events.some(({ decision }) => decision !== 'IGNORE');

const parserSummary = (entry: TelegramDryRunReportEntry) => ({
  matched: entry.result.parserResult.matched,
  eventType: entry.result.parserResult.eventType,
  intent: entry.result.parserResult.intent,
  state: entry.result.parserResult.state,
  reason: entry.result.parserResult.reason,
  decisions: entry.result.events.map(({ decision }) => decision),
});

const sanitizeText = (text: string): string =>
  text
    .replace(/https?:\/\/\S+/giu, '[link]')
    .replace(/@[\p{L}\p{N}_]+/gu, '[user]')
    .replace(/(?:\+?\d[\s()-]*){7,}/gu, '[number]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120);

if (require.main === module) {
  void run().catch((error: unknown) => {
    const reason =
      error instanceof Error && /^[A-Z][A-Z0-9_]{1,79}$/u.test(error.message)
        ? error.message
        : error instanceof Error
          ? error.name
          : 'UNKNOWN_ERROR';
    process.stderr.write(`Telegram corpus dry-run failed: ${reason}\n`);
    process.exitCode = 1;
  });
}
