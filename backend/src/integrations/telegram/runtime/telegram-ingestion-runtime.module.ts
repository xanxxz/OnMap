import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TomTomModule } from '../../tomtom/tomtom.module';
import { TomTomSearchProvider } from '../../tomtom/tomtom-search.provider';
import { TelegramDryRunIngestionPipeline } from '../ingestion/telegram-dry-run-ingestion.pipeline';
import { TelegramLocationResolver } from '../location-resolver/telegram-location-resolver';
import { OsmStreetGeometryProvider } from '../location-resolver/osm-street-geometry.provider';
import { TelegramMessageParser } from '../parser/telegram-message.parser';
import { TelegramPersistenceRealtimeModule } from '../persistence/telegram-persistence-realtime.module';
import { TelegramModule } from '../telegram.module';
import { RoadEventsModule } from '../../../road-events/road-events.module';

import { TelegramIngestionRuntimeService } from './telegram-ingestion-runtime.service';
import { TelegramRuntimeReviewLogger } from './telegram-runtime-review.logger';
import { TelegramRuntimeContextStore } from './telegram-runtime-context.store';
import { TelegramSourceCursorStore } from './telegram-source-cursor.store';

@Module({
  imports: [
    TelegramModule,
    TelegramPersistenceRealtimeModule,
    TomTomModule,
    RoadEventsModule,
  ],
  providers: [
    TelegramRuntimeContextStore,
    TelegramSourceCursorStore,
    {
      provide: TelegramRuntimeReviewLogger,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new TelegramRuntimeReviewLogger(configService),
    },
    OsmStreetGeometryProvider,
    {
      provide: TelegramLocationResolver,
      inject: [TomTomSearchProvider, OsmStreetGeometryProvider],
      useFactory: (
        searchProvider: TomTomSearchProvider,
        streetGeometryProvider: OsmStreetGeometryProvider,
      ) => new TelegramLocationResolver(searchProvider, streetGeometryProvider),
    },
    {
      provide: TelegramMessageParser,
      useFactory: () => new TelegramMessageParser(),
    },
    {
      provide: TelegramDryRunIngestionPipeline,
      inject: [TelegramMessageParser, TelegramLocationResolver],
      useFactory: (
        parser: TelegramMessageParser,
        resolver: TelegramLocationResolver,
      ) => new TelegramDryRunIngestionPipeline(parser, resolver),
    },
    TelegramIngestionRuntimeService,
  ],
  exports: [TelegramIngestionRuntimeService],
})
export class TelegramIngestionRuntimeModule {}
