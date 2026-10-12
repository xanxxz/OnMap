import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';

import {
  getCityConfig,
  isCoordinateInsideCityCoverage,
} from '../cities/city.registry';

import { PrismaService } from '../database/prisma.service';

import { TomTomIntegrationError } from '../integrations/tomtom/tomtom.errors';

import { TomTomTrafficProvider } from '../integrations/tomtom/tomtom-traffic.provider';

import { CreateRoadEventDto } from './dto/create-road-event.dto';

import { FeedbackRoadEventDto } from './dto/feedback-road-event.dto';

import { ListRoadEventsQueryDto } from './dto/list-road-events-query.dto';

import {
  ROAD_EVENT_CREATE_RATE_LIMIT,
  ROAD_EVENT_DEDUPLICATION,
  ROAD_EVENT_FEEDBACK_RATE_LIMIT,
  ROAD_EVENT_LIFECYCLE_INTERVAL_MS,
  ROAD_EVENT_RATE_LIMIT_CLEANUP_INTERVAL_MS,
  ROAD_EVENT_TITLE_BY_TYPE,
  ROAD_EVENT_TTL_MINUTES,
  ROAD_PATROL_LIFECYCLE,
  TELEGRAM_EVENT_TTL_MS,
  RoadEventFeedbackAction,
  RoadEventStatus,
  RoadEventType,
} from './road-events.constants';

import {
  geometryIntersectsBounds,
  toTelegramRoadEventListItem,
  toTomTomRoadEventListItem,
  toUserRoadEventListItem,
} from './road-events.read-model';

import {
  RoadEventDbRow,
  RoadEventListItem,
  RoadEventRealtimePayload,
  RoadEventResponse,
  DpsActivitySummary,
} from './road-events.types';

import { RoadEventsGateway } from './realtime/road-events.gateway';
import { DpsActivityTracker } from './dps-activity-tracker.service';
import { sanitizeTelegramSourceText } from './telegram-source-text';
import {
  ROAD_EVENT_CONFIDENCE,
  confidencePercent,
  confidenceAfterFeedback,
  expiryAfterSignal,
  userConfidenceFromVotes,
  visibleRoadEventConfidence,
} from './road-event-confidence';
import { queueRoadEventPush } from '../push/push-queue';

interface FeedbackActionRow {
  action: RoadEventFeedbackAction;
}

interface LifecycleRoadEventRow {
  kind: 'RESOLVED' | 'UNSUPPORTED_TELEGRAM_TYPE';

  id: string | null;

  cityId: string | null;

  resolvedAt: Date | string | null;

  unsupportedType: string | null;
}

interface SimilarRoadEventRow extends RoadEventDbRow {
  viewerFeedback: RoadEventFeedbackAction | null;
}

interface RateLimitBucket {
  timestamps: number[];

  windowMs: number;
}

type RateLimitScope = 'create' | 'feedback';

@Injectable()
export class RoadEventsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RoadEventsService.name);

  private lifecycleInterval?: NodeJS.Timeout;

  private lifecycleTickRunning = false;

  private readonly reportedUnsupportedTelegramLifecycleTypes =
    new Set<string>();

  private readonly rateLimitBuckets = new Map<string, RateLimitBucket>();

  private lastRateLimitCleanupAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,

    private readonly gateway: RoadEventsGateway,

    private readonly tomTomTrafficProvider: TomTomTrafficProvider,

    private readonly dpsActivityTracker: DpsActivityTracker,
  ) {}

  onApplicationBootstrap() {
    this.lifecycleInterval = setInterval(() => {
      void this.runScheduledLifecycleTick();
    }, ROAD_EVENT_LIFECYCLE_INTERVAL_MS);

    this.lifecycleInterval.unref();

    void this.runScheduledLifecycleTick();
  }

  onModuleDestroy() {
    if (this.lifecycleInterval) {
      clearInterval(this.lifecycleInterval);

      this.lifecycleInterval = undefined;
    }
  }

  async list(
    query: ListRoadEventsQueryDto,

    identityId: string,
    exactId?: string,
  ): Promise<RoadEventListItem[]> {
    this.validateCityId(query.cityId);

    this.validateBounds(query);

    await this.runLifecycleTick(query.cityId);

    const rows = await this.prisma.$queryRaw<RoadEventDbRow[]>`
          SELECT
            event.id::text AS "id",
            event.city_id AS "cityId",
            event.type::text AS "type",
            event.status::text AS "status",
            event.source::text AS "source",
            event.title,
            event.description,
            event.longitude,
            event.latitude,
            ST_AsGeoJSON(event.location)::json AS "geometry",
            event.source_text AS "sourceText",
            event.location_precision::text AS "locationPrecision",
            event.location_label AS "locationLabel",
            event.created_by_installation_id
              AS "createdByInstallationId",
            event.confirmation_count
              AS "confirmationCount",
            event.rejection_count
              AS "rejectionCount",
            event.last_confirmed_at
              AS "lastConfirmedAt",
            event.confidence,
            event.created_at
              AS "createdAt",
            event.expires_at
              AS "expiresAt",

            CASE
              WHEN
                event.created_by_installation_id =
                  ${identityId}
                THEN 'CREATOR'

              WHEN
                feedback.action =
                  'CONFIRM'::"RoadEventFeedbackAction"
                THEN 'CONFIRM'

              WHEN
                feedback.action =
                  'REJECT'::"RoadEventFeedbackAction"
                THEN 'REJECT'

              ELSE NULL
            END AS "viewerRelation"

          FROM road_events event

          LEFT JOIN road_event_feedback feedback
            ON
              feedback.road_event_id =
                event.id
              AND
              feedback.installation_id =
                ${identityId}

          WHERE
            event.city_id =
              ${query.cityId}

            AND (${exactId ?? null}::uuid IS NULL OR event.id = ${exactId ?? null}::uuid)

            AND event.status <>
              'RESOLVED'::"RoadEventStatus"

            AND event.status <>
              'HIDDEN_PENDING_REVIEW'::"RoadEventStatus"

            AND event.expires_at >
              NOW()

            AND event.location
              IS NOT NULL

            AND event.location &&
              ST_MakeEnvelope(
                ${query.west},
                ${query.south},
                ${query.east},
                ${query.north},
                4326
              )

          ORDER BY
            event.created_at DESC

          LIMIT 500
        `;

    const responseTime = new Date();
    const persistedEvents = rows.map((row) => {
      const event = this.toResponse(row, responseTime);

      return row.source === 'TELEGRAM'
        ? toTelegramRoadEventListItem(event)
        : toUserRoadEventListItem(event);
    });

    const tomTomEvents = exactId ? [] : await this.listTomTomIncidents(query);

    return [...persistedEvents, ...tomTomEvents];
  }

  async getActiveById(id: string, cityId: string, identityId: string) {
    const city = this.validateCityId(cityId);
    const rows = await this.list(
      {
        cityId,
        west: city.coverageBounds.west,
        south: city.coverageBounds.south,
        east: city.coverageBounds.east,
        north: city.coverageBounds.north,
      },
      identityId,
      id,
    );
    if (!rows[0]) throw new NotFoundException('Road event unavailable');
    return rows[0];
  }

  async getDpsActivitySummary(cityId: string): Promise<DpsActivitySummary> {
    this.validateCityId(cityId);

    const rows = await this.prisma.$queryRaw<
      readonly { readonly count: number }[]
    >`
      SELECT COUNT(*)::int AS "count"
      FROM road_events
      WHERE city_id = ${cityId}
        AND type = 'ROAD_PATROL'::"RoadEventType"
        AND status <> 'RESOLVED'::"RoadEventStatus"
        AND status <> 'HIDDEN_PENDING_REVIEW'::"RoadEventStatus"
        AND expires_at > NOW()
    `;
    const onMap = Number(rows[0]?.count ?? 0);
    const unlocated = this.dpsActivityTracker.countUnlocated(cityId);

    return {
      cityId,
      onMap,
      unlocated,
      total: onMap + unlocated,
    };
  }

  async create(
    dto: CreateRoadEventDto,

    identityId: string,
  ): Promise<RoadEventResponse> {
    const [longitude, latitude] = dto.coordinate;

    this.validateCityCoordinate(dto.cityId, longitude, latitude);

    this.enforceRateLimit(
      'create',
      identityId,
      ROAD_EVENT_CREATE_RATE_LIMIT,
      'Road event creation rate limit exceeded',
    );

    const id = randomUUID();

    const now = new Date();

    const ttlMinutes = ROAD_EVENT_TTL_MINUTES[dto.type];

    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

    const title = dto.title?.trim() || ROAD_EVENT_TITLE_BY_TYPE[dto.type];

    const confidence = userConfidenceFromVotes(1, 0);

    const result = await this.prisma.$transaction(async (transaction) => {
      // A transaction-scoped city/type lock serializes the nearby check and insert.
      // This prevents two simultaneous reports from creating separate markers.
      await transaction.$queryRaw<readonly { locked: boolean }[]>`
        SELECT pg_advisory_xact_lock(hashtext(${`${dto.cityId}:${dto.type}`})) IS NULL AS locked
      `;
      const similarEvent = await this.findSimilarActiveEvent(
        dto.cityId,
        dto.type,
        longitude,
        latitude,
        identityId,
        transaction,
      );
      if (similarEvent !== null) {
        if (similarEvent.createdByInstallationId === identityId) {
          return { kind: 'already-owned' as const, row: similarEvent };
        }
        if (similarEvent.viewerFeedback === 'CONFIRM') {
          return { kind: 'already-confirmed' as const, row: similarEvent };
        }
        return { kind: 'existing' as const, id: similarEvent.id };
      }

      const rows = await transaction.$queryRaw<RoadEventDbRow[]>`
          INSERT INTO road_events (
            id,
            city_id,
            type,
            status,
            title,
            description,
            longitude,
            latitude,
            location,
            created_by_installation_id,
            confirmation_count,
            rejection_count,
            last_confirmed_at,
            confidence,
            created_at,
            updated_at,
            expires_at
          )
          VALUES (
            ${id}::uuid,
            ${dto.cityId},
            ${dto.type}::"RoadEventType",
            'UNCONFIRMED'::"RoadEventStatus",
            ${title},
            ${dto.description ?? null},
            ${longitude},
            ${latitude},
            ST_SetSRID(
              ST_MakePoint(
                ${longitude},
                ${latitude}
              ),
              4326
            ),
            ${identityId},
            1,
            0,
            ${now},
            ${confidence},
            ${now},
            ${now},
            ${expiresAt}
          )
          RETURNING
            id::text AS "id",
            city_id AS "cityId",
            type::text AS "type",
            source::text AS "source",
            status::text AS "status",
            title,
            description,
            longitude,
            latitude,
            created_by_installation_id
              AS "createdByInstallationId",
            confirmation_count
              AS "confirmationCount",
            rejection_count
              AS "rejectionCount",
            last_confirmed_at
              AS "lastConfirmedAt",
            confidence,
            created_at
              AS "createdAt",
            expires_at
              AS "expiresAt"
        `;

      if (rows[0] && process.env.PUSH_ENQUEUE_ENABLED === 'true') {
        await queueRoadEventPush(transaction, {
          id: rows[0].id,
          cityId: dto.cityId,
          type: dto.type,
        });
      }

      return { kind: 'created' as const, row: rows[0] };
    });

    if (result.kind === 'existing') {
      return this.feedback(result.id, { action: 'CONFIRM' }, identityId);
    }

    if (
      result.kind === 'already-owned' ||
      result.kind === 'already-confirmed'
    ) {
      return {
        ...this.toResponse(result.row),
        viewerRelation: result.kind === 'already-owned' ? 'CREATOR' : 'CONFIRM',
      };
    }

    const row = result.row;

    if (!row) {
      throw new Error('Failed to create road event');
    }

    const event: RoadEventResponse = {
      ...this.toResponse(row),

      viewerRelation: 'CREATOR',
    };

    this.gateway.broadcastCreated(this.toRealtimePayload(event));

    return event;
  }

  async feedback(
    eventId: string,

    dto: FeedbackRoadEventDto,

    identityId: string,
  ): Promise<RoadEventResponse> {
    this.enforceRateLimit(
      'feedback',
      identityId,
      ROAD_EVENT_FEEDBACK_RATE_LIMIT,
      'Road event feedback rate limit exceeded',
    );

    const updated = await this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<RoadEventDbRow[]>`
                SELECT
                  id::text AS "id",
                  city_id AS "cityId",
                  type::text AS "type",
                  source::text AS "source",
                  status::text AS "status",
                  title,
                  description,
                  longitude,
                  latitude,
                  created_by_installation_id
                    AS "createdByInstallationId",
                  confirmation_count
                    AS "confirmationCount",
                  rejection_count
                    AS "rejectionCount",
                  last_confirmed_at
                    AS "lastConfirmedAt",
                  confidence,
                  created_at
                    AS "createdAt",
                  expires_at
                    AS "expiresAt"
                FROM road_events
                WHERE
                  id =
                    ${eventId}::uuid

                  AND (
                    source = 'USER'::"RoadEventSource"
                    OR type = 'ROAD_PATROL'::"RoadEventType"
                  )
                FOR UPDATE
              `;

      const current = rows[0];

      if (!current) {
        throw new NotFoundException('Road event not found');
      }

      if (current.createdByInstallationId === identityId) {
        throw new ConflictException({
          message: 'Creator cannot vote for own event',

          viewerRelation: 'CREATOR',
        });
      }

      const now = new Date();

      const currentExpiresAt = new Date(current.expiresAt);

      if (
        current.status === 'RESOLVED' ||
        current.status === 'HIDDEN_PENDING_REVIEW' ||
        currentExpiresAt.getTime() <= now.getTime()
      ) {
        throw new GoneException('Road event no longer accepts feedback');
      }

      const feedbackId = randomUUID();

      const insertedFeedback = await transaction.$queryRaw<FeedbackActionRow[]>`
                INSERT INTO road_event_feedback (
                  id,
                  road_event_id,
                  installation_id,
                  action,
                  created_at
                )
                VALUES (
                  ${feedbackId}::uuid,
                  ${eventId}::uuid,
                  ${identityId},
                  ${dto.action}::"RoadEventFeedbackAction",
                  ${now}
                )
                ON CONFLICT (
                  road_event_id,
                  installation_id
                )
                DO NOTHING
                RETURNING
                  action::text
                    AS "action"
              `;

      if (insertedFeedback.length === 0) {
        const existing = await transaction.$queryRaw<FeedbackActionRow[]>`
                  SELECT
                    action::text
                      AS "action"
                  FROM road_event_feedback
                  WHERE
                    road_event_id =
                      ${eventId}::uuid
                    AND installation_id =
                      ${identityId}
                  LIMIT 1
                `;

        throw new ConflictException({
          message: 'Feedback already submitted',

          existingAction: existing[0]?.action ?? null,
        });
      }

      const confirmationCount =
        current.confirmationCount + (dto.action === 'CONFIRM' ? 1 : 0);

      const rejectionCount =
        current.rejectionCount + (dto.action === 'REJECT' ? 1 : 0);

      const confidence = confidenceAfterFeedback(
        current.source ?? 'USER',
        Number(current.confidence),
        confirmationCount,
        rejectionCount,
        dto.action,
      );

      const expiresAt = expiryAfterSignal({
        action: dto.action,
        type: current.type,
        source: current.source ?? 'USER',
        createdAt: current.createdAt,
        currentExpiresAt,
        now,
      });

      const lastConfirmedAt =
        dto.action === 'CONFIRM'
          ? now
          : current.lastConfirmedAt
            ? new Date(current.lastConfirmedAt)
            : null;

      const status = this.deriveStatus(
        current.type,

        current.status,

        dto.action,

        confirmationCount,

        rejectionCount,

        confidence,
      );

      const result = await transaction.$queryRaw<RoadEventDbRow[]>`
                UPDATE road_events
                SET
                  confirmation_count =
                    ${confirmationCount},

                  rejection_count =
                    ${rejectionCount},

                  confidence =
                    ${confidence},

                  last_confirmed_at =
                    ${lastConfirmedAt},

                  expires_at =
                    ${expiresAt},

                  status =
                    ${status}::"RoadEventStatus",

                  updated_at =
                    ${now}

                WHERE
                  id =
                    ${eventId}::uuid

                RETURNING
                  id::text AS "id",
                  city_id AS "cityId",
                  type::text AS "type",
                  source::text AS "source",
                  status::text AS "status",
                  title,
                  description,
                  longitude,
                  latitude,
                  created_by_installation_id
                    AS "createdByInstallationId",
                  confirmation_count
                    AS "confirmationCount",
                  rejection_count
                    AS "rejectionCount",
                  last_confirmed_at
                    AS "lastConfirmedAt",
                  confidence,
                  created_at
                    AS "createdAt",
                  expires_at
                    AS "expiresAt"
              `;

      return result[0];
    });

    if (!updated) {
      throw new Error('Failed to update road event');
    }

    const event: RoadEventResponse = {
      ...this.toResponse(updated),

      viewerRelation: dto.action,
    };

    if (event.status === 'RESOLVED') {
      this.gateway.broadcastResolved({
        id: event.id,

        cityId: event.cityId,

        resolvedAt: new Date().toISOString(),
      });
    } else {
      this.gateway.broadcastUpdated(
        this.toRealtimePayload(event, updated.source ?? 'USER'),
      );
    }

    return event;
  }

  async runLifecycleTick(cityId?: string) {
    await this.refreshStatuses(cityId);
  }

  private async refreshStatuses(cityId?: string) {
    const cityIdFilter = cityId ?? null;

    await this.prisma.$executeRaw`
        UPDATE road_events
        SET
          status =
            'STALE'::"RoadEventStatus",
          updated_at =
            NOW()
        WHERE
          (
            ${cityIdFilter}::text
              IS NULL
            OR city_id =
              ${cityIdFilter}
          )

          AND status IN (
            'ACTIVE'::"RoadEventStatus",
            'UNCONFIRMED'::"RoadEventStatus"
          )

          AND source =
            'USER'::"RoadEventSource"

          AND expires_at >
            NOW()

          AND COALESCE(
            last_confirmed_at,
            created_at
          ) <=
            NOW() -
            CASE type
              WHEN
                'ACCIDENT'::"RoadEventType"
                THEN ${ROAD_EVENT_TTL_MINUTES.ACCIDENT * ROAD_EVENT_CONFIDENCE.staleAgeFraction * 60_000} * INTERVAL '1 millisecond'

              WHEN
                'ROAD_CLOSURE'::"RoadEventType"
                THEN ${ROAD_EVENT_TTL_MINUTES.ROAD_CLOSURE * ROAD_EVENT_CONFIDENCE.staleAgeFraction * 60_000} * INTERVAL '1 millisecond'

              WHEN
                'ROADWORKS'::"RoadEventType"
                THEN ${ROAD_EVENT_TTL_MINUTES.ROADWORKS * ROAD_EVENT_CONFIDENCE.staleAgeFraction * 60_000} * INTERVAL '1 millisecond'

              WHEN
                'TRAFFIC'::"RoadEventType"
                THEN ${ROAD_EVENT_TTL_MINUTES.TRAFFIC * ROAD_EVENT_CONFIDENCE.staleAgeFraction * 60_000} * INTERVAL '1 millisecond'

              WHEN
                'ROAD_HAZARD'::"RoadEventType"
                THEN ${ROAD_EVENT_TTL_MINUTES.ROAD_HAZARD * ROAD_EVENT_CONFIDENCE.staleAgeFraction * 60_000} * INTERVAL '1 millisecond'

              WHEN
                'TRAFFIC_LIGHT'::"RoadEventType"
                THEN ${ROAD_EVENT_TTL_MINUTES.TRAFFIC_LIGHT * ROAD_EVENT_CONFIDENCE.staleAgeFraction * 60_000} * INTERVAL '1 millisecond'

              WHEN
                'ROAD_SERVICE'::"RoadEventType"
                THEN ${ROAD_EVENT_TTL_MINUTES.ROAD_SERVICE * ROAD_EVENT_CONFIDENCE.staleAgeFraction * 60_000} * INTERVAL '1 millisecond'

              WHEN
                'ROAD_PATROL'::"RoadEventType"
                THEN ${ROAD_PATROL_LIFECYCLE.staleAfterMs} * INTERVAL '1 millisecond'

              ELSE
                ${ROAD_EVENT_TTL_MINUTES.OTHER * ROAD_EVENT_CONFIDENCE.staleAgeFraction * 60_000} * INTERVAL '1 millisecond'
            END
      `;

    const lifecycleRows = await this.prisma.$queryRaw<LifecycleRoadEventRow[]>`
        WITH resolved_events AS (
          UPDATE road_events AS event
          SET
            status = 'RESOLVED'::"RoadEventStatus",
            resolved_at = CASE
              WHEN event.source = 'TELEGRAM'::"RoadEventSource"
                THEN NOW()
              ELSE event.resolved_at
            END,
            updated_at = NOW()
          WHERE
            (
              ${cityIdFilter}::text IS NULL
              OR event.city_id = ${cityIdFilter}
            )
            AND event.status <> 'RESOLVED'::"RoadEventStatus"
            AND (
              (
                event.source = 'USER'::"RoadEventSource"
                AND event.expires_at <= NOW()
              )
              OR
              (
                event.source = 'TELEGRAM'::"RoadEventSource"
                AND event.status = 'ACTIVE'::"RoadEventStatus"
                AND (
                  (
                    event.type = 'ROAD_PATROL'::"RoadEventType"
                    AND event.expires_at <= NOW()
                  )
                  OR (
                    event.type <> 'ROAD_PATROL'::"RoadEventType"
                    AND (
                      SELECT MAX(mapping.source_timestamp)
                      FROM telegram_road_event_messages AS mapping
                      WHERE
                        mapping.road_event_id = event.id
                        AND mapping.source = 'TELEGRAM'::"RoadEventSource"
                        AND mapping.outcome IN ('CREATED', 'UPDATED')
                    ) <= NOW() - CASE event.type
                      WHEN 'ACCIDENT'::"RoadEventType"
                        THEN ${TELEGRAM_EVENT_TTL_MS.ACCIDENT} * INTERVAL '1 millisecond'
                      WHEN 'TRAFFIC'::"RoadEventType"
                        THEN ${TELEGRAM_EVENT_TTL_MS.TRAFFIC} * INTERVAL '1 millisecond'
                      WHEN 'ROAD_CLOSURE'::"RoadEventType"
                        THEN ${TELEGRAM_EVENT_TTL_MS.ROAD_CLOSURE} * INTERVAL '1 millisecond'
                      WHEN 'ROADWORKS'::"RoadEventType"
                        THEN ${TELEGRAM_EVENT_TTL_MS.ROADWORKS} * INTERVAL '1 millisecond'
                      WHEN 'ROAD_HAZARD'::"RoadEventType"
                        THEN ${TELEGRAM_EVENT_TTL_MS.ROAD_HAZARD} * INTERVAL '1 millisecond'
                      WHEN 'OTHER'::"RoadEventType"
                        THEN ${TELEGRAM_EVENT_TTL_MS.OTHER} * INTERVAL '1 millisecond'
                      ELSE NULL
                    END
                  )
                )
              )
            )
          RETURNING
            event.id,
            event.city_id,
            event.updated_at
        ),
        unsupported_telegram_types AS (
          SELECT DISTINCT event.type::text AS unsupported_type
          FROM road_events AS event
          WHERE
            (
              ${cityIdFilter}::text IS NULL
              OR event.city_id = ${cityIdFilter}
            )
            AND event.source = 'TELEGRAM'::"RoadEventSource"
            AND event.status = 'ACTIVE'::"RoadEventStatus"
            AND event.type NOT IN (
              'ACCIDENT'::"RoadEventType",
              'TRAFFIC'::"RoadEventType",
              'ROAD_CLOSURE'::"RoadEventType",
              'ROADWORKS'::"RoadEventType",
              'ROAD_HAZARD'::"RoadEventType",
              'ROAD_PATROL'::"RoadEventType",
              'OTHER'::"RoadEventType"
            )
        )
        SELECT
          'RESOLVED'::text AS "kind",
          resolved_events.id::text AS "id",
          resolved_events.city_id AS "cityId",
          resolved_events.updated_at AS "resolvedAt",
          NULL::text AS "unsupportedType"
        FROM resolved_events
        UNION ALL
        SELECT
          'UNSUPPORTED_TELEGRAM_TYPE'::text AS "kind",
          NULL::text AS "id",
          NULL::text AS "cityId",
          NULL::timestamptz AS "resolvedAt",
          unsupported_type AS "unsupportedType"
        FROM unsupported_telegram_types
      `;

    for (const event of lifecycleRows) {
      if (event.kind === 'UNSUPPORTED_TELEGRAM_TYPE') {
        if (
          event.unsupportedType !== null &&
          !this.reportedUnsupportedTelegramLifecycleTypes.has(
            event.unsupportedType,
          )
        ) {
          this.reportedUnsupportedTelegramLifecycleTypes.add(
            event.unsupportedType,
          );
          this.logger.warn(
            `Skipping Telegram lifecycle for unsupported event type: ${event.unsupportedType}`,
          );
        }

        continue;
      }

      if (
        event.id === null ||
        event.cityId === null ||
        event.resolvedAt === null
      ) {
        continue;
      }

      this.gateway.broadcastResolved({
        id: event.id,

        cityId: event.cityId,

        resolvedAt: new Date(event.resolvedAt).toISOString(),
      });
    }
  }

  private async runScheduledLifecycleTick() {
    if (this.lifecycleTickRunning) {
      return;
    }

    this.lifecycleTickRunning = true;

    try {
      await this.runLifecycleTick();
    } catch (error) {
      this.logger.error(
        'RoadEvent lifecycle tick failed',

        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.lifecycleTickRunning = false;
    }
  }

  private async findSimilarActiveEvent(
    cityId: string,

    type: RoadEventType,

    longitude: number,

    latitude: number,
    identityId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<SimilarRoadEventRow | null> {
    const windowMs =
      type === 'ROAD_PATROL'
        ? ROAD_PATROL_LIFECYCLE.maxLifetimeMs
        : ROAD_EVENT_DEDUPLICATION.windowMs;
    const similarEvents = await transaction.$queryRaw<SimilarRoadEventRow[]>`
          WITH candidate AS (
            SELECT
              ST_SetSRID(
                ST_MakePoint(
                  ${longitude},
                  ${latitude}
                ),
                4326
              ) AS location
          )

          SELECT
            event.id::text AS "id",
            event.city_id AS "cityId",
            event.type::text AS "type",
            event.source::text AS "source",
            event.status::text AS "status",
            event.title,
            event.description,
            event.longitude,
            event.latitude,
            ST_AsGeoJSON(event.location)::json AS "geometry",
            event.created_by_installation_id AS "createdByInstallationId",
            event.confirmation_count AS "confirmationCount",
            event.rejection_count AS "rejectionCount",
            event.last_confirmed_at AS "lastConfirmedAt",
            event.confidence,
            event.created_at AS "createdAt",
            event.expires_at AS "expiresAt",
            (
              SELECT feedback.action::text
              FROM road_event_feedback feedback
              WHERE feedback.road_event_id = event.id
                AND feedback.installation_id = ${identityId}
              LIMIT 1
            ) AS "viewerFeedback"
          FROM road_events event
          CROSS JOIN candidate
          WHERE
            event.city_id =
              ${cityId}

            AND event.type =
              ${type}::"RoadEventType"

            AND (
              event.source = 'USER'::"RoadEventSource"
              OR ${type}::"RoadEventType" = 'ROAD_PATROL'::"RoadEventType"
            )

            AND (
              event.status IN (
                'ACTIVE'::"RoadEventStatus",
                'UNCONFIRMED'::"RoadEventStatus"
              )
              OR (
                ${type}::"RoadEventType" = 'ROAD_PATROL'::"RoadEventType"
                AND event.status = 'STALE'::"RoadEventStatus"
              )
            )

            AND event.expires_at >
              NOW()

            AND event.created_at >=
              NOW() -
              ${windowMs}::double precision *
              INTERVAL '1 millisecond'

            AND event.location &&
              ST_Expand(
                candidate.location,
                ${ROAD_EVENT_DEDUPLICATION.boundingBoxRadiusDegrees}
              )

            AND ST_DWithin(
              event.location::geography,
              candidate.location::geography,
              ${ROAD_EVENT_DEDUPLICATION.radiusMeters}
            )

          LIMIT 1
        `;

    return similarEvents[0] ?? null;
  }

  private enforceRateLimit(
    scope: RateLimitScope,

    identityId: string,

    limit: {
      readonly maxRequests: number;

      readonly windowMs: number;
    },

    message: string,
  ) {
    const now = Date.now();

    this.cleanupRateLimitBuckets(now);

    const key = `${scope}:${identityId}`;

    const windowStart = now - limit.windowMs;

    const timestamps = (
      this.rateLimitBuckets.get(key)?.timestamps ?? []
    ).filter((timestamp) => timestamp > windowStart);

    if (timestamps.length >= limit.maxRequests) {
      this.rateLimitBuckets.set(key, {
        timestamps,
        windowMs: limit.windowMs,
      });

      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }

    timestamps.push(now);

    this.rateLimitBuckets.set(key, {
      timestamps,
      windowMs: limit.windowMs,
    });
  }

  private cleanupRateLimitBuckets(now: number) {
    if (
      now - this.lastRateLimitCleanupAt <
      ROAD_EVENT_RATE_LIMIT_CLEANUP_INTERVAL_MS
    ) {
      return;
    }

    for (const [key, bucket] of this.rateLimitBuckets) {
      const timestamps = bucket.timestamps.filter(
        (timestamp) => timestamp > now - bucket.windowMs,
      );

      if (timestamps.length === 0) {
        this.rateLimitBuckets.delete(key);
      } else {
        bucket.timestamps = timestamps;
      }
    }

    this.lastRateLimitCleanupAt = now;
  }

  private deriveStatus(
    type: RoadEventType,

    currentStatus: RoadEventStatus,

    action: RoadEventFeedbackAction,

    confirmationCount: number,

    rejectionCount: number,

    confidence: number,
  ): RoadEventStatus {
    if (type === 'ROAD_PATROL') {
      if (rejectionCount >= ROAD_PATROL_LIFECYCLE.resolveRejectionCount) {
        return 'RESOLVED';
      }

      if (
        rejectionCount >= ROAD_PATROL_LIFECYCLE.staleRejectionCount &&
        rejectionCount > confirmationCount
      ) {
        return 'STALE';
      }

      if (action === 'CONFIRM') {
        return 'ACTIVE';
      }

      return currentStatus === 'STALE' ? 'STALE' : 'UNCONFIRMED';
    }

    if (
      rejectionCount >= ROAD_EVENT_CONFIDENCE.otherResolveRejectionCount &&
      confidence <= ROAD_EVENT_CONFIDENCE.otherResolveConfidence
    ) {
      return 'RESOLVED';
    }

    if (
      rejectionCount >= ROAD_EVENT_CONFIDENCE.otherStaleRejectionCount &&
      confidence < ROAD_EVENT_CONFIDENCE.otherStaleConfidence
    ) {
      return 'STALE';
    }

    if (
      confirmationCount >= ROAD_EVENT_CONFIDENCE.activeConfirmationCount &&
      confidence >= ROAD_EVENT_CONFIDENCE.activeConfidence
    ) {
      return 'ACTIVE';
    }

    if (currentStatus === 'STALE' && action === 'REJECT') {
      return 'STALE';
    }

    return 'UNCONFIRMED';
  }

  private validateCoordinate(
    longitude: number,

    latitude: number,
  ) {
    if (
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new BadRequestException('Invalid coordinate');
    }
  }

  private validateCityCoordinate(
    cityId: string,

    longitude: number,

    latitude: number,
  ) {
    this.validateCoordinate(longitude, latitude);

    const city = this.validateCityId(cityId);

    if (!isCoordinateInsideCityCoverage(city, latitude, longitude)) {
      throw new BadRequestException('Coordinate is outside city bounds');
    }
  }

  private validateCityId(cityId: string) {
    const city = getCityConfig(cityId);

    if (city === undefined) {
      throw new BadRequestException('Unsupported cityId');
    }

    return city;
  }

  private validateBounds(query: ListRoadEventsQueryDto) {
    if (query.west >= query.east) {
      throw new BadRequestException('west must be less than east');
    }

    if (query.south >= query.north) {
      throw new BadRequestException('south must be less than north');
    }
  }

  private async listTomTomIncidents(query: ListRoadEventsQueryDto) {
    try {
      const incidents = await this.tomTomTrafficProvider.getIncidents(
        query.cityId,
      );

      const viewport = {
        west: query.west,

        south: query.south,

        east: query.east,

        north: query.north,
      };

      return incidents
        .filter((incident) =>
          geometryIntersectsBounds(incident.geometry, viewport),
        )
        .map((incident) => toTomTomRoadEventListItem(query.cityId, incident));
    } catch (error) {
      const reason =
        error instanceof TomTomIntegrationError
          ? error.code
          : 'UNEXPECTED_ERROR';

      if (reason !== 'DISABLED') {
        this.logger.warn(
          `TomTom Traffic omitted from RoadEvents response (${reason})`,
        );
      }

      return [];
    }
  }

  private toResponse(row: RoadEventDbRow, now = new Date()): RoadEventResponse {
    const confidence = visibleRoadEventConfidence({
      storedConfidence: Number(row.confidence),
      source: row.source ?? 'USER',
      type: row.type,
      confirmationCount: Number(row.confirmationCount),
      rejectionCount: Number(row.rejectionCount),
      lastConfirmedAt: row.lastConfirmedAt,
      createdAt: row.createdAt,
      now,
    });
    const response: RoadEventResponse = {
      id: row.id,

      ...(row.source === undefined ? {} : { source: row.source }),

      cityId: row.cityId,

      type: row.type,

      status: row.status,

      title: row.title,

      ...(row.description
        ? {
            description: row.description,
          }
        : {}),

      coordinate: [Number(row.longitude), Number(row.latitude)],

      ...(row.geometry === undefined ? {} : { geometry: row.geometry }),

      ...(row.sourceText == null || row.source !== 'TELEGRAM'
        ? {}
        : { sourceText: sanitizeTelegramSourceText(row.sourceText) }),

      ...(row.locationPrecision == null
        ? {}
        : { locationPrecision: row.locationPrecision }),

      ...(row.locationLabel == null
        ? {}
        : {
            locationLabel:
              row.source === 'TELEGRAM'
                ? sanitizeTelegramSourceText(row.locationLabel)
                : row.locationLabel,
          }),

      confirmationCount: Number(row.confirmationCount),

      rejectionCount: Number(row.rejectionCount),

      ...(row.lastConfirmedAt
        ? {
            lastConfirmedAt: new Date(row.lastConfirmedAt).toISOString(),
          }
        : {}),

      confidence,

      confidencePercent: confidencePercent(confidence),

      createdAt: new Date(row.createdAt).toISOString(),

      expiresAt: new Date(row.expiresAt).toISOString(),
    };

    if (row.viewerRelation !== undefined) {
      response.viewerRelation = row.viewerRelation ?? null;
    }

    return response;
  }

  private toRealtimePayload(
    event: RoadEventResponse,
    source: 'USER' | 'TELEGRAM' = 'USER',
  ): RoadEventRealtimePayload {
    const payload = { ...event };

    delete payload.viewerRelation;

    return { ...payload, source };
  }
}
