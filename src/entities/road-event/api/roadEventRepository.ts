import {
  MapBounds,
} from '../../../shared/types/map';

import {
  RoadEventFeedbackAction,
} from '../model/roadEvent';

import {
  RoadEvent,
  RoadEventType,
  UserRoadEvent,
  TelegramRoadEvent,
} from '../model/roadEvent';

export interface DpsActivitySummary {
  cityId: string;
  onMap: number;
  unlocated: number;
  total: number;
}

export interface RoadEventListParams {
  cityId: string;

  bounds?: MapBounds;
}

export interface CreateRoadEventInput {
  cityId: string;

  type: RoadEventType;

  title: string;

  description?: string;

  coordinate: [
    number,
    number,
  ];
}

export interface RoadEventFeedbackInput {
  cityId: string;

  eventId: string;

  action:
    RoadEventFeedbackAction;
}

export type RoadEventReportReason =
  | 'WRONG_TYPE'
  | 'WRONG_LOCATION'
  | 'DUPLICATE'
  | 'OTHER_ABUSE';

export interface RoadEventReportInput {
  eventId: string;
  reason: RoadEventReportReason;
}

export interface RoadEventReportResult {
  accepted: true;
  duplicate: boolean;
  hidden: boolean;
}

export interface RoadEventModerationNotice {
  id: string;
  eventId: string;
  type: RoadEventType;
  createdAt: string;
  moderationState:
    | 'PENDING_REVIEW'
    | 'RESTORED'
    | 'AUTHOR_RESTRICTED'
    | 'EXPIRED'
    | null;
  eventStatus: string;
}

export interface RoadEventRepository {
  getActiveById(id: string, cityId: string): Promise<Exclude<RoadEvent, {source: 'TOMTOM'}>>;
  list(
    params:
      RoadEventListParams,
  ): Promise<RoadEvent[]>;

  create(
    input:
      CreateRoadEventInput,
  ): Promise<UserRoadEvent | TelegramRoadEvent>;

  feedback(
    input:
      RoadEventFeedbackInput,
  ): Promise<UserRoadEvent | TelegramRoadEvent>;

  report(input: RoadEventReportInput): Promise<RoadEventReportResult>;

  getModerationNotices(): Promise<RoadEventModerationNotice[]>;

  acknowledgeModerationNotice(noticeId: string): Promise<void>;

  getDpsActivitySummary(cityId: string): Promise<DpsActivitySummary>;
}
