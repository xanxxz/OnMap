import {
  MapBounds,
} from '../../../shared/types/map';

import {
  RoadEventFeedbackAction,
} from '../lib/roadEventFreshness';

import {
  RoadEvent,
  RoadEventType,
} from '../model/roadEvent';

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

export interface RoadEventFeedbackRequest
  extends RoadEventFeedbackInput {
  installationId: string;
}

export interface RoadEventRepository {
  list(
    params:
      RoadEventListParams,
  ): Promise<RoadEvent[]>;

  create(
    input:
      CreateRoadEventInput,
  ): Promise<RoadEvent>;

  feedback(
    input:
      RoadEventFeedbackRequest,
  ): Promise<RoadEvent>;
}