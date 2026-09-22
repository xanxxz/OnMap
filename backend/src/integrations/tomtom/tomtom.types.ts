export type ExternalRoadEventType =
  | 'TRAFFIC_JAM'
  | 'ACCIDENT'
  | 'ROADWORKS'
  | 'ROAD_CLOSURE'
  | 'HAZARD'
  | 'OTHER';

export interface ExternalPointGeometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface ExternalLineStringGeometry {
  type: 'LineString';
  coordinates: Array<[number, number]>;
}

export interface ExternalMultiLineStringGeometry {
  type: 'MultiLineString';
  coordinates: Array<Array<[number, number]>>;
}

export type ExternalRoadEventGeometry =
  | ExternalPointGeometry
  | ExternalLineStringGeometry
  | ExternalMultiLineStringGeometry;

export interface ExternalRoadEvent {
  externalId: string;
  source: 'TOMTOM';
  type: ExternalRoadEventType;
  geometry: ExternalRoadEventGeometry;
  title: string;
  description: string | null;
  from: string | null;
  to: string | null;
  startTime: string | null;
  endTime: string | null;
  timeValidity: string | null;
  probabilityOfOccurrence: string | null;
  numberOfReports: number | null;
  delaySeconds: number | null;
  lengthMeters: number | null;
  updatedAt: string | null;
  fetchedAt: string;
  rawCategory: number | null;
}

export interface TomTomSearchCandidate {
  externalId: string;
  source: 'TOMTOM';
  name: string;
  address: string | null;
  position: {
    latitude: number;
    longitude: number;
  };
  type: string;
  score: number;
  distanceMeters: number | null;
}

export interface TomTomIncidentEventPayload {
  description?: unknown;
  code?: unknown;
  iconCategory?: unknown;
}

export interface CityBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}
