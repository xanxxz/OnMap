import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';

import { TomTomModule } from '../integrations/tomtom/tomtom.module';

import { RoadEventsController } from './road-events.controller';

import { RoadEventsService } from './road-events.service';

import { RoadEventsGateway } from './realtime/road-events.gateway';
import { DpsActivityTracker } from './dps-activity-tracker.service';
import { RoadEventReportsService } from './road-event-reports.service';

@Module({
  imports: [IdentityModule, TomTomModule],

  controllers: [RoadEventsController],

  providers: [
    RoadEventsService,
    RoadEventsGateway,
    DpsActivityTracker,
    RoadEventReportsService,
  ],

  exports: [
    RoadEventsService,
    RoadEventsGateway,
    DpsActivityTracker,
    RoadEventReportsService,
  ],
})
export class RoadEventsModule {}
