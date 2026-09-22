import type { TelegramMessage } from '../telegram.types';

import {
  TELEGRAM_INGESTION_DEDUP_PREVIEW_WINDOW_MS,
  TELEGRAM_INGESTION_SAMPLE_LIMIT,
} from './telegram-ingestion.constants';
import type {
  NormalizedTelegramEvent,
  TelegramDryRunIngestionResult,
  TelegramDryRunReport,
  TelegramDryRunSample,
  TelegramIngestionDecision,
  TelegramPotentialDuplicateGroup,
} from './telegram-ingestion.types';

export interface TelegramDryRunReportEntry {
  readonly message: TelegramMessage;
  readonly result: TelegramDryRunIngestionResult;
}

const DECISIONS: readonly TelegramIngestionDecision[] = [
  'CREATE',
  'UPDATE',
  'RESOLVE',
  'REVIEW',
  'IGNORE',
];

const IGNORE_REASONS = [
  'NOISE',
  'QUESTION',
  'UNSUPPORTED_EVENT_TYPE',
  'LOW_CONFIDENCE',
] as const;

const REVIEW_REASONS = [
  'LOCATION_NOT_FOUND',
  'LOCATION_AMBIGUOUS',
  'AREA_GEOMETRY_UNAVAILABLE',
  'STREET_GEOMETRY_UNAVAILABLE',
  'MISSING_CONTEXT',
  'RESOLUTION_WITHOUT_LOCATION',
  'MULTI_LOCATION_AMBIGUOUS',
  'LOW_CONFIDENCE',
] as const;

export const buildTelegramDryRunReport = (
  entries: readonly TelegramDryRunReportEntry[],
): TelegramDryRunReport => {
  const events = entries.flatMap(({ result }) => result.events);
  const messagesById = new Map(
    entries.map(({ message }) => [message.externalId, message]),
  );

  return {
    total: entries.length,
    normalized: entries.length,
    parserMatched: entries.filter(({ result }) => result.parserResult.matched)
      .length,
    resolverResolved: events.filter(
      ({ resolverStatus }) => resolverStatus === 'RESOLVED',
    ).length,
    resolverAmbiguous: events.filter(
      ({ resolverStatus }) => resolverStatus === 'AMBIGUOUS',
    ).length,
    resolverNotFound: events.filter(
      ({ resolverStatus }) => resolverStatus === 'NOT_FOUND',
    ).length,
    decisions: Object.fromEntries(
      DECISIONS.map((decision) => [
        decision,
        events.filter((event) => event.decision === decision).length,
      ]),
    ) as Record<TelegramIngestionDecision, number>,
    ignoreReasons: countReasons(events, 'IGNORE', IGNORE_REASONS),
    reviewReasons: countReasons(events, 'REVIEW', REVIEW_REASONS),
    samples: {
      create: samples(events, messagesById, 'CREATE'),
      resolve: samples(events, messagesById, 'RESOLVE'),
      review: samples(events, messagesById, 'REVIEW'),
    },
    duplicatePreview: buildDuplicatePreview(events),
  };
};

export const buildDuplicatePreview = (
  events: readonly NormalizedTelegramEvent[],
): TelegramDryRunReport['duplicatePreview'] => {
  const candidates = events
    .filter(({ decision }) =>
      ['CREATE', 'UPDATE', 'RESOLVE'].includes(decision),
    )
    .map((event) => ({ event, key: duplicateLocationKey(event) }))
    .filter(
      (
        candidate,
      ): candidate is { event: NormalizedTelegramEvent; key: string } =>
        candidate.key !== null &&
        Number.isFinite(Date.parse(candidate.event.timestamp)),
    );
  const byIdentity = new Map<string, NormalizedTelegramEvent[]>();

  for (const { event, key } of candidates) {
    const identity = `${event.eventType}:${key}`;
    const group = byIdentity.get(identity) ?? [];

    group.push(event);
    byIdentity.set(identity, group);
  }

  const duplicateGroups: TelegramPotentialDuplicateGroup[] = [];

  for (const [identity, identityEvents] of byIdentity) {
    const sorted = [...identityEvents].sort(
      (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
    );
    let cluster: NormalizedTelegramEvent[] = [];

    for (const event of sorted) {
      const previous = cluster.at(-1);

      if (
        previous !== undefined &&
        Date.parse(event.timestamp) - Date.parse(previous.timestamp) >
          TELEGRAM_INGESTION_DEDUP_PREVIEW_WINDOW_MS
      ) {
        rememberDuplicateGroup(duplicateGroups, identity, cluster);
        cluster = [];
      }

      cluster.push(event);
    }

    rememberDuplicateGroup(duplicateGroups, identity, cluster);
  }

  const groups = duplicateGroups
    .sort(
      (left, right) =>
        right.size - left.size || Date.parse(right.to) - Date.parse(left.to),
    )
    .slice(0, TELEGRAM_INGESTION_SAMPLE_LIMIT);

  return { groupCount: duplicateGroups.length, groups };
};

const countReasons = (
  events: readonly NormalizedTelegramEvent[],
  decision: TelegramIngestionDecision,
  expectedReasons: readonly string[],
): Readonly<Record<string, number>> => {
  const counts = Object.fromEntries(
    expectedReasons.map((reason) => [reason, 0]),
  );

  for (const event of events) {
    if (event.decision === decision) {
      counts[event.reason] = (counts[event.reason] ?? 0) + 1;
    }
  }

  return counts;
};

const samples = (
  events: readonly NormalizedTelegramEvent[],
  messagesById: ReadonlyMap<string, TelegramMessage>,
  decision: TelegramIngestionDecision,
): readonly TelegramDryRunSample[] =>
  events
    .filter((event) => event.decision === decision)
    .slice(0, TELEGRAM_INGESTION_SAMPLE_LIMIT)
    .map((event) => ({
      textExcerpt: sanitizeText(messagesById.get(event.externalId)?.text ?? ''),
      eventType: event.eventType,
      intent: event.intent,
      locationInput: event.locationInput,
      canonicalLocation: event.canonicalLocationTitle,
      resolverStatus: event.resolverStatus,
      parserConfidence: event.parserConfidence,
      locationConfidence: event.locationConfidence,
      decisionReason: event.reason,
    }));

const duplicateLocationKey = (
  event: NormalizedTelegramEvent,
): string | null => {
  if (event.canonicalLocationId !== null) {
    return `canonical:${event.canonicalLocationId}`;
  }

  if (event.latitude !== null && event.longitude !== null) {
    return `coordinates:${event.latitude.toFixed(4)},${event.longitude.toFixed(4)}`;
  }

  return null;
};

const rememberDuplicateGroup = (
  groups: TelegramPotentialDuplicateGroup[],
  identity: string,
  events: readonly NormalizedTelegramEvent[],
): void => {
  if (events.length < 2) {
    return;
  }

  const separatorIndex = identity.indexOf(':');

  groups.push({
    eventType: events[0].eventType,
    locationKey: identity.slice(separatorIndex + 1),
    size: events.length,
    from: events[0].timestamp,
    to: events[events.length - 1].timestamp,
  });
};

const sanitizeText = (text: string): string =>
  text
    .replace(/https?:\/\/\S+/giu, '[link]')
    .replace(/@[\p{L}\p{N}_]+/gu, '[user]')
    .replace(/(?:\+?\d[\s()-]*){7,}/gu, '[number]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120);
