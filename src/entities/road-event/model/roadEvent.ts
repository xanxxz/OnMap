export type RoadEventType =
  | 'ACCIDENT'
  | 'ROAD_CLOSURE'
  | 'ROADWORKS'
  | 'TRAFFIC'
  | 'ROAD_HAZARD'
  | 'TRAFFIC_LIGHT'
  | 'ROAD_SERVICE'
  | 'ROAD_PATROL'
  | 'OTHER';

export type TomTomRoadEventType =
  | 'TRAFFIC_JAM'
  | 'ACCIDENT'
  | 'ROADWORKS'
  | 'ROAD_CLOSURE'
  | 'HAZARD'
  | 'OTHER';

export type RoadEventReadType = RoadEventType | TomTomRoadEventType;

export type RoadEventStatus = 'ACTIVE' | 'UNCONFIRMED' | 'STALE' | 'RESOLVED';

export type RoadEventViewerRelation = 'CREATOR' | 'CONFIRM' | 'REJECT';

export interface RoadEventPointGeometry {
  type: 'Point';

  coordinates: [number, number];
}

export interface RoadEventLineStringGeometry {
  type: 'LineString';

  coordinates: Array<[number, number]>;
}

export interface RoadEventMultiLineStringGeometry {
  type: 'MultiLineString';

  coordinates: Array<Array<[number, number]>>;
}

export type RoadEventGeometry =
  | RoadEventPointGeometry
  | RoadEventLineStringGeometry
  | RoadEventMultiLineStringGeometry;

export type LocationPrecision =
  | 'EXACT'
  | 'INTERSECTION'
  | 'LANDMARK'
  | 'STREET'
  | 'AREA'
  | 'SETTLEMENT';

interface RoadEventBase {
  id: string;

  cityId: string;

  title: string;

  description?: string;

  geometry: RoadEventGeometry;
}

export interface UserRoadEvent extends RoadEventBase {
  source: 'USER';

  type: RoadEventType;

  geometry: RoadEventPointGeometry;

  status: RoadEventStatus;

  coordinate: [number, number];

  confirmationCount: number;

  rejectionCount: number;

  lastConfirmedAt?: string;

  confidence: number;

  createdAt: string;

  expiresAt: string;

  viewerRelation?: RoadEventViewerRelation | null;
}

export interface TelegramRoadEvent extends RoadEventBase {
  source: 'TELEGRAM';

  type: RoadEventType;

  geometry: RoadEventGeometry;

  status: RoadEventStatus;

  coordinate: [number, number];

  sourceText?: string;

  locationPrecision: LocationPrecision;

  locationLabel?: string;

  lastConfirmedAt?: string;

  createdAt: string;

  expiresAt: string;

  confirmationCount?: number;

  rejectionCount?: number;

  confidence?: number;

  viewerRelation?: RoadEventViewerRelation | null;
}

export interface TomTomRoadEvent extends RoadEventBase {
  source: 'TOMTOM';

  type: TomTomRoadEventType;

  description?: string;

  from?: string;

  to?: string;

  startTime?: string;

  endTime?: string;

  timeValidity?: string;

  updatedAt?: string;

  fetchedAt: string;

  delaySeconds?: number;

  lengthMeters?: number;
}

export type RoadEvent = UserRoadEvent | TelegramRoadEvent | TomTomRoadEvent;

export type PointRoadEvent =
  | UserRoadEvent
  | (TelegramRoadEvent & { geometry: RoadEventPointGeometry });

export const isUserRoadEvent = (event: RoadEvent): event is UserRoadEvent =>
  event.source === 'USER';

export const isTomTomRoadEvent = (event: RoadEvent): event is TomTomRoadEvent =>
  event.source === 'TOMTOM';

export const isPointRoadEvent = (event: RoadEvent): event is PointRoadEvent =>
  event.source === 'USER' ||
  (event.source === 'TELEGRAM' && event.geometry.type === 'Point');
