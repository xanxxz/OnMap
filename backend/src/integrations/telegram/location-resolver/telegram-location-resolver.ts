import { Injectable, Optional } from '@nestjs/common';

import { getCityConfig } from '../../../cities/city.registry';
import type {
  CityLocationConfig,
  StreetLocationGeometry,
  StreetLocationGeometryPart,
} from '../../../cities/city.types';
import { TomTomSearchProvider } from '../../tomtom/tomtom-search.provider';
import type {
  CityBounds,
  ExternalRoadEventGeometry,
  TomTomSearchCandidate,
} from '../../tomtom/tomtom.types';
import type {
  BalakovoLocationAlias,
  TelegramLocationDirection,
  TelegramParserEventType,
  TelegramParserLocation,
} from '../parser/telegram-parser.types';

import {
  TELEGRAM_LOCATION_RESOLVER_ALLOWED_EVENT_TYPES,
  TELEGRAM_LOCATION_RESOLVER_CITY_ID,
  TELEGRAM_LOCATION_RESOLVER_THRESHOLDS,
  TELEGRAM_LOCATION_SEARCH_STRATEGIES,
  TELEGRAM_VERIFIED_LOCAL_CONFIDENCE,
} from './telegram-location-resolver.constants';
import {
  locationPrecisionFor,
  type TelegramLocationPrecision,
} from './telegram-location-precision';
import type {
  TelegramLocationNotFoundReason,
  TelegramLocationParserResultInput,
  TelegramLocationResolutionCandidate,
  TelegramLocationResolutionDiagnostics,
  TelegramLocationResolutionInput,
  TelegramLocationResolutionResult,
} from './telegram-location-resolver.types';
import {
  type TelegramStreetGeometryProvider,
  unavailableTelegramStreetGeometryProvider,
} from './telegram-street-geometry.provider';

interface LocalDictionaryMatch {
  readonly entry: CityLocationConfig;
  readonly matchedAlias: string | null;
}

interface ScoredCandidate {
  readonly candidate: TomTomSearchCandidate;
  readonly confidence: number;
}

@Injectable()
export class TelegramLocationResolver {
  constructor(
    private readonly searchProvider: TomTomSearchProvider,
    @Optional()
    private readonly streetGeometryProvider: TelegramStreetGeometryProvider = unavailableTelegramStreetGeometryProvider,
  ) {}

  async resolve(
    input: TelegramLocationResolutionInput,
  ): Promise<TelegramLocationResolutionResult> {
    const cityId = input.cityId ?? TELEGRAM_LOCATION_RESOLVER_CITY_ID;
    const city = getCityConfig(cityId);
    const rawLocation = input.location?.text.trim() ?? '';
    const normalizedInput = normalizeLocationQuery(rawLocation);
    const emptyDiagnostics = diagnostics([], 0, 0);

    if (city === undefined) {
      return notFound(normalizedInput, 'UNSUPPORTED_CITY', emptyDiagnostics);
    }

    const bounds = city.coverageBounds;

    if (!isSupportedEventType(input.eventType)) {
      return notFound(
        normalizedInput,
        'UNSUPPORTED_EVENT_TYPE',
        emptyDiagnostics,
      );
    }

    if (normalizedInput.length === 0) {
      return notFound('', 'EMPTY_LOCATION', emptyDiagnostics);
    }

    const localMatch = resolveLocalDictionaryMatch(
      city.locations,
      input.location,
      normalizedInput,
    );
    const canonicalTitle = localMatch?.entry.title ?? null;
    const normalizedQuery = normalizeLocationQuery(
      canonicalTitle ?? rawLocation,
    );
    const intersectionSegments = getIntersectionSegments(normalizedInput);
    const searchQueries = buildSearchQueries(
      rawLocation,
      localMatch,
      intersectionSegments,
    );
    const precision = locationPrecisionFor(
      localMatch?.entry.kind,
      intersectionSegments.length > 1,
    );

    if (
      localMatch?.entry.kind === 'STREET' &&
      localMatch.entry.streetGeometry !== undefined
    ) {
      const configured = localMatch.entry.streetGeometry;
      const parts = configuredStreetGeometryParts(configured);
      const coordinates = parts.flat();
      const representative = coordinates[Math.floor(coordinates.length / 2)];
      const contextualRepresentative = resolveContextualStreetCoordinate(
        input.direction,
        city.locations,
        parts,
        bounds,
      );

      if (
        representative === undefined ||
        !parts.some((part) => lineCoordinatesIntersectBounds(part, bounds))
      ) {
        return notFound(
          normalizedQuery,
          'OUTSIDE_SUPPORTED_AREA',
          emptyDiagnostics,
          canonicalTitle,
          null,
          'STREET',
        );
      }

      return {
        status: 'RESOLVED',
        canonicalTitle: localMatch.entry.title,
        normalizedQuery,
        latitude: contextualRepresentative?.[1] ?? representative[1],
        longitude: contextualRepresentative?.[0] ?? representative[0],
        confidence: TELEGRAM_VERIFIED_LOCAL_CONFIDENCE,
        coordinateSource:
          localMatch.entry.provenance?.geometrySource === 'OSM'
            ? 'IMPORTED_LOCAL'
            : 'VERIFIED_LOCAL',
        geometry:
          contextualRepresentative === null
            ? parts.length === 1
              ? { type: 'LineString', coordinates: parts[0] ?? [] }
              : { type: 'MultiLineString', coordinates: parts }
            : { type: 'Point', coordinates: contextualRepresentative },
        precision: 'STREET',
        geometryProvider: null,
        geometryStatus: 'RESOLVED',
        ...emptyDiagnostics,
        source: 'LOCAL',
        localLocationId: localMatch.entry.id,
        matchedAlias: localMatch.matchedAlias,
      };
    }

    if (localMatch?.entry.kind === 'STREET') {
      if (localMatch.entry.streetGeometryStatus === 'AMBIGUOUS') {
        return notFound(
          normalizedQuery,
          'STREET_GEOMETRY_UNAVAILABLE',
          emptyDiagnostics,
          canonicalTitle,
          null,
          'STREET',
          'OSM',
          'AMBIGUOUS',
        );
      }
      const streetGeometry = await this.streetGeometryProvider.resolve({
        cityId,
        canonicalLocation: localMatch.entry.id,
        displayName: localMatch.entry.title,
      });

      if (streetGeometry.status !== 'RESOLVED') {
        return notFound(
          normalizedQuery,
          'STREET_GEOMETRY_UNAVAILABLE',
          emptyDiagnostics,
          canonicalTitle,
          null,
          'STREET',
          'OSM',
          streetGeometry.status,
        );
      }

      const streetCoordinates = coordinatesForStreetGeometry(
        streetGeometry.geometry,
      );

      if (
        streetCoordinates.length < 2 ||
        !lineCoordinatesIntersectBounds(streetCoordinates, bounds)
      ) {
        return notFound(
          normalizedQuery,
          'OUTSIDE_SUPPORTED_AREA',
          emptyDiagnostics,
          canonicalTitle,
          streetGeometry.confidence,
          'STREET',
          'OSM',
          'NOT_FOUND',
        );
      }

      const representative =
        streetCoordinates.find(([longitude, latitude]) =>
          isCoordinateInsideBounds(latitude, longitude, bounds),
        ) ?? streetCoordinates[Math.floor(streetCoordinates.length / 2)];
      const contextualRepresentative = resolveContextualStreetCoordinate(
        input.direction,
        city.locations,
        streetPartsForGeometry(streetGeometry.geometry),
        bounds,
      );

      if (representative === undefined) {
        return notFound(
          normalizedQuery,
          'STREET_GEOMETRY_UNAVAILABLE',
          emptyDiagnostics,
          canonicalTitle,
          null,
          'STREET',
          'OSM',
          'NOT_FOUND',
        );
      }

      return {
        status: 'RESOLVED',
        canonicalTitle: localMatch.entry.title,
        normalizedQuery,
        latitude: contextualRepresentative?.[1] ?? representative[1],
        longitude: contextualRepresentative?.[0] ?? representative[0],
        confidence: streetGeometry.confidence,
        coordinateSource: 'OSM',
        geometry:
          contextualRepresentative === null
            ? streetGeometry.geometry
            : { type: 'Point', coordinates: contextualRepresentative },
        precision: 'STREET',
        geometryProvider: 'OSM',
        geometryStatus: 'RESOLVED',
        ...emptyDiagnostics,
        source: 'LOCAL',
        localLocationId: localMatch.entry.id,
        matchedAlias: localMatch.matchedAlias,
      };
    }

    if (localMatch?.entry.areaGeometry !== undefined) {
      const { representativePoint, radiusMeters } =
        localMatch.entry.areaGeometry;
      const { latitude, longitude } = representativePoint;

      if (
        !Number.isFinite(radiusMeters) ||
        radiusMeters <= 0 ||
        !isCoordinateInsideBounds(latitude, longitude, bounds)
      ) {
        return notFound(
          normalizedQuery,
          'OUTSIDE_SUPPORTED_AREA',
          emptyDiagnostics,
          canonicalTitle,
          null,
          precision,
        );
      }

      return {
        status: 'RESOLVED',
        canonicalTitle: localMatch.entry.title,
        normalizedQuery,
        latitude,
        longitude,
        confidence: TELEGRAM_VERIFIED_LOCAL_CONFIDENCE,
        coordinateSource: 'VERIFIED_LOCAL',
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        precision,
        geometryProvider: null,
        geometryStatus: null,
        ...emptyDiagnostics,
        source: 'LOCAL',
        localLocationId: localMatch.entry.id,
        matchedAlias: localMatch.matchedAlias,
      };
    }

    if (
      localMatch?.entry.kind === 'AREA' ||
      localMatch?.entry.kind === 'DISTRICT'
    ) {
      return notFound(
        normalizedQuery,
        'AREA_GEOMETRY_UNAVAILABLE',
        emptyDiagnostics,
        canonicalTitle,
        null,
        'AREA',
      );
    }

    if (localMatch?.entry.verifiedCoordinates !== undefined) {
      const { latitude, longitude } = localMatch.entry.verifiedCoordinates;

      if (!isCoordinateInsideBounds(latitude, longitude, bounds)) {
        return notFound(
          normalizedQuery,
          'OUTSIDE_SUPPORTED_AREA',
          emptyDiagnostics,
          canonicalTitle,
          null,
          precision,
        );
      }

      return {
        status: 'RESOLVED',
        canonicalTitle: localMatch.entry.title,
        normalizedQuery,
        latitude,
        longitude,
        confidence: TELEGRAM_VERIFIED_LOCAL_CONFIDENCE,
        coordinateSource: 'VERIFIED_LOCAL',
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        precision,
        geometryProvider: null,
        geometryStatus: null,
        ...emptyDiagnostics,
        source: 'LOCAL',
        localLocationId: localMatch.entry.id,
        matchedAlias: localMatch.matchedAlias,
      };
    }

    if (localMatch?.entry.representativePoint !== undefined) {
      const { latitude, longitude } = localMatch.entry.representativePoint;
      if (!isCoordinateInsideBounds(latitude, longitude, bounds)) {
        return notFound(
          normalizedQuery,
          'OUTSIDE_SUPPORTED_AREA',
          emptyDiagnostics,
          canonicalTitle,
          null,
          precision,
        );
      }
      return {
        status: 'RESOLVED',
        canonicalTitle: localMatch.entry.title,
        normalizedQuery,
        latitude,
        longitude,
        confidence: 0.9,
        coordinateSource: 'IMPORTED_LOCAL',
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        precision,
        geometryProvider: null,
        geometryStatus: null,
        ...emptyDiagnostics,
        source: 'LOCAL',
        localLocationId: localMatch.entry.id,
        matchedAlias: localMatch.matchedAlias,
      };
    }

    if (!this.searchProvider.isAvailable()) {
      return notFound(
        normalizedQuery,
        'SEARCH_UNAVAILABLE',
        emptyDiagnostics,
        canonicalTitle,
        null,
        precision,
      );
    }

    const attemptedQueries: string[] = [];
    const queryAttempts: Array<{
      query: string;
      candidateCount: number;
      succeeded: boolean;
    }> = [];
    const rawCandidates: TomTomSearchCandidate[] = [];
    let successfulAttempts = 0;

    for (const query of searchQueries) {
      attemptedQueries.push(query);

      try {
        const candidates = await this.searchProvider.search(query, cityId);

        successfulAttempts += 1;
        queryAttempts.push({
          query,
          candidateCount: candidates.length,
          succeeded: true,
        });
        rawCandidates.push(...candidates);
      } catch {
        queryAttempts.push({ query, candidateCount: 0, succeeded: false });
        // A later deterministic query may still resolve the same location.
      }
    }

    if (successfulAttempts === 0) {
      return notFound(
        normalizedQuery,
        'SEARCH_UNAVAILABLE',
        diagnostics(attemptedQueries, 0, 0, queryAttempts),
        canonicalTitle,
        null,
        precision,
      );
    }

    const deduplicated = deduplicateCandidates(rawCandidates);
    const candidateContext = {
      query: normalizedQuery,
      localKind: localMatch?.entry.kind,
      localCanonicalMatch: localMatch !== undefined,
      intersection: intersectionSegments.length > 1,
      center: city.center,
    };
    const outsideScored = deduplicated
      .filter((candidate) => !isInsideBounds(candidate, bounds))
      .filter((candidate) =>
        matchesIntersection(candidate, intersectionSegments),
      )
      .filter((candidate) => isCandidateTypeCompatible(candidate, localMatch))
      .map((candidate) => ({
        candidate,
        confidence: scoreCandidate({ candidate, ...candidateContext }),
      }))
      .sort(compareScoredCandidates);
    const scored = deduplicated
      .filter((candidate) => isInsideBounds(candidate, bounds))
      .filter((candidate) =>
        matchesIntersection(candidate, intersectionSegments),
      )
      .filter((candidate) => isCandidateTypeCompatible(candidate, localMatch))
      .map((candidate) => ({
        candidate,
        confidence: scoreCandidate({ candidate, ...candidateContext }),
      }))
      .sort(compareScoredCandidates);
    const resultDiagnostics = diagnostics(
      attemptedQueries,
      rawCandidates.length,
      scored.length,
      queryAttempts,
    );
    const outsideBest = outsideScored[0];

    if (scored.length === 0) {
      return notFound(
        normalizedQuery,
        isStrong(outsideBest) ? 'OUTSIDE_SUPPORTED_AREA' : 'NO_CANDIDATES',
        resultDiagnostics,
        canonicalTitle,
        outsideBest?.confidence ?? null,
        precision,
      );
    }

    const [best, second] = scored;

    if (
      best.confidence >=
        TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.ambiguousConfidence &&
      second !== undefined &&
      second.confidence >=
        TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.ambiguousConfidence &&
      best.confidence - second.confidence <
        TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.resolvedScoreGap
    ) {
      return {
        status: 'AMBIGUOUS',
        ...(canonicalTitle === null ? {} : { canonicalTitle }),
        normalizedQuery,
        confidence: best.confidence,
        ...resultDiagnostics,
        candidates: scored
          .filter(
            ({ confidence }) =>
              confidence >=
              TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.ambiguousConfidence,
          )
          .slice(
            0,
            TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.maxAmbiguousCandidates,
          )
          .map(toResolutionCandidate),
        precision,
        geometryProvider: null,
        geometryStatus: null,
      };
    }

    if (
      best.confidence < TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.resolvedConfidence
    ) {
      return notFound(
        normalizedQuery,
        isStrong(outsideBest) ? 'OUTSIDE_SUPPORTED_AREA' : 'LOW_CONFIDENCE',
        resultDiagnostics,
        canonicalTitle,
        best.confidence,
        precision,
      );
    }

    if (localMatch !== undefined) {
      return {
        status: 'RESOLVED',
        canonicalTitle: localMatch.entry.title,
        normalizedQuery,
        latitude: best.candidate.position.latitude,
        longitude: best.candidate.position.longitude,
        confidence: best.confidence,
        coordinateSource: 'TOMTOM',
        geometry: {
          type: 'Point',
          coordinates: [
            best.candidate.position.longitude,
            best.candidate.position.latitude,
          ],
        },
        precision,
        geometryProvider: null,
        geometryStatus: null,
        ...resultDiagnostics,
        source: 'LOCAL',
        localLocationId: localMatch.entry.id,
        matchedAlias: localMatch.matchedAlias,
      };
    }

    return {
      status: 'RESOLVED',
      canonicalTitle: best.candidate.name,
      normalizedQuery,
      latitude: best.candidate.position.latitude,
      longitude: best.candidate.position.longitude,
      confidence: best.confidence,
      coordinateSource: 'TOMTOM',
      geometry: {
        type: 'Point',
        coordinates: [
          best.candidate.position.longitude,
          best.candidate.position.latitude,
        ],
      },
      precision,
      geometryProvider: null,
      geometryStatus: null,
      ...resultDiagnostics,
      source: 'TOMTOM',
      matchedAlias: null,
      tomTomCandidate: {
        externalId: best.candidate.externalId,
        address: best.candidate.address,
        type: best.candidate.type,
        providerScore: best.candidate.score,
      },
    };
  }

  async resolveParserResult(
    parserResult: TelegramLocationParserResultInput,
    cityId = TELEGRAM_LOCATION_RESOLVER_CITY_ID,
  ): Promise<readonly TelegramLocationResolutionResult[]> {
    if (!isSupportedEventType(parserResult.eventType)) {
      return [
        notFound(
          normalizeLocationQuery(parserResult.locationText ?? ''),
          'UNSUPPORTED_EVENT_TYPE',
          diagnostics([], 0, 0),
        ),
      ];
    }

    const locations =
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

    return Promise.all(
      locations.map((location, index) =>
        this.resolve({
          cityId,
          eventType: parserResult.eventType,
          location,
          direction: index === 0 ? parserResult.direction : null,
        }),
      ),
    );
  }
}

export const normalizeLocationQuery = (query: string): string =>
  query.trim().toLowerCase().replace(/ё/gu, 'е').replace(/\s+/gu, ' ');

const isSupportedEventType = (eventType: TelegramParserEventType): boolean =>
  TELEGRAM_LOCATION_RESOLVER_ALLOWED_EVENT_TYPES.includes(eventType);

const resolveLocalDictionaryMatch = (
  locations: readonly CityLocationConfig[],
  location: TelegramParserLocation | null,
  normalizedInput: string,
): LocalDictionaryMatch | undefined => {
  const byId = location?.alias
    ? locations.find((entry) => entry.id === location.alias)
    : undefined;
  const byText = locations.find((entry) =>
    entry.aliases.includes(normalizedInput),
  );
  const entry = byId ?? byText;

  if (entry === undefined) {
    return undefined;
  }

  return {
    entry,
    matchedAlias: entry.aliases.includes(normalizedInput)
      ? normalizedInput
      : null,
  };
};

const getIntersectionSegments = (query: string): readonly string[] =>
  query
    .split(/\s*\/\s*/u)
    .map((segment) => normalizeLocationQuery(segment))
    .filter(Boolean);

const buildSearchQueries = (
  rawLocation: string,
  localMatch: LocalDictionaryMatch | undefined,
  intersectionSegments: readonly string[],
): readonly string[] => {
  let queries: readonly string[];

  if (intersectionSegments.length > 1) {
    const joined = intersectionSegments.join(' ');

    queries = [
      joined,
      intersectionSegments.join(' & '),
      `перекресток ${joined}`,
    ];
  } else if (localMatch !== undefined) {
    queries = TELEGRAM_LOCATION_SEARCH_STRATEGIES[localMatch.entry.id] ?? [
      localMatch.entry.title,
    ];
  } else {
    queries = [rawLocation.trim()];
  }

  return [
    ...new Set(queries.map((query) => query.trim()).filter(Boolean)),
  ].slice(0, TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.maxSearchAttempts);
};

const deduplicateCandidates = (
  candidates: readonly TomTomSearchCandidate[],
): readonly TomTomSearchCandidate[] => {
  const unique: TomTomSearchCandidate[] = [];

  for (const candidate of candidates) {
    const duplicateIndex = unique.findIndex((existing) =>
      isSameCandidate(existing, candidate),
    );

    if (duplicateIndex < 0) {
      unique.push(candidate);
      continue;
    }

    if (candidate.score > unique[duplicateIndex].score) {
      unique[duplicateIndex] = candidate;
    }
  }

  return unique;
};

const isSameCandidate = (
  left: TomTomSearchCandidate,
  right: TomTomSearchCandidate,
): boolean => {
  if (left.externalId.length > 0 && right.externalId.length > 0) {
    return left.externalId === right.externalId;
  }

  return (
    normalizeLocationQuery(left.name) === normalizeLocationQuery(right.name) &&
    distanceMeters(left.position, right.position) <=
      TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.deduplicationDistanceMeters
  );
};

const isInsideBounds = (
  candidate: TomTomSearchCandidate,
  bounds: CityBounds,
): boolean =>
  isCoordinateInsideBounds(
    candidate.position.latitude,
    candidate.position.longitude,
    bounds,
  );

const isCoordinateInsideBounds = (
  latitude: number,
  longitude: number,
  bounds: CityBounds,
): boolean =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  longitude >= bounds.west &&
  longitude <= bounds.east &&
  latitude >= bounds.south &&
  latitude <= bounds.north;

const coordinatesForStreetGeometry = (
  geometry: Extract<
    ExternalRoadEventGeometry,
    { type: 'LineString' | 'MultiLineString' }
  >,
): readonly [number, number][] =>
  geometry.type === 'LineString'
    ? geometry.coordinates
    : geometry.coordinates.flat();

const streetPartsForGeometry = (
  geometry: Extract<
    ExternalRoadEventGeometry,
    { type: 'LineString' | 'MultiLineString' }
  >,
): readonly (readonly [number, number][])[] =>
  geometry.type === 'LineString'
    ? [geometry.coordinates]
    : geometry.coordinates;

interface StreetProjection {
  readonly part: readonly [number, number][];
  readonly distanceAlongMeters: number;
  readonly distanceToTargetMeters: number;
  readonly totalLengthMeters: number;
}

const resolveContextualStreetCoordinate = (
  direction: TelegramLocationDirection | null | undefined,
  locations: readonly CityLocationConfig[],
  parts: readonly (readonly [number, number][])[],
  bounds: CityBounds,
): [number, number] | null => {
  if (direction === null || direction === undefined) {
    return null;
  }

  const target = directionTargetCoordinate(direction, locations);

  if (
    target === null ||
    !isCoordinateInsideBounds(target.latitude, target.longitude, bounds)
  ) {
    return null;
  }

  const projection = nearestStreetProjection(parts, target);

  if (projection === null || projection.totalLengthMeters <= 0) {
    return null;
  }

  const midpoint = projection.totalLengthMeters / 2;
  const targetDistance = projection.distanceAlongMeters;
  const directionSign = targetDistance < midpoint ? -1 : 1;
  const offset = Math.min(120, projection.totalLengthMeters * 0.1);
  let selectedDistance: number;

  switch (direction.relation) {
    case 'NEAR':
    case 'FROM':
      selectedDistance = targetDistance;
      break;
    case 'BEFORE':
      selectedDistance = targetDistance - directionSign * offset;
      break;
    case 'AFTER':
      selectedDistance = targetDistance + directionSign * offset;
      break;
    case 'BETWEEN':
    case 'TOWARDS':
      selectedDistance = midpoint + (targetDistance - midpoint) * 0.7;
      break;
  }

  const coordinate = coordinateAtDistance(
    projection.part,
    Math.min(projection.totalLengthMeters, Math.max(0, selectedDistance)),
  );

  return coordinate !== null &&
    isCoordinateInsideBounds(coordinate[1], coordinate[0], bounds)
    ? coordinate
    : null;
};

const directionTargetCoordinate = (
  direction: TelegramLocationDirection,
  locations: readonly CityLocationConfig[],
): { latitude: number; longitude: number } | null => {
  const normalizedTarget = normalizeLocationQuery(direction.targetText ?? '');
  const entry =
    (direction.targetLocationId === undefined
      ? undefined
      : locations.find(({ id }) => id === direction.targetLocationId)) ??
    locations.find(
      ({ title, aliases }) =>
        normalizeLocationQuery(title) === normalizedTarget ||
        aliases.includes(normalizedTarget),
    );

  if (entry === undefined) {
    return null;
  }

  if (entry.verifiedCoordinates !== undefined) {
    return entry.verifiedCoordinates;
  }

  if (entry.areaGeometry !== undefined) {
    return entry.areaGeometry.representativePoint;
  }

  if (entry.streetGeometry !== undefined) {
    const coordinates = configuredStreetGeometryParts(
      entry.streetGeometry,
    ).flat();
    const representative = coordinates[Math.floor(coordinates.length / 2)];
    return representative === undefined
      ? null
      : coordinateToPosition(representative);
  }

  return null;
};

const nearestStreetProjection = (
  parts: readonly (readonly [number, number][])[],
  target: { latitude: number; longitude: number },
): StreetProjection | null => {
  let nearest: StreetProjection | null = null;

  for (const part of parts) {
    if (part.length < 2) continue;

    const segmentLengths = part
      .slice(1)
      .map((coordinate, index) =>
        distanceMeters(
          coordinateToPosition(part[index]),
          coordinateToPosition(coordinate),
        ),
      );
    const totalLengthMeters = segmentLengths.reduce(
      (total, length) => total + length,
      0,
    );
    let traversedMeters = 0;

    for (let index = 0; index < part.length - 1; index += 1) {
      const start = part[index];
      const end = part[index + 1];
      const segmentLength = segmentLengths[index] ?? 0;

      if (start === undefined || end === undefined || segmentLength <= 0) {
        traversedMeters += segmentLength;
        continue;
      }

      const fraction = projectionFraction(start, end, target);
      const projected: [number, number] = [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ];
      const distanceToTargetMeters = distanceMeters(
        target,
        coordinateToPosition(projected),
      );
      const candidate: StreetProjection = {
        part,
        distanceAlongMeters: traversedMeters + segmentLength * fraction,
        distanceToTargetMeters,
        totalLengthMeters,
      };

      if (
        nearest === null ||
        candidate.distanceToTargetMeters < nearest.distanceToTargetMeters
      ) {
        nearest = candidate;
      }

      traversedMeters += segmentLength;
    }
  }

  return nearest;
};

const projectionFraction = (
  start: [number, number],
  end: [number, number],
  target: { latitude: number; longitude: number },
): number => {
  const latitudeScale = Math.cos((target.latitude * Math.PI) / 180);
  const deltaLongitude = (end[0] - start[0]) * latitudeScale;
  const deltaLatitude = end[1] - start[1];
  const lengthSquared =
    deltaLongitude * deltaLongitude + deltaLatitude * deltaLatitude;

  if (lengthSquared === 0) return 0;

  const targetLongitude = (target.longitude - start[0]) * latitudeScale;
  const targetLatitude = target.latitude - start[1];

  return Math.min(
    1,
    Math.max(
      0,
      (targetLongitude * deltaLongitude + targetLatitude * deltaLatitude) /
        lengthSquared,
    ),
  );
};

const coordinateAtDistance = (
  coordinates: readonly [number, number][],
  distanceAlongMeters: number,
): [number, number] | null => {
  let traversedMeters = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];

    if (start === undefined || end === undefined) continue;

    const segmentLength = distanceMeters(
      coordinateToPosition(start),
      coordinateToPosition(end),
    );

    if (segmentLength <= 0) continue;

    if (traversedMeters + segmentLength >= distanceAlongMeters) {
      const fraction = (distanceAlongMeters - traversedMeters) / segmentLength;
      return [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ];
    }

    traversedMeters += segmentLength;
  }

  return coordinates.at(-1) ?? null;
};

const coordinateToPosition = ([longitude, latitude]: [number, number]): {
  latitude: number;
  longitude: number;
} => ({ latitude, longitude });

const configuredStreetGeometryParts = (
  geometry: StreetLocationGeometry,
): [number, number][][] =>
  [geometry, ...(geometry.disconnectedParts ?? [])].map(
    (part: StreetLocationGeometryPart) =>
      [part.start, ...(part.intermediate ?? []), part.end].map(
        ({ latitude, longitude }) => [longitude, latitude] as [number, number],
      ),
  );

const lineCoordinatesIntersectBounds = (
  coordinates: readonly [number, number][],
  bounds: CityBounds,
): boolean =>
  coordinates.some(([longitude, latitude]) =>
    isCoordinateInsideBounds(latitude, longitude, bounds),
  ) ||
  coordinates.slice(1).some(([longitude, latitude], index) => {
    const start = coordinates[index];

    return (
      start !== undefined &&
      !(
        Math.max(start[0], longitude) < bounds.west ||
        Math.min(start[0], longitude) > bounds.east ||
        Math.max(start[1], latitude) < bounds.south ||
        Math.min(start[1], latitude) > bounds.north
      )
    );
  });

const matchesIntersection = (
  candidate: TomTomSearchCandidate,
  intersectionSegments: readonly string[],
): boolean => {
  if (intersectionSegments.length <= 1) {
    return true;
  }

  const candidateTokens = new Set(
    tokenize(`${candidate.name} ${candidate.address ?? ''}`),
  );

  return intersectionSegments.every((segment) =>
    tokenize(segment).some((token) => candidateTokens.has(token)),
  );
};

const isCandidateTypeCompatible = (
  candidate: TomTomSearchCandidate,
  localMatch: LocalDictionaryMatch | undefined,
): boolean => {
  const kind = localMatch?.entry.kind;

  if (kind === undefined) {
    return true;
  }

  const type = normalizeLocationQuery(candidate.type);
  const name = normalizeLocationQuery(candidate.name);

  if (kind === 'BRIDGE') {
    return /bridge|мост/u.test(`${type} ${name}`);
  }

  if (kind === 'STREET') {
    return /street|улиц|географ/u.test(type);
  }

  if (kind === 'LANDMARK') {
    return /poi|point of interest|landmark/u.test(type);
  }

  if (kind === 'DISTRICT' || kind === 'AREA' || kind === 'SETTLEMENT') {
    return /geography|municipality|poi|district|village|town|settlement/u.test(
      type,
    );
  }

  return true;
};

const scoreCandidate = (input: {
  candidate: TomTomSearchCandidate;
  query: string;
  localKind: BalakovoLocationAlias['kind'];
  localCanonicalMatch: boolean;
  intersection: boolean;
  center: { latitude: number; longitude: number };
}): number => {
  const queryTokens = tokenize(input.query);
  const candidateTokens = tokenize(
    `${input.candidate.name} ${input.candidate.address ?? ''}`,
  );
  const candidateName = normalizeLocationQuery(input.candidate.name);
  const candidateAddress = normalizeLocationQuery(
    input.candidate.address ?? '',
  );
  const overlap = tokenOverlap(queryTokens, candidateTokens);
  const exactMatch =
    candidateName === input.query || candidateAddress.includes(input.query)
      ? 1
      : 0;
  const providerQuality = clamp(input.candidate.score / 5);
  const typeQuality = getTypeQuality(
    input.candidate,
    input.localKind,
    input.intersection,
  );
  const distance =
    input.candidate.distanceMeters ??
    distanceMeters(input.center, input.candidate.position);
  const distanceQuality = 1 - clamp(distance / 30_000);
  const confidence =
    overlap * 0.5 +
    exactMatch * 0.15 +
    providerQuality * 0.2 +
    typeQuality * 0.1 +
    distanceQuality * 0.05 +
    (input.localCanonicalMatch && overlap > 0
      ? TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.localCanonicalBoost
      : 0);

  return roundConfidence(confidence);
};

const tokenize = (value: string): readonly string[] =>
  normalizeLocationQuery(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);

const tokenOverlap = (
  queryTokens: readonly string[],
  candidateTokens: readonly string[],
): number => {
  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const query = new Set(queryTokens);
  const candidate = new Set(candidateTokens);
  const intersectionSize = [...query].filter((token) =>
    candidate.has(token),
  ).length;

  return Math.max(
    intersectionSize / query.size,
    intersectionSize / candidate.size,
  );
};

const getTypeQuality = (
  candidate: TomTomSearchCandidate,
  localKind: BalakovoLocationAlias['kind'],
  intersection: boolean,
): number => {
  const type = normalizeLocationQuery(candidate.type);
  const name = normalizeLocationQuery(candidate.name);

  if (intersection) {
    return /cross|intersection|street|перекрест/u.test(type) ? 1 : 0.4;
  }

  if (localKind === 'BRIDGE') {
    return /bridge|мост/u.test(`${type} ${name}`) ? 1 : 0.4;
  }

  if (localKind === 'STREET') {
    return /street|улиц|географ/u.test(type) ? 1 : 0.5;
  }

  if (localKind === 'LANDMARK') {
    return /poi|point of interest|landmark/u.test(type) ? 1 : 0.5;
  }

  if (localKind === 'DISTRICT' || localKind === 'AREA') {
    return /geography|municipality|poi|district/u.test(type) ? 1 : 0.5;
  }

  return /street|cross|intersection|poi|geography/u.test(type) ? 0.8 : 0.5;
};

const compareScoredCandidates = (
  left: ScoredCandidate,
  right: ScoredCandidate,
): number =>
  right.confidence - left.confidence ||
  right.candidate.score - left.candidate.score;

const isStrong = (candidate: ScoredCandidate | undefined): boolean =>
  candidate !== undefined &&
  candidate.confidence >=
    TELEGRAM_LOCATION_RESOLVER_THRESHOLDS.resolvedConfidence;

const toResolutionCandidate = ({
  candidate,
  confidence,
}: ScoredCandidate): TelegramLocationResolutionCandidate => ({
  title: candidate.name,
  address: candidate.address,
  latitude: candidate.position.latitude,
  longitude: candidate.position.longitude,
  confidence,
  source: 'TOMTOM',
});

const diagnostics = (
  attemptedQueries: readonly string[],
  rawCandidateCount: number,
  acceptedCandidateCount: number,
  queryAttempts: TelegramLocationResolutionDiagnostics['queryAttempts'] = [],
): TelegramLocationResolutionDiagnostics => ({
  attemptedQueries: [...attemptedQueries],
  queryAttempts: [...queryAttempts],
  rawCandidateCount,
  acceptedCandidateCount,
});

const notFound = (
  normalizedQuery: string,
  reason: TelegramLocationNotFoundReason,
  resultDiagnostics: TelegramLocationResolutionDiagnostics,
  canonicalTitle: string | null = null,
  confidence: number | null = null,
  precision: TelegramLocationPrecision | null = null,
  geometryProvider: 'OSM' | null = null,
  geometryStatus:
    'RESOLVED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'UNAVAILABLE' | null = null,
): TelegramLocationResolutionResult => ({
  status: 'NOT_FOUND',
  ...(canonicalTitle === null ? {} : { canonicalTitle }),
  normalizedQuery,
  confidence,
  ...resultDiagnostics,
  reason,
  precision,
  geometryProvider,
  geometryStatus,
});

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

const roundConfidence = (value: number): number =>
  Math.round(clamp(value) * 1_000) / 1_000;

const distanceMeters = (
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number => {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(haversine))),
  );
};
