import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import {
  BALAKOVO_LOCATION_DICTIONARY,
  findBalakovoLocationAlias,
} from '../src/integrations/telegram/parser/balakovo-location.dictionary';
import type { BalakovoLocationDictionaryEntry } from '../src/integrations/telegram/parser/balakovo-location.dictionary';
import {
  normalizeLocationQuery,
  TelegramLocationResolver,
} from '../src/integrations/telegram/location-resolver/telegram-location-resolver';
import type { TelegramLocationResolutionResult } from '../src/integrations/telegram/location-resolver/telegram-location-resolver.types';
import { resolveTomTomCityBounds } from '../src/integrations/tomtom/tomtom-city';
import { TomTomClient } from '../src/integrations/tomtom/tomtom.client';
import { TomTomSearchProvider } from '../src/integrations/tomtom/tomtom-search.provider';
import type {
  AreaLocationGeometry,
  CityCoordinate,
  StreetLocationGeometry,
} from '../src/cities/city.types';
import type {
  CityBounds,
  TomTomSearchCandidate,
} from '../src/integrations/tomtom/tomtom.types';

const CITY_ID = 'balakovo';
const MAX_OUTPUT_CANDIDATES = 5;
const CANDIDATE_DEDUP_DISTANCE_METERS = 25;
export const MANUAL_COORDINATE_WARNING_DISTANCE_METERS = 100;
export const MAX_MANUAL_AREA_RADIUS_METERS = 10_000;

export const LOCATION_VERIFY_USAGE =
  'Usage: npm run telegram:location-verify -- "<alias or canonical title>" [--coords <latitude> <longitude> | --start <latitude> <longitude> --end <latitude> <longitude> [--via <latitude>,<longitude> ...] | --center <latitude> <longitude> --radius <meters>] [--note "<text>"]';

type LocationVerifyArgumentError =
  | 'MISSING_LOCATION'
  | 'UNKNOWN_OPTION'
  | 'MISSING_COORDINATES'
  | 'MISSING_STREET_START'
  | 'MISSING_STREET_END'
  | 'MISSING_AREA_CENTER'
  | 'MISSING_AREA_RADIUS'
  | 'INVALID_VIA'
  | 'INVALID_RADIUS'
  | 'CONFLICTING_GEOMETRY_MODES'
  | 'INVALID_LATITUDE'
  | 'INVALID_LONGITUDE'
  | 'MISSING_NOTE'
  | 'NOTE_REQUIRES_COORDINATES';

export type ParsedLocationVerifyArguments =
  | {
      readonly valid: true;
      readonly input: string;
      readonly coordinates: {
        readonly latitude: number;
        readonly longitude: number;
      } | null;
      readonly streetGeometry: StreetLocationGeometry | null;
      readonly areaGeometry: AreaLocationGeometry | null;
      readonly note: string | null;
    }
  | {
      readonly valid: false;
      readonly error: LocationVerifyArgumentError;
    };

interface CandidateObservation {
  candidate: TomTomSearchCandidate;
  readonly foundByQueries: string[];
}

export interface LocationVerificationCandidate {
  readonly index: number;
  readonly title: string;
  readonly address: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly type: string;
  readonly providerScore: number;
  readonly resolverConfidence: number | null;
  readonly insideSupportedBounds: boolean;
  readonly foundByQueries: readonly string[];
  readonly mapUrl: string;
  readonly dictionarySnippet: string;
}

export interface LocationVerificationReport {
  readonly input: string;
  readonly normalizedInput: string;
  readonly matchedAlias: string | null;
  readonly localLocation: {
    readonly id: string;
    readonly title: string;
    readonly kind: string | null;
    readonly hasVerifiedCoordinates: boolean;
  } | null;
  readonly candidates: readonly LocationVerificationCandidate[];
  readonly resolverResult: TelegramLocationResolutionResult;
}

export interface LocationVerificationDependencies {
  readonly resolver: TelegramLocationResolver;
  readonly searchProvider: TomTomSearchProvider;
}

export interface ManualCoordinateVerificationReport {
  readonly valid: boolean;
  readonly reason: 'UNKNOWN_ALIAS' | 'OUTSIDE_SUPPORTED_AREA' | null;
  readonly input: string;
  readonly normalizedInput: string;
  readonly localLocation: {
    readonly id: string;
    readonly title: string;
    readonly kind: string | null;
  } | null;
  readonly proposedCoordinates: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly insideSupportedBounds: boolean;
  readonly currentVerifiedCoordinates: {
    readonly latitude: number;
    readonly longitude: number;
  } | null;
  readonly distanceFromExistingMeters: number | null;
  readonly warning: string | null;
  readonly note: string | null;
  readonly mapUrl: string;
  readonly dictionarySnippet: string | null;
}

export type ManualGeometryVerificationReason =
  | 'UNKNOWN_ALIAS'
  | 'INVALID_LOCATION_KIND'
  | 'OUTSIDE_SUPPORTED_AREA'
  | 'DUPLICATE_CONSECUTIVE_POINTS'
  | 'STREET_SEGMENT_TOO_LONG'
  | 'INVALID_RADIUS';

export interface ManualStreetGeometryVerificationReport {
  readonly mode: 'STREET';
  readonly valid: boolean;
  readonly reason: ManualGeometryVerificationReason | null;
  readonly input: string;
  readonly normalizedInput: string;
  readonly localLocation: {
    readonly id: string;
    readonly title: string;
    readonly kind: string | null;
  } | null;
  readonly geometry: StreetLocationGeometry;
  readonly pointsInsideSupportedBounds: boolean;
  readonly note: string | null;
  readonly dictionarySnippet: string | null;
}

export interface ManualAreaGeometryVerificationReport {
  readonly mode: 'AREA';
  readonly valid: boolean;
  readonly reason: ManualGeometryVerificationReason | null;
  readonly input: string;
  readonly normalizedInput: string;
  readonly localLocation: {
    readonly id: string;
    readonly title: string;
    readonly kind: string | null;
  } | null;
  readonly geometry: AreaLocationGeometry;
  readonly centerInsideSupportedBounds: boolean;
  readonly note: string | null;
  readonly dictionarySnippet: string | null;
}

export interface LocationVerifyCliOutput {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

export const parseLocationVerifyArguments = (
  args: readonly string[],
): ParsedLocationVerifyArguments => {
  const locationParts: string[] = [];
  let coordinates: { latitude: number; longitude: number } | null = null;
  let streetStart: CityCoordinate | null = null;
  let streetEnd: CityCoordinate | null = null;
  const streetIntermediate: CityCoordinate[] = [];
  let areaCenter: CityCoordinate | null = null;
  let areaRadiusMeters: number | null = null;
  let note: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--coords') {
      const parsed = parseCoordinatePair(args[index + 1], args[index + 2]);

      if (parsed === 'MISSING') {
        return { valid: false, error: 'MISSING_COORDINATES' };
      }
      if (parsed === 'INVALID_LATITUDE') {
        return { valid: false, error: 'INVALID_LATITUDE' };
      }
      if (parsed === 'INVALID_LONGITUDE') {
        return { valid: false, error: 'INVALID_LONGITUDE' };
      }

      coordinates = parsed;
      index += 2;
      continue;
    }

    if (argument === '--start' || argument === '--end') {
      const parsed = parseCoordinatePair(args[index + 1], args[index + 2]);

      if (parsed === 'MISSING') {
        return {
          valid: false,
          error:
            argument === '--start'
              ? 'MISSING_STREET_START'
              : 'MISSING_STREET_END',
        };
      }
      if (parsed === 'INVALID_LATITUDE') {
        return { valid: false, error: 'INVALID_LATITUDE' };
      }
      if (parsed === 'INVALID_LONGITUDE') {
        return { valid: false, error: 'INVALID_LONGITUDE' };
      }

      if (argument === '--start') streetStart = parsed;
      else streetEnd = parsed;
      index += 2;
      continue;
    }

    if (argument === '--via') {
      const value = args[index + 1];

      if (value === undefined) {
        return { valid: false, error: 'INVALID_VIA' };
      }

      const [latitudeText, longitudeText, ...extra] = value.split(',');
      const parsed = parseCoordinatePair(latitudeText, longitudeText);

      if (
        extra.length > 0 ||
        parsed === 'MISSING' ||
        parsed === 'INVALID_LATITUDE' ||
        parsed === 'INVALID_LONGITUDE'
      ) {
        return { valid: false, error: 'INVALID_VIA' };
      }

      streetIntermediate.push(parsed);
      index += 1;
      continue;
    }

    if (argument === '--center') {
      const parsed = parseCoordinatePair(args[index + 1], args[index + 2]);

      if (parsed === 'MISSING') {
        return { valid: false, error: 'MISSING_AREA_CENTER' };
      }
      if (parsed === 'INVALID_LATITUDE') {
        return { valid: false, error: 'INVALID_LATITUDE' };
      }
      if (parsed === 'INVALID_LONGITUDE') {
        return { valid: false, error: 'INVALID_LONGITUDE' };
      }

      areaCenter = parsed;
      index += 2;
      continue;
    }

    if (argument === '--radius') {
      const value = args[index + 1];

      if (value === undefined) {
        return { valid: false, error: 'MISSING_AREA_RADIUS' };
      }

      const radius = Number(value);

      if (!Number.isFinite(radius) || radius <= 0) {
        return { valid: false, error: 'INVALID_RADIUS' };
      }

      areaRadiusMeters = radius;
      index += 1;
      continue;
    }

    if (argument === '--note') {
      const noteText = args[index + 1]?.trim();

      if (!noteText || noteText.startsWith('--')) {
        return { valid: false, error: 'MISSING_NOTE' };
      }

      note = noteText;
      index += 1;
      continue;
    }

    if (argument.startsWith('--')) {
      return { valid: false, error: 'UNKNOWN_OPTION' };
    }

    locationParts.push(argument);
  }

  const input = locationParts.join(' ').trim();

  if (input.length === 0) {
    return { valid: false, error: 'MISSING_LOCATION' };
  }

  const hasPoint = coordinates !== null;
  const hasStreet =
    streetStart !== null || streetEnd !== null || streetIntermediate.length > 0;
  const hasArea = areaCenter !== null || areaRadiusMeters !== null;

  if ([hasPoint, hasStreet, hasArea].filter(Boolean).length > 1) {
    return { valid: false, error: 'CONFLICTING_GEOMETRY_MODES' };
  }

  if (hasStreet && streetStart === null) {
    return { valid: false, error: 'MISSING_STREET_START' };
  }

  if (hasStreet && streetEnd === null) {
    return { valid: false, error: 'MISSING_STREET_END' };
  }

  if (hasArea && areaCenter === null) {
    return { valid: false, error: 'MISSING_AREA_CENTER' };
  }

  if (hasArea && areaRadiusMeters === null) {
    return { valid: false, error: 'MISSING_AREA_RADIUS' };
  }

  if (note !== null && !hasPoint && !hasStreet && !hasArea) {
    return { valid: false, error: 'NOTE_REQUIRES_COORDINATES' };
  }

  return {
    valid: true,
    input,
    coordinates,
    streetGeometry:
      streetStart === null || streetEnd === null
        ? null
        : {
            start: streetStart,
            end: streetEnd,
            ...(streetIntermediate.length === 0
              ? {}
              : { intermediate: streetIntermediate }),
          },
    areaGeometry:
      areaCenter === null || areaRadiusMeters === null
        ? null
        : {
            representativePoint: areaCenter,
            radiusMeters: areaRadiusMeters,
          },
    note,
  };
};

export const parseLocationArgument = (
  args: readonly string[],
): string | null => {
  const parsed = parseLocationVerifyArguments(args);

  return parsed.valid ? parsed.input : null;
};

export const createManualCoordinateVerificationReport = (
  input: string,
  proposedCoordinates: { latitude: number; longitude: number },
  note: string | null = null,
): ManualCoordinateVerificationReport => {
  const normalizedInput = normalizeLocationQuery(input);
  const localLocation = findLocalLocation(normalizedInput);
  const bounds = resolveTomTomCityBounds(CITY_ID);
  const insideSupportedBounds = isInsideBounds(
    proposedCoordinates.latitude,
    proposedCoordinates.longitude,
    bounds,
  );
  const currentVerifiedCoordinates = localLocation?.verifiedCoordinates ?? null;
  const distanceFromExistingMeters =
    currentVerifiedCoordinates === null
      ? null
      : distanceMeters(currentVerifiedCoordinates, proposedCoordinates);
  const warning =
    distanceFromExistingMeters !== null &&
    distanceFromExistingMeters > MANUAL_COORDINATE_WARNING_DISTANCE_METERS
      ? `WARNING: proposed coordinates are ${distanceFromExistingMeters} m from current verified coordinates`
      : null;
  const valid = localLocation !== undefined && insideSupportedBounds;
  const reason =
    localLocation === undefined
      ? 'UNKNOWN_ALIAS'
      : insideSupportedBounds
        ? null
        : 'OUTSIDE_SUPPORTED_AREA';

  return {
    valid,
    reason,
    input,
    normalizedInput,
    localLocation:
      localLocation === undefined
        ? null
        : {
            id: localLocation.id,
            title: localLocation.title,
            kind: localLocation.kind ?? null,
          },
    proposedCoordinates,
    insideSupportedBounds,
    currentVerifiedCoordinates,
    distanceFromExistingMeters,
    warning,
    note,
    mapUrl: createMapUrl(
      proposedCoordinates.latitude,
      proposedCoordinates.longitude,
    ),
    dictionarySnippet: valid
      ? createDictionarySnippet(
          proposedCoordinates.latitude,
          proposedCoordinates.longitude,
        )
      : null,
  };
};

export const createManualStreetGeometryVerificationReport = (
  input: string,
  geometry: StreetLocationGeometry,
  note: string | null = null,
): ManualStreetGeometryVerificationReport => {
  const normalizedInput = normalizeLocationQuery(input);
  const localLocation = findLocalLocation(normalizedInput);
  const bounds = resolveTomTomCityBounds(CITY_ID);
  const points = streetGeometryPoints(geometry);
  const pointsInsideSupportedBounds = points.every((point) =>
    isInsideBounds(point.latitude, point.longitude, bounds),
  );
  const hasDuplicateConsecutivePoints = points
    .slice(1)
    .some((point, index) => distanceMeters(points[index], point) <= 1);
  const maximumSegmentMeters = maximumReasonableStreetSegmentMeters(bounds);
  const hasExcessiveSegment = points
    .slice(1)
    .some(
      (point, index) =>
        distanceMeters(points[index], point) > maximumSegmentMeters,
    );
  const validKind = localLocation?.kind === 'STREET';
  const reason: ManualGeometryVerificationReason | null =
    localLocation === undefined
      ? 'UNKNOWN_ALIAS'
      : !validKind
        ? 'INVALID_LOCATION_KIND'
        : !pointsInsideSupportedBounds
          ? 'OUTSIDE_SUPPORTED_AREA'
          : hasDuplicateConsecutivePoints
            ? 'DUPLICATE_CONSECUTIVE_POINTS'
            : hasExcessiveSegment
              ? 'STREET_SEGMENT_TOO_LONG'
              : null;

  return {
    mode: 'STREET',
    valid: reason === null,
    reason,
    input,
    normalizedInput,
    localLocation: toLocalLocationMetadata(localLocation),
    geometry,
    pointsInsideSupportedBounds,
    note,
    dictionarySnippet:
      reason === null ? createStreetGeometrySnippet(geometry) : null,
  };
};

export const createManualAreaGeometryVerificationReport = (
  input: string,
  geometry: AreaLocationGeometry,
  note: string | null = null,
): ManualAreaGeometryVerificationReport => {
  const normalizedInput = normalizeLocationQuery(input);
  const localLocation = findLocalLocation(normalizedInput);
  const bounds = resolveTomTomCityBounds(CITY_ID);
  const centerInsideSupportedBounds = isInsideBounds(
    geometry.representativePoint.latitude,
    geometry.representativePoint.longitude,
    bounds,
  );
  const validKind =
    localLocation?.kind === 'AREA' ||
    localLocation?.kind === 'DISTRICT' ||
    localLocation?.kind === 'SETTLEMENT';
  const validRadius =
    Number.isFinite(geometry.radiusMeters) &&
    geometry.radiusMeters > 0 &&
    geometry.radiusMeters <= MAX_MANUAL_AREA_RADIUS_METERS;
  const reason: ManualGeometryVerificationReason | null =
    localLocation === undefined
      ? 'UNKNOWN_ALIAS'
      : !validKind
        ? 'INVALID_LOCATION_KIND'
        : !centerInsideSupportedBounds
          ? 'OUTSIDE_SUPPORTED_AREA'
          : !validRadius
            ? 'INVALID_RADIUS'
            : null;

  return {
    mode: 'AREA',
    valid: reason === null,
    reason,
    input,
    normalizedInput,
    localLocation: toLocalLocationMetadata(localLocation),
    geometry,
    centerInsideSupportedBounds,
    note,
    dictionarySnippet:
      reason === null ? createAreaGeometrySnippet(geometry) : null,
  };
};

export const createLocationVerificationReport = async (
  input: string,
  dependencies: LocationVerificationDependencies,
): Promise<LocationVerificationReport> => {
  const normalizedInput = normalizeLocationQuery(input);
  const localMatch = findLocalLocation(normalizedInput);
  const matchedAlias =
    localMatch?.aliases.find((alias) => alias === normalizedInput) ?? null;
  const resolverResult = await dependencies.resolver.resolve({
    eventType: 'ACCIDENT',
    location: {
      text: input,
      alias: localMatch?.id ?? null,
    },
  });
  const observations: CandidateObservation[] = [];

  for (const query of resolverResult.attemptedQueries) {
    try {
      const candidates = await dependencies.searchProvider.search(
        query,
        CITY_ID,
      );

      for (const candidate of candidates) {
        rememberCandidate(observations, candidate, query);
      }
    } catch {
      // The resolver result already contains the controlled search failure.
    }
  }

  const bounds = resolveTomTomCityBounds(CITY_ID);
  const candidates = observations
    .map((observation) =>
      toVerificationCandidate(observation, resolverResult, bounds),
    )
    .sort(
      (left, right) =>
        (right.resolverConfidence ?? -1) - (left.resolverConfidence ?? -1) ||
        right.providerScore - left.providerScore,
    )
    .slice(0, MAX_OUTPUT_CANDIDATES)
    .map((candidate, index) => ({ ...candidate, index: index + 1 }));

  return {
    input,
    normalizedInput,
    matchedAlias,
    localLocation:
      localMatch === undefined
        ? null
        : {
            id: localMatch.id,
            title: localMatch.title,
            kind: localMatch.kind ?? null,
            hasVerifiedCoordinates:
              localMatch.verifiedCoordinates !== undefined,
          },
    candidates,
    resolverResult,
  };
};

export const formatLocationVerificationReport = (
  report: LocationVerificationReport,
): string => {
  const lines = [
    'LOCAL DICTIONARY',
    `Input: ${report.input}`,
    `Normalized: ${report.normalizedInput}`,
    `Matched alias: ${report.matchedAlias ?? '—'}`,
    `Canonical ID: ${report.localLocation?.id ?? '—'}`,
    `Canonical title: ${report.localLocation?.title ?? '—'}`,
    `Kind: ${report.localLocation?.kind ?? '—'}`,
    `Verified coordinates: ${report.localLocation?.hasVerifiedCoordinates ? 'yes' : 'no'}`,
    '',
    `TOMTOM CANDIDATES (${report.candidates.length})`,
  ];

  if (report.candidates.length === 0) {
    lines.push('No candidates.');
  }

  for (const candidate of report.candidates) {
    lines.push(
      `[${candidate.index}] ${candidate.title}`,
      `Address: ${candidate.address ?? '—'}`,
      `Coordinates: ${formatCoordinate(candidate.latitude)}, ${formatCoordinate(candidate.longitude)}`,
      `Type: ${candidate.type}`,
      `TomTom score: ${candidate.providerScore}`,
      `Resolver confidence: ${candidate.resolverConfidence ?? '—'}`,
      `Inside Balakovo bounds: ${candidate.insideSupportedBounds ? 'yes' : 'no'}`,
      `Found by: ${candidate.foundByQueries.join(' | ')}`,
      '',
    );
  }

  const result = report.resolverResult;

  lines.push(
    'FINAL RESOLVER RESULT',
    `Status: ${result.status}`,
    `Reason: ${result.status === 'NOT_FOUND' ? result.reason : '—'}`,
    `Canonical: ${result.canonicalTitle ?? '—'}`,
    `Confidence: ${result.confidence ?? '—'}`,
    `Source: ${result.status === 'RESOLVED' ? result.source : '—'}`,
    `Coordinate source: ${result.status === 'RESOLVED' ? result.coordinateSource : '—'}`,
    `Selected coordinates: ${
      result.status === 'RESOLVED'
        ? `${formatCoordinate(result.latitude)}, ${formatCoordinate(result.longitude)}`
        : '—'
    }`,
    '',
    'VERIFICATION CANDIDATES',
  );

  if (report.candidates.length === 0) {
    lines.push('No candidates available for manual verification.');
  }

  for (const candidate of report.candidates) {
    lines.push(
      `[${candidate.index}] ${formatCoordinate(candidate.latitude)}, ${formatCoordinate(candidate.longitude)} — ${candidate.title}${candidate.address ? ` — ${candidate.address}` : ''}`,
      `Map: ${candidate.mapUrl}`,
      `Snippet: ${candidate.dictionarySnippet}`,
    );
  }

  return `${lines.join('\n')}\n`;
};

export const formatManualCoordinateVerificationReport = (
  report: ManualCoordinateVerificationReport,
): string => {
  const lines = [
    'MANUAL COORDINATE VALIDATION',
    `Input alias: ${report.input}`,
    `Normalized input: ${report.normalizedInput}`,
    `Canonical ID: ${report.localLocation?.id ?? '—'}`,
    `Canonical title: ${report.localLocation?.title ?? '—'}`,
    `Kind: ${report.localLocation?.kind ?? '—'}`,
    `Proposed latitude: ${formatCoordinate(report.proposedCoordinates.latitude)}`,
    `Proposed longitude: ${formatCoordinate(report.proposedCoordinates.longitude)}`,
    `Inside supported bounds: ${report.insideSupportedBounds ? 'yes' : 'no'}`,
    `OSM: ${report.mapUrl}`,
  ];

  if (report.note !== null) {
    lines.push(`Note: ${report.note}`);
  }

  if (report.currentVerifiedCoordinates !== null) {
    lines.push(
      `Current verified coordinates: ${formatCoordinate(report.currentVerifiedCoordinates.latitude)}, ${formatCoordinate(report.currentVerifiedCoordinates.longitude)}`,
      `Distance from existing: ${report.distanceFromExistingMeters} m`,
    );
  }

  if (report.warning !== null) {
    lines.push(report.warning);
  }

  lines.push(
    'TomTom lookup skipped: manual coordinates supplied',
    `Status: ${report.valid ? 'VALID' : 'INVALID'}`,
    `Reason: ${report.reason ?? '—'}`,
  );

  if (report.dictionarySnippet !== null) {
    lines.push('', 'VERIFIED COORDINATE SNIPPET', report.dictionarySnippet);
  } else {
    lines.push('', 'Validated snippet was not generated.');
  }

  return `${lines.join('\n')}\n`;
};

export const formatManualStreetGeometryVerificationReport = (
  report: ManualStreetGeometryVerificationReport,
): string => {
  const points = streetGeometryPoints(report.geometry);
  const lines = [
    'MANUAL STREET GEOMETRY VALIDATION',
    `Input alias: ${report.input}`,
    `Canonical ID: ${report.localLocation?.id ?? '—'}`,
    `Canonical title: ${report.localLocation?.title ?? '—'}`,
    `Kind: ${report.localLocation?.kind ?? '—'}`,
    `Points: ${points.length}`,
    `All points inside supported bounds: ${report.pointsInsideSupportedBounds ? 'yes' : 'no'}`,
  ];

  points.forEach((point, index) => {
    const label =
      index === 0
        ? 'Start'
        : index === points.length - 1
          ? 'End'
          : `Via ${index}`;
    lines.push(
      `${label}: ${formatCoordinate(point.latitude)}, ${formatCoordinate(point.longitude)}`,
      `${label} OSM: ${createMapUrl(point.latitude, point.longitude)}`,
    );
  });

  if (report.note !== null) lines.push(`Note: ${report.note}`);

  lines.push(
    'TomTom lookup skipped: manual street geometry supplied',
    `Status: ${report.valid ? 'VALID' : 'INVALID'}`,
    `Reason: ${report.reason ?? '—'}`,
  );

  if (report.dictionarySnippet !== null) {
    lines.push('', 'STREET GEOMETRY SNIPPET', report.dictionarySnippet);
  } else {
    lines.push('', 'Validated snippet was not generated.');
  }

  return `${lines.join('\n')}\n`;
};

export const formatManualAreaGeometryVerificationReport = (
  report: ManualAreaGeometryVerificationReport,
): string => {
  const { representativePoint, radiusMeters } = report.geometry;
  const lines = [
    'MANUAL AREA GEOMETRY VALIDATION',
    `Input alias: ${report.input}`,
    `Canonical ID: ${report.localLocation?.id ?? '—'}`,
    `Canonical title: ${report.localLocation?.title ?? '—'}`,
    `Kind: ${report.localLocation?.kind ?? '—'}`,
    `Center latitude: ${formatCoordinate(representativePoint.latitude)}`,
    `Center longitude: ${formatCoordinate(representativePoint.longitude)}`,
    `Radius: ${radiusMeters} m`,
    `Center inside supported bounds: ${report.centerInsideSupportedBounds ? 'yes' : 'no'}`,
    `OSM: ${createMapUrl(representativePoint.latitude, representativePoint.longitude)}`,
  ];

  if (report.note !== null) lines.push(`Note: ${report.note}`);

  lines.push(
    'TomTom lookup skipped: manual area geometry supplied',
    `Status: ${report.valid ? 'VALID' : 'INVALID'}`,
    `Reason: ${report.reason ?? '—'}`,
  );

  if (report.dictionarySnippet !== null) {
    lines.push('', 'AREA GEOMETRY SNIPPET', report.dictionarySnippet);
  } else {
    lines.push('', 'Validated snippet was not generated.');
  }

  return `${lines.join('\n')}\n`;
};

export const runLocationVerifyCli = async (
  args: readonly string[],
  dependencies: LocationVerificationDependencies,
  output: LocationVerifyCliOutput,
): Promise<number> => {
  const parsed = parseLocationVerifyArguments(args);

  if (!parsed.valid) {
    output.stderr(`Error: ${parsed.error}\n${LOCATION_VERIFY_USAGE}\n`);
    return 1;
  }

  if (parsed.coordinates !== null) {
    const report = createManualCoordinateVerificationReport(
      parsed.input,
      parsed.coordinates,
      parsed.note,
    );
    output.stdout(formatManualCoordinateVerificationReport(report));

    return report.valid ? 0 : 1;
  }

  if (parsed.streetGeometry !== null) {
    const report = createManualStreetGeometryVerificationReport(
      parsed.input,
      parsed.streetGeometry,
      parsed.note,
    );
    output.stdout(formatManualStreetGeometryVerificationReport(report));

    return report.valid ? 0 : 1;
  }

  if (parsed.areaGeometry !== null) {
    const report = createManualAreaGeometryVerificationReport(
      parsed.input,
      parsed.areaGeometry,
      parsed.note,
    );
    output.stdout(formatManualAreaGeometryVerificationReport(report));

    return report.valid ? 0 : 1;
  }

  const report = await createLocationVerificationReport(
    parsed.input,
    dependencies,
  );
  output.stdout(formatLocationVerificationReport(report));

  return 0;
};

const findLocalLocation = (
  normalizedInput: string,
): BalakovoLocationDictionaryEntry | undefined =>
  findBalakovoLocationAlias(normalizedInput) ??
  BALAKOVO_LOCATION_DICTIONARY.find(
    ({ title }) => normalizeLocationQuery(title) === normalizedInput,
  );

const parseCoordinatePair = (
  latitudeText: string | undefined,
  longitudeText: string | undefined,
): CityCoordinate | 'MISSING' | 'INVALID_LATITUDE' | 'INVALID_LONGITUDE' => {
  if (latitudeText === undefined || longitudeText === undefined) {
    return 'MISSING';
  }

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);

  if (
    latitudeText.trim().length === 0 ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return 'INVALID_LATITUDE';
  }

  if (
    longitudeText.trim().length === 0 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return 'INVALID_LONGITUDE';
  }

  return { latitude, longitude };
};

const toLocalLocationMetadata = (
  location: BalakovoLocationDictionaryEntry | undefined,
): {
  readonly id: string;
  readonly title: string;
  readonly kind: string | null;
} | null =>
  location === undefined
    ? null
    : {
        id: location.id,
        title: location.title,
        kind: location.kind ?? null,
      };

const streetGeometryPoints = (
  geometry: StreetLocationGeometry,
): readonly CityCoordinate[] => [
  geometry.start,
  ...(geometry.intermediate ?? []),
  geometry.end,
];

const maximumReasonableStreetSegmentMeters = (bounds: CityBounds): number =>
  Math.min(
    20_000,
    Math.max(
      5_000,
      distanceMeters(
        { latitude: bounds.south, longitude: bounds.west },
        { latitude: bounds.north, longitude: bounds.east },
      ) * 0.75,
    ),
  );

const createStreetGeometrySnippet = (
  geometry: StreetLocationGeometry,
): string => {
  const lines = [
    'streetGeometry: {',
    `  start: ${formatCoordinateObject(geometry.start)},`,
  ];

  if ((geometry.intermediate?.length ?? 0) > 0) {
    lines.push(
      '  intermediate: [',
      ...(geometry.intermediate ?? []).map(
        (coordinate) => `    ${formatCoordinateObject(coordinate)},`,
      ),
      '  ],',
    );
  }

  lines.push(`  end: ${formatCoordinateObject(geometry.end)},`, '}');
  return lines.join('\n');
};

const createAreaGeometrySnippet = (geometry: AreaLocationGeometry): string =>
  [
    'areaGeometry: {',
    `  representativePoint: ${formatCoordinateObject(geometry.representativePoint)},`,
    `  radiusMeters: ${geometry.radiusMeters},`,
    '}',
  ].join('\n');

const formatCoordinateObject = ({
  latitude,
  longitude,
}: CityCoordinate): string =>
  `{ latitude: ${latitude}, longitude: ${longitude} }`;

const rememberCandidate = (
  observations: CandidateObservation[],
  candidate: TomTomSearchCandidate,
  query: string,
): void => {
  const existing = observations.find((observation) =>
    isSameCandidate(observation.candidate, candidate),
  );

  if (existing === undefined) {
    observations.push({ candidate, foundByQueries: [query] });
    return;
  }

  if (!existing.foundByQueries.includes(query)) {
    existing.foundByQueries.push(query);
  }

  if (candidate.score > existing.candidate.score) {
    existing.candidate = candidate;
  }
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
      CANDIDATE_DEDUP_DISTANCE_METERS
  );
};

const toVerificationCandidate = (
  observation: CandidateObservation,
  resolverResult: TelegramLocationResolutionResult,
  bounds: CityBounds,
): Omit<LocationVerificationCandidate, 'index'> => {
  const { candidate, foundByQueries } = observation;
  const latitude = candidate.position.latitude;
  const longitude = candidate.position.longitude;

  return {
    title: candidate.name,
    address: candidate.address,
    latitude,
    longitude,
    type: candidate.type,
    providerScore: candidate.score,
    resolverConfidence: findResolverConfidence(candidate, resolverResult),
    insideSupportedBounds: isInsideBounds(latitude, longitude, bounds),
    foundByQueries: [...foundByQueries],
    mapUrl: createMapUrl(latitude, longitude),
    dictionarySnippet: createDictionarySnippet(latitude, longitude),
  };
};

const createMapUrl = (latitude: number, longitude: number): string =>
  `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;

const createDictionarySnippet = (latitude: number, longitude: number): string =>
  `verifiedCoordinates: { latitude: ${latitude}, longitude: ${longitude} }`;

const findResolverConfidence = (
  candidate: TomTomSearchCandidate,
  result: TelegramLocationResolutionResult,
): number | null => {
  if (
    result.status === 'RESOLVED' &&
    distanceMeters(candidate.position, {
      latitude: result.latitude,
      longitude: result.longitude,
    }) <= CANDIDATE_DEDUP_DISTANCE_METERS
  ) {
    return result.confidence;
  }

  if (result.status === 'AMBIGUOUS') {
    return (
      result.candidates.find(
        (resolvedCandidate) =>
          normalizeLocationQuery(resolvedCandidate.title) ===
            normalizeLocationQuery(candidate.name) &&
          distanceMeters(candidate.position, {
            latitude: resolvedCandidate.latitude,
            longitude: resolvedCandidate.longitude,
          }) <= CANDIDATE_DEDUP_DISTANCE_METERS,
      )?.confidence ?? null
    );
  }

  return null;
};

const isInsideBounds = (
  latitude: number,
  longitude: number,
  bounds: CityBounds,
): boolean =>
  longitude >= bounds.west &&
  longitude <= bounds.east &&
  latitude >= bounds.south &&
  latitude <= bounds.north;

const formatCoordinate = (value: number): string => value.toFixed(6);

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

const main = async (): Promise<void> => {
  const configService = new ConfigService(process.env);
  const client = new TomTomClient(configService);
  const provider = new TomTomSearchProvider(client);
  const resolver = new TelegramLocationResolver(provider);
  const exitCode = await runLocationVerifyCli(
    process.argv.slice(2),
    { resolver, searchProvider: provider },
    {
      stdout: (value) => process.stdout.write(value),
      stderr: (value) => process.stderr.write(value),
    },
  );

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
};

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('Telegram location verification failed.\n');
    process.exitCode = 1;
  });
}
