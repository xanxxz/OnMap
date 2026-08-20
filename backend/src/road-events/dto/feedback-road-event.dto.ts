import {
  IsIn,
  IsString,
  Length,
} from 'class-validator';

import * as roadEventsConstants from '../road-events.constants';

export class FeedbackRoadEventDto {
  @IsIn([
    ...roadEventsConstants.ROAD_EVENT_FEEDBACK_ACTIONS,
  ])
  action!: roadEventsConstants.RoadEventFeedbackAction;

  @IsString()
  @Length(16, 128)
  installationId!: string;
}