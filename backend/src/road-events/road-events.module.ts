import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';

import { TomTomModule } from '../integrations/tomtom/tomtom.module';

import { RoadEventsController } from './road-events.controller';

import { RoadEventsService } from './road-events.service';

import { RoadEventsGateway } from './realtime/road-events.gateway';
import { DpsActivityTracker } from './dps-activity-tracker.service';

@Module({
  imports: [IdentityModule, TomTomModule],

  controllers: [RoadEventsController],

  providers: [RoadEventsService, RoadEventsGateway, DpsActivityTracker],

  exports: [RoadEventsService, RoadEventsGateway, DpsActivityTracker],
})
export class RoadEventsModule {}
