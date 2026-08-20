import {
  Module,
} from '@nestjs/common';

import {
  RoadEventsController,
} from './road-events.controller';

import {
  RoadEventsService,
} from './road-events.service';

import {
  RoadEventsGateway,
} from './realtime/road-events.gateway';

@Module({
  controllers: [
    RoadEventsController,
  ],

  providers: [
    RoadEventsService,
    RoadEventsGateway,
  ],

  exports: [
    RoadEventsService,
    RoadEventsGateway,
  ],
})
export class RoadEventsModule {}