import { Module } from '@nestjs/common';

import { RoadEventsModule } from '../../../road-events/road-events.module';

import { TelegramIngestionPersistenceService } from './telegram-ingestion-persistence.service';
import { TelegramRoadEventRealtimeBridge } from './telegram-road-event-realtime.bridge';

@Module({
  imports: [RoadEventsModule],
  providers: [
    TelegramIngestionPersistenceService,
    TelegramRoadEventRealtimeBridge,
  ],
  exports: [TelegramRoadEventRealtimeBridge],
})
export class TelegramPersistenceRealtimeModule {}
