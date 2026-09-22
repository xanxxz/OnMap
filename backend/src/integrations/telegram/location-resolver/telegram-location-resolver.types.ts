import type {
  TelegramLocationDirection,
  TelegramParserEventType,
  TelegramParserLocation,
  TelegramParserResult,
} from '../parser/telegram-parser.types';
import type { ExternalRoadEventGeometry } from '../../tomtom/tomtom.types';

import type { TelegramLocationPrecision } from './telegram-location-precision';

export type TelegramLocationResolutionSource = 'LOCAL' | 'TOMTOM';

export type TelegramLocationCoordinateSource =
  'VERIFIED_LOCAL' | 'IMPORTED_LOCAL' | 'TOMTOM' | 'OSM';

export type TelegramGeometryProvider = 'OSM' | null;

export type TelegramGeometryStatus =
  'RESOLVED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'UNAVAILABLE' | null;

export type TelegramLocationNotFoundReason =
  | 'EMPTY_LOCATION'
  | 'NO_CANDIDATES'
  | 'LOW_CONFIDENCE'
  | 'OUTSIDE_SUPPORTED_AREA'
  | 'UNSUPPORTED_EVENT_TYPE'
  | 'SEARCH_UNAVAILABLE'
  | 'UNSUPPORTED_CITY'
  | 'STREET_GEOMETRY_UNAVAILABLE'
  | 'AREA_GEOMETRY_UNAVAILABLE';

export interface TelegramLocationResolutionDiagnostics {
  readonly attemptedQueries: readonly string[];
  readonly queryAttempts: readonly {
    readonly query: string;
    readonly candidateCount: number;
    readonly succeeded: boolean;
  }[];
  readonly rawCandidateCount: number;
  readonly acceptedCandidateCount: number;
}

export interface TelegramLocationResolutionInput {
  readonly cityId?: string;
  readonly eventType: TelegramParserEventType;
  readonly location: TelegramParserLocation | null;
  readonly direction?: TelegramLocationDirection | null;
}

export interface TelegramLocationResolutionCandidate {
  readonly title: string;
  readonly address: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly confidence: number;
  readonly source: 'TOMTOM';
}

interface TelegramResolvedLocationBase extends TelegramLocationResolutionDiagnostics {
  readonly status: 'RESOLVED';
  readonly canonicalTitle: string;
  readonly normalizedQuery: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly confidence: number;
  readonly coordinateSource: TelegramLocationCoordinateSource;
  readonly geometry: ExternalRoadEventGeometry;
  readonly precision: TelegramLocationPrecision;
  readonly geometryProvider: TelegramGeometryProvider;
  readonly geometryStatus: TelegramGeometryStatus;
}

export interface TelegramLocallyResolvedLocation extends TelegramResolvedLocationBase {
  readonly source: 'LOCAL';
  readonly localLocationId: string;
  readonly matchedAlias: string | null;
}

export interface TelegramTomTomResolvedLocation extends TelegramResolvedLocationBase {
  readonly source: 'TOMTOM';
  readonly matchedAlias: null;
  readonly tomTomCandidate: {
    readonly externalId: string;
    readonly address: string | null;
    readonly type: string;
    readonly providerScore: number;
  };
}

export type TelegramResolvedLocation =
  TelegramLocallyResolvedLocation | TelegramTomTomResolvedLocation;

export interface TelegramAmbiguousLocation extends TelegramLocationResolutionDiagnostics {
  readonly status: 'AMBIGUOUS';
  readonly canonicalTitle?: string;
  readonly normalizedQuery: string;
  readonly confidence: number;
  readonly candidates: readonly TelegramLocationResolutionCandidate[];
  readonly precision: TelegramLocationPrecision;
  readonly geometryProvider: TelegramGeometryProvider;
  readonly geometryStatus: TelegramGeometryStatus;
}

export interface TelegramLocationNotFound extends TelegramLocationResolutionDiagnostics {
  readonly status: 'NOT_FOUND';
  readonly canonicalTitle?: string;
  readonly normalizedQuery: string;
  readonly confidence: number | null;
  readonly reason: TelegramLocationNotFoundReason;
  readonly precision: TelegramLocationPrecision | null;
  readonly geometryProvider: TelegramGeometryProvider;
  readonly geometryStatus: TelegramGeometryStatus;
}

export type TelegramLocationResolutionResult =
  | TelegramResolvedLocation
  | TelegramAmbiguousLocation
  | TelegramLocationNotFound;

export type TelegramLocationParserResultInput = Pick<
  TelegramParserResult,
  'eventType' | 'locationText' | 'locationAlias' | 'locations' | 'direction'
>;
