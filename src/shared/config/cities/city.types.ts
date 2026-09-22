export interface CityBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type CityAreaType =
  | 'CITY'
  | 'SETTLEMENT'
  | 'AREA';

export interface CityAreaConfig {
  id: string;
  name: string;
  aliases: string[];
  type: CityAreaType;
}

export interface CityCoveragePolygon {
  type: 'Polygon';
  coordinates: Array<
    Array<[number, number]>
  >;
}

export interface CityCoverageMultiPolygon {
  type: 'MultiPolygon';
  coordinates: Array<
    Array<Array<[number, number]>>
  >;
}

export interface CityConfig {
  id: string;
  name: string;
  center: [number, number];
  coverageBounds: CityBounds;
  /** Static visual contour only. Never used for coverage validation. */
  displayBoundary?: CityCoveragePolygon | CityCoverageMultiPolygon;
  coverageBoundary?:
    | CityCoveragePolygon
    | CityCoverageMultiPolygon;
  nearbyAreas: CityAreaConfig[];
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
}

export const cityBoundsToMapBounds = (
  bounds: CityBounds,
): [number, number, number, number] => [
  bounds.west,
  bounds.south,
  bounds.east,
  bounds.north,
];
