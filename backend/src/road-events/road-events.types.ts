import {
  RoadEventStatus,
  RoadEventType,
} from './road-events.constants';

export type RoadEventViewerRelation =
  | 'CREATOR'
  | 'CONFIRM'
  | 'REJECT';

export interface RoadEventDbRow {
  id: string;

  cityId: string;

  type: RoadEventType;

  status: RoadEventStatus;

  title: string;

  description:
    | string
    | null;

  longitude: number;

  latitude: number;

  createdByInstallationId:
    | string
    | null;

  confirmationCount: number;

  rejectionCount: number;

  lastConfirmedAt:
    | Date
    | string
    | null;

  confidence: number;

  createdAt:
    | Date
    | string;

  expiresAt:
    | Date
    | string;

  viewerRelation?:
    | RoadEventViewerRelation
    | null;
}

export interface RoadEventResponse {
  id: string;

  cityId: string;

  type: RoadEventType;

  status: RoadEventStatus;

  title: string;

  description?: string;

  coordinate: [
    number,
    number,
  ];

  confirmationCount: number;

  rejectionCount: number;

  lastConfirmedAt?: string;

  confidence: number;

  createdAt: string;

  expiresAt: string;

  viewerRelation?:
    | RoadEventViewerRelation
    | null;
}

export type RoadEventRealtimePayload =
  Omit<
    RoadEventResponse,
    'viewerRelation'
  >;

export interface RoadEventResolvedPayload {
  id: string;

  cityId: string;

  resolvedAt: string;
}