export interface CityCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export interface StreetLocationGeometryPart {
  readonly start: CityCoordinate;
  readonly end: CityCoordinate;
  readonly intermediate?: readonly CityCoordinate[];
}

export interface StreetLocationGeometry extends StreetLocationGeometryPart {
  readonly disconnectedParts?: readonly StreetLocationGeometryPart[];
}

export interface AreaLocationGeometry {
  readonly representativePoint: CityCoordinate;
  readonly radiusMeters: number;
  readonly northSouthRadiusMeters?: number;
  readonly eastWestRadiusMeters?: number;
}

export interface CityBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

export type CityAreaType = 'CITY' | 'SETTLEMENT' | 'AREA';

export interface CityAreaConfig {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly type: CityAreaType;
}

export type CityLocationKind =
  | 'STREET'
  | 'BRIDGE'
  | 'DISTRICT'
  | 'LANDMARK'
  | 'INTERSECTION'
  | 'AREA'
  | 'SETTLEMENT';

export interface CityLocationConfig {
  readonly id: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly kind?: CityLocationKind;
  readonly verifiedCoordinates?: CityCoordinate;
  readonly streetGeometry?: StreetLocationGeometry;
  readonly streetGeometryStatus?: 'RESOLVED' | 'AMBIGUOUS';
  readonly areaGeometry?: AreaLocationGeometry;
  readonly representativePoint?: CityCoordinate;
  readonly bounds?: CityBounds;
  readonly provenance?: {
    readonly identitySource: 'YANDEX' | 'OSM' | 'MANUAL';
    readonly pointSource?: 'YANDEX' | 'OSM' | 'MANUAL';
    readonly geometrySource?: 'OSM' | 'MANUAL';
    readonly manualOverride: boolean;
    readonly yandexUri?: string;
  };
}

export interface CityCoveragePolygon {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly (readonly [number, number])[])[];
}

export interface CityCoverageMultiPolygon {
  readonly type: 'MultiPolygon';
  readonly coordinates: readonly (readonly (readonly (readonly [
    number,
    number,
  ])[])[])[];
}

export interface CityConfig {
  readonly id: string;
  readonly name: string;
  readonly center: CityCoordinate;
  readonly defaultZoom: number;
  readonly coverageBounds: CityBounds;
  readonly coverageBoundary?: CityCoveragePolygon | CityCoverageMultiPolygon;
  readonly nearbyAreas: readonly CityAreaConfig[];
  readonly locations: readonly CityLocationConfig[];
}
