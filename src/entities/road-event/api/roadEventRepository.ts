import {
  MapBounds,
} from '../../../shared/types/map';

import {
  RoadEventFeedbackAction,
} from '../lib/roadEventFreshness';

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

export interface RoadEventRepository {
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

  getDpsActivitySummary(cityId: string): Promise<DpsActivitySummary>;
}
