import { requireCityConfig } from '../../../cities/city.registry';
import type { CityConfig } from '../../../cities/city.types';
import type { CityBounds } from '../../tomtom/tomtom.types';
import { TelegramLocationResolver } from '../location-resolver/telegram-location-resolver';
import type { TelegramLocationResolutionResult } from '../location-resolver/telegram-location-resolver.types';
import { TelegramMessageParser } from '../parser/telegram-message.parser';
import type {
  TelegramParserEventType,
  TelegramParserLocation,
  TelegramParserResult,
} from '../parser/telegram-parser.types';

import {
  TELEGRAM_INGESTION_SUPPORTED_EVENT_TYPES,
  TELEGRAM_INGESTION_THRESHOLDS,
} from './telegram-ingestion.constants';
import type {
  NormalizedTelegramEvent,
  TelegramDryRunIngestionInput,
  TelegramDryRunIngestionResult,
  TelegramIngestionDecision,
  TelegramIngestionDecisionReason,
  TelegramIngestionResolverStatus,
} from './telegram-ingestion.types';

type Parser = Pick<TelegramMessageParser, 'parse'>;
type LocationResolver = Pick<TelegramLocationResolver, 'resolveParserResult'>;

interface Decision {
  readonly decision: TelegramIngestionDecision;
  readonly reason: TelegramIngestionDecisionReason;
}

export class TelegramDryRunIngestionPipeline {
  constructor(
    private readonly parser: Parser,
    private readonly locationResolver: LocationResolver,
    private readonly cityConfigProvider: (
      cityId: string,
    ) => CityConfig = requireCityConfig,
  ) {}

  async process(
    input: TelegramDryRunIngestionInput,
  ): Promise<TelegramDryRunIngestionResult> {
    const city = this.cityConfigProvider(input.message.cityId);
    const parserResult = this.parser.parse({
      message: input.message,
      ...(input.replyMessage === undefined
        ? {}
        : { replyMessage: input.replyMessage }),
      previousMessages: input.previousMessages ?? [],
    });
    const replyContextUsed =
      input.replyMessage !== undefined && parserResult.contextUsed;

    if (!parserResult.matched || parserResult.intent === 'NOISE') {
      return {
        parserResult,
        events: [
          buildSkippedEvent(
            input,
            parserResult,
            replyContextUsed,
            'IGNORE',
            'NOISE',
          ),
        ],
      };
    }

    if (parserResult.intent === 'QUESTION') {
      return {
        parserResult,
        events: [
          buildSkippedEvent(
            input,
            parserResult,
            replyContextUsed,
            'IGNORE',
            'QUESTION',
          ),
        ],
      };
    }

    if (!isSupportedEventType(parserResult.eventType)) {
      return {
        parserResult,
        events: [
          buildSkippedEvent(
            input,
            parserResult,
            replyContextUsed,
            'IGNORE',
            'UNSUPPORTED_EVENT_TYPE',
          ),
        ],
      };
    }

    if (
      parserResult.confidence <
        TELEGRAM_INGESTION_THRESHOLDS.parserReviewConfidence &&
      parserResult.intent !== 'RESOLUTION'
    ) {
      return {
        parserResult,
        events: [
          buildSkippedEvent(
            input,
            parserResult,
            replyContextUsed,
            'IGNORE',
            'LOW_CONFIDENCE',
          ),
        ],
      };
    }

    const resolutions = await this.locationResolver.resolveParserResult(
      parserResult,
      city.id,
    );

    if (parserResult.locations.length > 1 && parserResult.intent !== 'REPORT') {
      return {
        parserResult,
        events: [
          buildSkippedEvent(
            input,
            parserResult,
            replyContextUsed,
            'REVIEW',
            'MULTI_LOCATION_AMBIGUOUS',
            'MULTIPLE',
          ),
        ],
      };
    }

    const locations = locationsFor(parserResult);
    const events = resolutions.map((resolution, index) =>
      this.toEvent(
        input,
        parserResult,
        replyContextUsed,
        locations[index] ?? null,
        resolution,
        city.coverageBounds,
      ),
    );

    if (events.length > 0) {
      return { parserResult, events };
    }

    return {
      parserResult,
      events: [
        buildSkippedEvent(
          input,
          parserResult,
          replyContextUsed,
          'REVIEW',
          parserResult.intent === 'RESOLUTION'
            ? 'RESOLUTION_WITHOUT_LOCATION'
            : 'LOCATION_NOT_FOUND',
          'NOT_FOUND',
        ),
      ],
    };
  }

  private toEvent(
    input: TelegramDryRunIngestionInput,
    parserResult: TelegramParserResult,
    replyContextUsed: boolean,
    location: TelegramParserLocation | null,
    resolution: TelegramLocationResolutionResult,
    bounds: CityBounds,
  ): NormalizedTelegramEvent {
    const decision = decide(parserResult, resolution, bounds);
    const resolvedCoordinates = getResolvedCoordinates(resolution);

    return {
      source: 'TELEGRAM',
      cityId: input.message.cityId,
      telegramMessageId: input.message.externalId,
      externalId: input.message.externalId,
      sourceChatId: input.message.chatId,
      timestamp: input.message.publishedAt,
      messageVersion: messageVersion(input.message),
      eventType: parserResult.eventType,
      intent: parserResult.intent,
      state: parserResult.state,
      sourceText: cleanSourceText(input.message.text),
      locationInput: location?.text ?? parserResult.locationText,
      canonicalLocationId:
        resolution.status === 'RESOLVED' && resolution.source === 'LOCAL'
          ? resolution.localLocationId
          : (location?.alias ?? null),
      canonicalLocationTitle:
        resolution.status === 'RESOLVED'
          ? resolution.canonicalTitle
          : (resolution.canonicalTitle ?? null),
      latitude: resolvedCoordinates?.latitude ?? null,
      longitude: resolvedCoordinates?.longitude ?? null,
      geometry: resolution.status === 'RESOLVED' ? resolution.geometry : null,
      locationPrecision: resolution.precision,
      geometryProvider: resolution.geometryProvider,
      geometryStatus: resolution.geometryStatus,
      locationConfidence: resolution.confidence,
      parserConfidence: parserResult.confidence,
      contextUsed: parserResult.contextUsed,
      replyContextUsed,
      resolverStatus: resolution.status,
      ...decision,
    };
  }
}

const decide = (
  parserResult: TelegramParserResult,
  resolution: TelegramLocationResolutionResult,
  bounds: CityBounds,
): Decision => {
  if (resolution.status === 'AMBIGUOUS') {
    return review('LOCATION_AMBIGUOUS');
  }

  if (resolution.status === 'NOT_FOUND') {
    if (resolution.reason === 'STREET_GEOMETRY_UNAVAILABLE') {
      return review('STREET_GEOMETRY_UNAVAILABLE');
    }

    if (resolution.reason === 'AREA_GEOMETRY_UNAVAILABLE') {
      return review('AREA_GEOMETRY_UNAVAILABLE');
    }

    return review(
      parserResult.intent === 'RESOLUTION'
        ? 'RESOLUTION_WITHOUT_LOCATION'
        : 'LOCATION_NOT_FOUND',
    );
  }

  const coordinates = getResolvedCoordinates(resolution);

  if (coordinates === null) {
    return review('MISSING_COORDINATES');
  }

  if (!isInsideBounds(coordinates.latitude, coordinates.longitude, bounds)) {
    return review('LOCATION_OUTSIDE_SUPPORTED_AREA');
  }

  if (parserResult.intent === 'REPORT') {
    if (
      parserResult.confidence <
        TELEGRAM_INGESTION_THRESHOLDS.createParserConfidence ||
      resolution.confidence < TELEGRAM_INGESTION_THRESHOLDS.locationConfidence
    ) {
      return review('LOW_CONFIDENCE');
    }

    return parserResult.state === 'ACTIVE'
      ? { decision: 'CREATE', reason: 'READY_TO_CREATE' }
      : review('UNSAFE_STATE');
  }

  if (parserResult.intent === 'UPDATE') {
    if (
      parserResult.confidence <
        TELEGRAM_INGESTION_THRESHOLDS.updateParserConfidence ||
      resolution.confidence <
        TELEGRAM_INGESTION_THRESHOLDS.updateLocationConfidence
    ) {
      return review('LOW_CONFIDENCE');
    }

    return parserResult.contextUsed
      ? { decision: 'UPDATE', reason: 'UPDATE_CANDIDATE' }
      : review('MISSING_CONTEXT');
  }

  if (parserResult.intent === 'RESOLUTION') {
    if (
      parserResult.confidence <
        TELEGRAM_INGESTION_THRESHOLDS.resolveParserConfidence ||
      resolution.confidence < TELEGRAM_INGESTION_THRESHOLDS.locationConfidence
    ) {
      return review('LOW_CONFIDENCE');
    }

    return parserResult.state === 'RESOLVED'
      ? { decision: 'RESOLVE', reason: 'RESOLVE_CANDIDATE' }
      : review('UNSAFE_STATE');
  }

  return { decision: 'IGNORE', reason: 'NOISE' };
};

const review = (reason: TelegramIngestionDecisionReason): Decision => ({
  decision: 'REVIEW',
  reason,
});

const buildSkippedEvent = (
  input: TelegramDryRunIngestionInput,
  parserResult: TelegramParserResult,
  replyContextUsed: boolean,
  decision: TelegramIngestionDecision,
  reason: TelegramIngestionDecisionReason,
  resolverStatus: TelegramIngestionResolverStatus = 'SKIPPED',
): NormalizedTelegramEvent => ({
  source: 'TELEGRAM',
  cityId: input.message.cityId,
  telegramMessageId: input.message.externalId,
  externalId: input.message.externalId,
  sourceChatId: input.message.chatId,
  timestamp: input.message.publishedAt,
  messageVersion: messageVersion(input.message),
  eventType: parserResult.eventType,
  intent: parserResult.intent,
  state: parserResult.state,
  sourceText: cleanSourceText(input.message.text),
  locationInput: parserResult.locationText,
  canonicalLocationId: parserResult.locationAlias,
  canonicalLocationTitle: null,
  latitude: null,
  longitude: null,
  geometry: null,
  locationPrecision: null,
  geometryProvider: null,
  geometryStatus: null,
  locationConfidence: null,
  parserConfidence: parserResult.confidence,
  contextUsed: parserResult.contextUsed,
  replyContextUsed,
  resolverStatus,
  decision,
  reason,
});

const locationsFor = (
  parserResult: TelegramParserResult,
): readonly (TelegramParserLocation | null)[] =>
  parserResult.locations.length > 0
    ? parserResult.locations
    : parserResult.locationText === null
      ? [null]
      : [
          {
            text: parserResult.locationText,
            alias: parserResult.locationAlias,
          },
        ];

const isSupportedEventType = (eventType: TelegramParserEventType): boolean =>
  TELEGRAM_INGESTION_SUPPORTED_EVENT_TYPES.includes(eventType);

const getResolvedCoordinates = (
  resolution: TelegramLocationResolutionResult,
): { latitude: number; longitude: number } | null => {
  if (resolution.status !== 'RESOLVED') {
    return null;
  }

  const latitude: unknown = resolution.latitude;
  const longitude: unknown = resolution.longitude;

  return typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
};

const cleanSourceText = (value: string): string =>
  value.replace(/\s+/gu, ' ').trim().slice(0, 1_000);

const isInsideBounds = (
  latitude: number,
  longitude: number,
  bounds: CityBounds,
): boolean =>
  latitude >= bounds.south &&
  latitude <= bounds.north &&
  longitude >= bounds.west &&
  longitude <= bounds.east;

const messageVersion = (
  message: TelegramDryRunIngestionInput['message'],
): string => message.editedAt ?? message.publishedAt;
