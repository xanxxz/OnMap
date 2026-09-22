import type { TelegramDryRunReportEntry } from '../ingestion/telegram-ingestion-report';
import type {
  TelegramIngestionDecision,
  TelegramIngestionResolverStatus,
} from '../ingestion/telegram-ingestion.types';
import type {
  TelegramParserEventType,
  TelegramParserIntent,
  TelegramParserState,
} from '../parser/telegram-parser.types';

const INTENTS: readonly TelegramParserIntent[] = [
  'REPORT',
  'QUESTION',
  'UPDATE',
  'RESOLUTION',
  'NOISE',
];
const EVENT_TYPES: readonly TelegramParserEventType[] = [
  'DPS',
  'ACCIDENT',
  'TRAFFIC_JAM',
  'ROAD_CLOSURE',
  'ROADWORKS',
  'HAZARD',
  'ROAD_STATE',
  'OTHER',
];
const STATES: readonly TelegramParserState[] = [
  'ACTIVE',
  'RESOLVED',
  'UNKNOWN',
];
const RESOLVER_STATUSES: readonly TelegramIngestionResolverStatus[] = [
  'RESOLVED',
  'AMBIGUOUS',
  'NOT_FOUND',
  'MULTIPLE',
  'SKIPPED',
];
const DECISIONS: readonly TelegramIngestionDecision[] = [
  'CREATE',
  'UPDATE',
  'RESOLVE',
  'REVIEW',
  'IGNORE',
];

export interface TelegramHistoricalValidationReport {
  readonly messages: {
    readonly processed: number;
  };
  readonly parser: {
    readonly matched: number;
    readonly noiseOrUnmatched: number;
  };
  readonly intents: Readonly<Record<TelegramParserIntent, number>>;
  readonly eventTypes: Readonly<Record<TelegramParserEventType, number>>;
  readonly states: Readonly<Record<TelegramParserState, number>>;
  readonly resolverCandidates: {
    readonly total: number;
    readonly counts: Readonly<Record<TelegramIngestionResolverStatus, number>>;
  };
  readonly decisionCandidates: {
    readonly total: number;
    readonly counts: Readonly<Record<TelegramIngestionDecision, number>>;
  };
  readonly reviewRatePercent: number;
  readonly reviewReasons: readonly {
    readonly reason: string;
    readonly count: number;
    readonly percentage: number;
  }[];
  readonly topUnknownLocations: readonly {
    readonly candidate: string;
    readonly count: number;
    readonly examples: readonly string[];
    readonly classification:
      | 'LIKELY_LOCAL_NAME'
      | 'COMPOSITE_PHRASE'
      | 'PARSER_NOISE'
      | 'KNOWN_LOCATION_PLUS_CONTEXT'
      | 'NEEDS_USER_CONFIRMATION';
  }[];
  readonly streetGeometryUnavailable: number;
  readonly reviewAnalysis: readonly {
    readonly messageId: string;
    readonly text: string;
    readonly intent: TelegramParserIntent;
    readonly eventType: TelegramParserEventType;
    readonly parsedLocations: readonly {
      readonly text: string;
      readonly alias: string | null;
    }[];
    readonly contextSource: string;
    readonly contextMessageId: string | null;
    readonly resolverStatus: TelegramIngestionResolverStatus;
    readonly reviewReason: string;
  }[];
}

export const buildTelegramHistoricalValidationReport = (
  entries: readonly TelegramDryRunReportEntry[],
): TelegramHistoricalValidationReport => {
  const events = entries.flatMap(({ result }) => result.events);
  const reviewEvents = events.filter(({ decision }) => decision === 'REVIEW');
  const matched = entries.filter(
    ({ result }) => result.parserResult.matched,
  ).length;

  return {
    messages: {
      processed: entries.length,
    },
    parser: {
      matched,
      noiseOrUnmatched: entries.length - matched,
    },
    intents: countValues(
      entries.map(({ result }) => result.parserResult.intent),
      INTENTS,
    ),
    eventTypes: countValues(
      entries.map(({ result }) => result.parserResult.eventType),
      EVENT_TYPES,
    ),
    states: countValues(
      entries.map(({ result }) => result.parserResult.state),
      STATES,
    ),
    resolverCandidates: {
      total: events.length,
      counts: countValues(
        events.map(({ resolverStatus }) => resolverStatus),
        RESOLVER_STATUSES,
      ),
    },
    decisionCandidates: {
      total: events.length,
      counts: countValues(
        events.map(({ decision }) => decision),
        DECISIONS,
      ),
    },
    reviewRatePercent: percentage(reviewEvents.length, entries.length),
    reviewReasons: groupReasons(reviewEvents, entries.length),
    topUnknownLocations: groupUnknownLocations(entries),
    streetGeometryUnavailable: events.filter(
      ({ reason }) => reason === 'STREET_GEOMETRY_UNAVAILABLE',
    ).length,
    reviewAnalysis: entries.flatMap(({ message, result }) =>
      result.events
        .filter(({ decision }) => decision === 'REVIEW')
        .map((event) => ({
          messageId: message.externalId,
          text: sanitizeExample(message.text),
          intent: result.parserResult.intent,
          eventType: result.parserResult.eventType,
          parsedLocations: result.parserResult.locations.map((location) => ({
            text: location.text,
            alias: location.alias,
          })),
          contextSource: result.parserResult.contextSource ?? 'NONE',
          contextMessageId: result.parserResult.contextMessageId ?? null,
          resolverStatus: event.resolverStatus,
          reviewReason: event.reason,
        })),
    ),
  };
};

const countValues = <T extends string>(
  values: readonly T[],
  expected: readonly T[],
): Record<T, number> => {
  const counts = Object.fromEntries(
    expected.map((value) => [value, 0]),
  ) as Record<T, number>;

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
};

const groupReasons = (
  events: readonly TelegramDryRunReportEntry['result']['events'][number][],
  totalMessages: number,
) => {
  const counts = new Map<string, number>();

  for (const event of events) {
    counts.set(event.reason, (counts.get(event.reason) ?? 0) + 1);
  }

  return [...counts]
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: percentage(count, totalMessages),
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.reason.localeCompare(right.reason),
    );
};

const groupUnknownLocations = (
  entries: readonly TelegramDryRunReportEntry[],
) => {
  const unknown = new Map<string, { count: number; examples: Set<string> }>();

  for (const { message, result } of entries) {
    for (const event of result.events) {
      if (
        event.resolverStatus !== 'NOT_FOUND' ||
        event.locationInput === null ||
        event.locationInput.trim().length === 0
      ) {
        continue;
      }

      const candidate = event.locationInput.trim().toLocaleLowerCase('ru-RU');
      const item = unknown.get(candidate) ?? { count: 0, examples: new Set() };
      item.count += 1;

      if (item.examples.size < 3) {
        item.examples.add(sanitizeExample(message.text));
      }

      unknown.set(candidate, item);
    }
  }

  return [...unknown]
    .map(([candidate, item]) => ({
      candidate,
      count: item.count,
      examples: [...item.examples],
      classification: classifyUnknownCandidate(candidate),
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.candidate.localeCompare(right.candidate),
    )
    .slice(0, 20);
};

const classifyUnknownCandidate = (
  candidate: string,
): TelegramHistoricalValidationReport['topUnknownLocations'][number]['classification'] => {
  if (
    /^(?:где+|где перекопано|данный момент|было час назад|десять минут назад)$/u.test(
      candidate,
    ) ||
    /(?:всех стопает|тормазнула когото)/u.test(candidate)
  ) {
    return 'PARSER_NOISE';
  }

  if (/(?:новому мосту|первом|ивановка|набережной|держухе)/u.test(candidate)) {
    return 'KNOWN_LOCATION_PLUS_CONTEXT';
  }

  if (
    /[/,]/u.test(candidate) ||
    candidate.split(' ').filter(Boolean).length >= 3
  ) {
    return 'COMPOSITE_PHRASE';
  }

  if (/\d|\bкп\b/u.test(candidate)) {
    return 'NEEDS_USER_CONFIRMATION';
  }

  return 'LIKELY_LOCAL_NAME';
};

const sanitizeExample = (text: string): string =>
  text
    .replace(/https?:\/\/\S+/giu, '[link]')
    .replace(/@[\p{L}\p{N}_]+/gu, '[user]')
    .replace(/(?:\+?\d[\s()-]*){7,}/gu, '[number]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120);

const percentage = (count: number, total: number): number =>
  total === 0 ? 0 : Number(((count / total) * 100).toFixed(2));
