import { RoadEventStatus, RoadEventType } from './road-events.constants';

import type {
  ExternalRoadEventGeometry,
  ExternalRoadEventType,
} from '../integrations/tomtom/tomtom.types';
import type { TelegramLocationPrecision } from '../integrations/telegram/location-resolver/telegram-location-precision';

export type RoadEventViewerRelation = 'CREATOR' | 'CONFIRM' | 'REJECT';

export interface RoadEventDbRow {
  id: string;

  cityId: string;

  type: RoadEventType;

  status: RoadEventStatus;

  source?: 'USER' | 'TELEGRAM';

  title: string;

  description: string | null;

  longitude: number;

  latitude: number;

  createdByInstallationId: string | null;

  confirmationCount: number;

  rejectionCount: number;

  lastConfirmedAt: Date | string | null;

  confidence: number;

  createdAt: Date | string;

  expiresAt: Date | string;

  viewerRelation?: RoadEventViewerRelation | null;

  geometry?: ExternalRoadEventGeometry;

  sourceText?: string | null;

  locationPrecision?: TelegramLocationPrecision | null;

  locationLabel?: string | null;
}

export interface RoadEventResponse {
  id: string;

  source?: 'USER' | 'TELEGRAM';

  cityId: string;

  type: RoadEventType;

  status: RoadEventStatus;

  title: string;

  description?: string;

  coordinate: [number, number];

  confirmationCount: number;

  rejectionCount: number;

  lastConfirmedAt?: string;

  confidence: number;

  createdAt: string;

  expiresAt: string;

  viewerRelation?: RoadEventViewerRelation | null;

  geometry?: ExternalRoadEventGeometry;

  sourceText?: string;

  locationPrecision?: TelegramLocationPrecision;

  locationLabel?: string;
}

export interface UserRoadEventListItem extends RoadEventResponse {
  source: 'USER';

  geometry: {
    type: 'Point';

    coordinates: [number, number];
  };
}

export interface TelegramRoadEventListItem extends RoadEventResponse {
  source: 'TELEGRAM';

  geometry: ExternalRoadEventGeometry;

  sourceText?: string;

  locationPrecision: TelegramLocationPrecision;

  locationLabel?: string;
}

export interface TomTomRoadEventListItem {
  id: string;

  source: 'TOMTOM';

  cityId: string;

  type: ExternalRoadEventType;

  geometry: ExternalRoadEventGeometry;

  title: string;

  description: string | null;

  from: string | null;

  to: string | null;

  startTime: string | null;

  endTime: string | null;

  timeValidity: string | null;

  updatedAt: string | null;

  fetchedAt: string;

  delaySeconds: number | null;

  lengthMeters: number | null;
}

export type RoadEventListItem =
  UserRoadEventListItem | TelegramRoadEventListItem | TomTomRoadEventListItem;

export type RoadEventRealtimePayload = Omit<
  RoadEventResponse,
  'viewerRelation'
> & {
  source: 'USER' | 'TELEGRAM';
};

export interface RoadEventResolvedPayload {
  id: string;

  cityId: string;

  resolvedAt: string;
}

export interface DpsActivitySummary {
  cityId: string;

  onMap: number;

  unlocated: number;

  total: number;
}
