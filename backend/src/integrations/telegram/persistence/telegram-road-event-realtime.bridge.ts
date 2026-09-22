import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import type {
  RoadEventRealtimePayload,
  RoadEventResolvedPayload,
} from '../../../road-events/road-events.types';
import { RoadEventsGateway } from '../../../road-events/realtime/road-events.gateway';
import type { NormalizedTelegramEvent } from '../ingestion/telegram-ingestion.types';

import { TelegramIngestionPersistenceService } from './telegram-ingestion-persistence.service';
import type { TelegramPersistenceResult } from './telegram-ingestion-persistence.types';

interface TelegramRealtimeRow {
  readonly id: string;
  readonly cityId: string;
  readonly type: RoadEventRealtimePayload['type'];
  readonly status: RoadEventRealtimePayload['status'];
  readonly title: string;
  readonly description: string | null;
  readonly longitude: number;
  readonly latitude: number;
  readonly geometry: RoadEventRealtimePayload['geometry'];
  readonly sourceText: string | null;
  readonly locationPrecision: RoadEventRealtimePayload['locationPrecision'];
  readonly locationLabel: string | null;
  readonly confirmationCount: number;
  readonly rejectionCount: number;
  readonly lastConfirmedAt: Date | string | null;
  readonly confidence: number;
  readonly createdAt: Date | string;
  readonly expiresAt: Date | string;
  readonly resolvedAt: Date | string | null;
}

type MutatedPersistenceResult = Extract<
  TelegramPersistenceResult,
  { status: 'CREATED' | 'UPDATED' | 'RESOLVED' }
>;

@Injectable()
export class TelegramRoadEventRealtimeBridge {
  private readonly logger = new Logger(TelegramRoadEventRealtimeBridge.name);

  constructor(
    private readonly persistence: TelegramIngestionPersistenceService,
    private readonly prisma: PrismaService,
    private readonly gateway: RoadEventsGateway,
  ) {}

  async apply(
    event: NormalizedTelegramEvent,
  ): Promise<TelegramPersistenceResult> {
    const result = await this.persistence.apply(event);

    if (
      result.status === 'CREATED' ||
      result.status === 'UPDATED' ||
      result.status === 'RESOLVED'
    ) {
      await this.emitCommittedMutation(result, event);
    }

    return result;
  }

  private async emitCommittedMutation(
    result: MutatedPersistenceResult,
    event: NormalizedTelegramEvent,
  ): Promise<void> {
    const eventName =
      result.status === 'CREATED'
        ? 'road-event:created'
        : result.status === 'UPDATED'
          ? 'road-event:updated'
          : 'road-event:resolved';

    try {
      const row = await this.findCommittedEvent(result.roadEventId);

      if (row === undefined) {
        throw new Error('Committed Telegram RoadEvent was not found');
      }

      if (result.status === 'RESOLVED') {
        if (row.resolvedAt === null) {
          throw new Error('Committed Telegram RoadEvent has no resolvedAt');
        }

        this.gateway.broadcastResolved(this.toResolvedPayload(row));
      } else {
        const payload = this.toRealtimePayload(row);

        if (result.status === 'CREATED') {
          this.gateway.broadcastCreated(payload);
        } else {
          this.gateway.broadcastUpdated(payload);
        }
      }
    } catch {
      this.logger.error(
        `Telegram RoadEvent realtime emit failed eventId=${result.roadEventId} eventType=${event.eventType} cityId=${event.cityId} eventName=${eventName}`,
      );
    }
  }

  private async findCommittedEvent(
    roadEventId: string,
  ): Promise<TelegramRealtimeRow | undefined> {
    const rows = await this.prisma.$queryRaw<TelegramRealtimeRow[]>`
      SELECT
        id::text AS "id",
        city_id AS "cityId",
        type::text AS "type",
        status::text AS "status",
        title,
        description,
        longitude,
        latitude,
        ST_AsGeoJSON(location)::json AS "geometry",
        source_text AS "sourceText",
        location_precision::text AS "locationPrecision",
        location_label AS "locationLabel",
        confirmation_count AS "confirmationCount",
        rejection_count AS "rejectionCount",
        last_confirmed_at AS "lastConfirmedAt",
        confidence,
        created_at AS "createdAt",
        expires_at AS "expiresAt",
        resolved_at AS "resolvedAt"
      FROM road_events
      WHERE
        id = ${roadEventId}::uuid
        AND source = 'TELEGRAM'::"RoadEventSource"
      LIMIT 1
    `;

    return rows[0];
  }

  private toRealtimePayload(
    row: TelegramRealtimeRow,
  ): RoadEventRealtimePayload {
    return {
      id: row.id,
      source: 'TELEGRAM',
      cityId: row.cityId,
      type: row.type,
      status: row.status,
      title: row.title,
      ...(row.description === null ? {} : { description: row.description }),
      coordinate: [Number(row.longitude), Number(row.latitude)],
      ...(row.geometry === undefined ? {} : { geometry: row.geometry }),
      ...(row.sourceText === null ? {} : { sourceText: row.sourceText }),
      ...(row.locationPrecision == null
        ? {}
        : { locationPrecision: row.locationPrecision }),
      ...(row.locationLabel === null
        ? {}
        : { locationLabel: row.locationLabel }),
      confirmationCount: Number(row.confirmationCount),
      rejectionCount: Number(row.rejectionCount),
      ...(row.lastConfirmedAt === null
        ? {}
        : {
            lastConfirmedAt: new Date(row.lastConfirmedAt).toISOString(),
          }),
      confidence: Number(row.confidence),
      createdAt: new Date(row.createdAt).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
    };
  }

  private toResolvedPayload(
    row: TelegramRealtimeRow,
  ): RoadEventResolvedPayload {
    return {
      id: row.id,
      cityId: row.cityId,
      resolvedAt: new Date(row.resolvedAt as Date | string).toISOString(),
    };
  }
}
