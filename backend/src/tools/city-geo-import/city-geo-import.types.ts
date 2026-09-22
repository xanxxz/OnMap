import type { CityBounds, CityCoordinate } from '../../cities/city.types';

export type CityGeoObjectType =
  | 'STREET'
  | 'DISTRICT'
  | 'AREA'
  | 'SETTLEMENT'
  | 'BRIDGE'
  | 'LANDMARK'
  | 'INTERSECTION';

export type CityGeoGeometry =
  | { readonly type: 'LineString'; readonly coordinates: [number, number][] }
  | {
      readonly type: 'MultiLineString';
      readonly coordinates: [number, number][][];
    }
  | { readonly type: 'Polygon'; readonly coordinates: [number, number][][] }
  | {
      readonly type: 'MultiPolygon';
      readonly coordinates: [number, number][][][];
    };

export type CityGeoGeometryPrecision =
  'EXACT_GEOMETRY' | 'BOUNDS_ONLY' | 'POINT_ONLY' | 'MANUAL';

export type CityGeoSource = 'YANDEX' | 'OSM' | 'MANUAL';

export type CityGeoMergeStatus =
  | 'READY_YANDEX_OSM'
  | 'READY_OSM_ONLY'
  | 'READY_MANUAL'
  | 'READY_MANUAL_WITH_YANDEX_METADATA'
  | 'GEOMETRY_MISSING'
  | 'IDENTITY_AMBIGUOUS'
  | 'INVALID_GEOMETRY'
  | 'NEEDS_USER_CONFIRMATION';

export interface CityGeoObject {
  readonly id: string;
  readonly cityId: string;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly type: CityGeoObjectType;
  readonly representativePoint?: CityCoordinate;
  readonly bounds?: CityBounds;
  readonly geometry?: CityGeoGeometry;
  readonly geometryPrecision: CityGeoGeometryPrecision;
  readonly geoSource: CityGeoSource;
  readonly externalSources?: {
    readonly yandex?: {
      readonly uri?: string;
      readonly externalId?: string;
      readonly title?: string;
      readonly address?: string;
      readonly kind?: string;
      readonly point?: CityCoordinate;
      readonly bounds?: CityBounds;
    };
  };
  readonly mergeStatus?: CityGeoMergeStatus;
  readonly geometryMatch?: {
    readonly strategy:
      'PRIMARY_NAME' | 'ALTERNATE_NAME' | 'SPATIAL_INFERENCE' | 'MANUAL';
    readonly matchedName?: string;
    readonly score?: number;
    readonly reasons?: readonly string[];
  };
  readonly geometryCandidates?: readonly string[];
  readonly candidateScores?: readonly StreetCandidateScore[];
  readonly areaApproximation?: {
    readonly representativePointSource?: 'YANDEX' | 'MANUAL';
    readonly boundsSource?: 'YANDEX';
    readonly radiusSource?: 'USER_CONFIRMED';
    readonly radiusMeters?: number;
    readonly suggestedRadiusMeters?: number;
  };
  readonly importedAt?: string;
  readonly userVerified?: boolean;
  readonly validationStatus:
    | 'READY'
    | 'BOUNDS_ONLY'
    | 'POINT_ONLY'
    | 'GEOMETRY_MISSING'
    | 'GEOMETRY_AMBIGUOUS';
}

export interface YandexSuggestCandidate {
  readonly title: string;
  readonly subtitle: string | null;
  readonly tags: readonly string[];
  readonly uri: string | null;
  readonly formattedAddress: string | null;
  readonly components: readonly {
    readonly name: string;
    readonly kinds: readonly string[];
  }[];
}

export interface YandexGeoObject {
  readonly canonicalName: string;
  readonly formattedAddress: string | null;
  readonly kind: string | null;
  readonly precision: string | null;
  readonly uri: string | null;
  readonly point: CityCoordinate | null;
  readonly bounds: CityBounds | null;
  readonly actualGeometry: CityGeoGeometry | null;
  readonly components: readonly {
    readonly name: string;
    readonly kind: string | null;
  }[];
}

export interface OsmStreetInventoryItem {
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly geometry: Extract<
    CityGeoGeometry,
    { type: 'LineString' | 'MultiLineString' }
  >;
}

export interface OsmStreetWayCandidate {
  readonly osmId: string;
  readonly names: readonly string[];
  readonly highway: string | null;
  readonly bridge: boolean;
  readonly geometry: Extract<CityGeoGeometry, { type: 'LineString' }>;
  readonly bounds: CityBounds;
}

export interface OsmAddressEvidence {
  readonly osmId: string;
  readonly streetName: string;
  readonly coordinate: CityCoordinate;
}

export interface OsmStreetEvidenceInventory {
  readonly ways: readonly OsmStreetWayCandidate[];
  readonly addresses: readonly OsmAddressEvidence[];
}

export interface StreetCandidateScore {
  readonly candidateId: string;
  readonly candidateLabel: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly highway: string | null;
  readonly bridge: boolean;
  readonly distanceToYandexPointMeters: number | null;
  readonly boundsOverlapRatio: number;
  readonly addressEvidenceCount: number;
  readonly lengthMeters: number;
}

export interface OsmAreaInventoryItem {
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly bounds: CityBounds;
  readonly geometry: Extract<
    CityGeoGeometry,
    { type: 'Polygon' | 'MultiPolygon' }
  >;
}

export interface CityGeoImportConflict {
  readonly severity: 'BLOCKING' | 'WARNING' | 'INFO';
  readonly type:
    | 'NAME_CONFLICT'
    | 'COORDINATE_CONFLICT'
    | 'GEOMETRY_CONFLICT'
    | 'DUPLICATE'
    | 'MISSING_FROM_YANDEX'
    | 'UNKNOWN_LOCAL_NAME'
    | 'YANDEX_FALSE_MATCH'
    | 'MANUAL_POINT_PREFERRED'
    | 'INVALID_GEOMETRY';
  readonly objectId?: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CityGeoCoordinateDiagnostic {
  readonly objectId: string;
  readonly canonical: string;
  readonly manualCoordinate: CityCoordinate;
  readonly yandexCandidateTitle: string | null;
  readonly yandexAddress: string | null;
  readonly yandexKind: string | null;
  readonly yandexCoordinate: CityCoordinate;
  readonly distanceMeters: number;
  readonly samePhysicalObject: 'YES' | 'NO' | 'UNCERTAIN';
  readonly reason: string;
  readonly recommendedAction:
    | 'MANUAL_POINT_PREFERRED'
    | 'KEEP_MANUAL_IGNORE_FALSE_MATCH'
    | 'KEEP_MANUAL_REVIEW_LATER';
}

export interface CityGeoImportReport {
  readonly version: 2;
  readonly cityId: string;
  readonly generatedAt: string;
  readonly dryRun: boolean;
  readonly applyStatus: {
    readonly applyReady: boolean;
    readonly blocking: number;
    readonly warnings: number;
    readonly info: number;
  };
  readonly capability: {
    readonly suggestOk: boolean;
    readonly suggestUri: boolean;
    readonly suggestTypes: readonly string[];
    readonly geocoderOk: boolean;
    readonly uriResolving: boolean;
    readonly point: boolean;
    readonly kind: boolean;
    readonly boundedBy: boolean;
    readonly actualLineString: boolean;
    readonly actualPolygon: boolean;
  };
  readonly streets: {
    readonly discovered: number;
    readonly unique: number;
    readonly matchedExistingRoadRadar: number;
    readonly matchedTelegramCorpus: number;
    readonly actualYandexGeometry: number;
    readonly osmGeometry: number;
    readonly manualGeometry: number;
    readonly exactGeometry: number;
    readonly geometryMissing: number;
    readonly readyBeforeRecovery: number;
    readonly recoveredNow: number;
    readonly autoResolvedThisPass: number;
    readonly coveragePercent: number;
    readonly ambiguous: number;
    readonly invalid: number;
    readonly unresolved: readonly {
      readonly canonicalName: string;
      readonly yandexPoint?: CityCoordinate;
      readonly yandexBounds?: CityBounds;
      readonly osmCandidates: readonly string[];
      readonly topCandidates: readonly StreetCandidateScore[];
      readonly reason: string;
    }[];
  };
  readonly areas: {
    readonly discovered: number;
    readonly unique: number;
    readonly actualYandexPolygon: number;
    readonly osmPolygon: number;
    readonly boundsOnly: number;
    readonly geometryMissing: number;
    readonly approximateGeometryReady: number;
    readonly radiusConfirmationNeeded: number;
    readonly diagnostics: readonly {
      readonly canonical: string;
      readonly aliases: readonly string[];
      readonly yandexKind: string | null;
      readonly yandexPoint: CityCoordinate | null;
      readonly yandexBounds: CityBounds | null;
      readonly osmCandidates: readonly string[];
      readonly suggestedRadiusMeters: number | null;
    }[];
  };
  readonly settlements: {
    readonly discovered: number;
    readonly ready: number;
    readonly missing: number;
  };
  readonly comparison: {
    readonly yandexOnly: readonly string[];
    readonly roadRadarOnly: readonly string[];
    readonly telegramOnly: readonly string[];
    readonly matched: readonly string[];
  };
  readonly telegramCoverage: {
    readonly uniqueStreetLocations: number;
    readonly geometryCovered: number;
    readonly missingGeometry: number;
    readonly occurrenceTotal: number;
    readonly occurrenceCovered: number;
    readonly occurrenceCoveragePercent: number;
  };
  readonly readiness: {
    readonly coreDatasetReady: boolean;
    readonly fullGeometryCoverage: boolean;
  };
  readonly conflicts: readonly CityGeoImportConflict[];
  readonly coordinateDiagnostics: readonly CityGeoCoordinateDiagnostic[];
  readonly externalEnrichment: {
    readonly yandexMatched: number;
    readonly yandexUnmatched: number;
    readonly yandexFalseMatches: number;
    readonly coordinateDiagnostics: number;
  };
  readonly objects: readonly CityGeoObject[];
}

export interface CityGeoImportOptions {
  readonly cityId: string;
  readonly refresh: boolean;
  readonly apply: boolean;
  readonly runtimeDataRoot: string;
  readonly appliedDataRoot: string;
  readonly historicalLogDirectories: readonly string[];
}
