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

export type RoadEventStatus =
  | 'ACTIVE'
  | 'UNCONFIRMED'
  | 'STALE'
  | 'RESOLVED';

export type RoadEventViewerRelation =
  | 'CREATOR'
  | 'CONFIRM'
  | 'REJECT';

export interface RoadEvent {
  id: string;

  cityId: string;

  type:
    RoadEventType;

  status:
    RoadEventStatus;

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