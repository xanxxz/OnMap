import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  randomUUID,
} from 'node:crypto';

import {
  PrismaService,
} from '../database/prisma.service';

import {
  CreateRoadEventDto,
} from './dto/create-road-event.dto';

import {
  FeedbackRoadEventDto,
} from './dto/feedback-road-event.dto';

import {
  ListRoadEventsQueryDto,
} from './dto/list-road-events-query.dto';

import {
  ROAD_EVENT_TITLE_BY_TYPE,
  ROAD_EVENT_TTL_MINUTES,
  RoadEventFeedbackAction,
  RoadEventStatus,
} from './road-events.constants';

import {
  RoadEventDbRow,
  RoadEventRealtimePayload,
  RoadEventResponse,
} from './road-events.types';

import {
  RoadEventsGateway,
} from './realtime/road-events.gateway';

interface FeedbackActionRow {
  action:
    RoadEventFeedbackAction;
}

@Injectable()
export class RoadEventsService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly gateway:
      RoadEventsGateway,
  ) {}

  async list(
    query:
      ListRoadEventsQueryDto,
  ): Promise<
    RoadEventResponse[]
  > {
    this.validateBounds(
      query,
    );

    await this.refreshStatuses(
      query.cityId,
    );

    const rows =
      await this.prisma
        .$queryRaw<
          RoadEventDbRow[]
        >`
          SELECT
            event.id::text AS "id",
            event.city_id AS "cityId",
            event.type::text AS "type",
            event.status::text AS "status",
            event.title,
            event.description,
            event.longitude,
            event.latitude,
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
                  ${query.installationId}
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
                ${query.installationId}

          WHERE
            event.city_id =
              ${query.cityId}

            AND event.status <>
              'RESOLVED'::"RoadEventStatus"

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

    return rows.map(
      row =>
        this.toResponse(
          row,
        ),
    );
  }

  async create(
    dto:
      CreateRoadEventDto,
  ): Promise<RoadEventResponse> {
    const [
      longitude,
      latitude,
    ] = dto.coordinate;

    this.validateCoordinate(
      longitude,
      latitude,
    );

    const id =
      randomUUID();

    const now =
      new Date();

    const ttlMinutes =
      ROAD_EVENT_TTL_MINUTES[
        dto.type
      ];

    const expiresAt =
      new Date(
        now.getTime() +
          ttlMinutes *
            60_000,
      );

    const title =
      dto.title?.trim() ||
      ROAD_EVENT_TITLE_BY_TYPE[
        dto.type
      ];

    const confidence =
      this.calculateConfidence(
        1,
        0,
      );

    const rows =
      await this.prisma
        .$queryRaw<
          RoadEventDbRow[]
        >`
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
            ${dto.installationId},
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

    const row =
      rows[0];

    if (!row) {
      throw new Error(
        'Failed to create road event',
      );
    }

    const event:
      RoadEventResponse = {
      ...this.toResponse(
        row,
      ),

      viewerRelation:
        'CREATOR',
    };

    this.gateway.broadcastCreated(
      this.toRealtimePayload(
        event,
      ),
    );

    return event;
  }

  async feedback(
    eventId: string,

    dto:
      FeedbackRoadEventDto,
  ): Promise<RoadEventResponse> {
    const updated =
      await this.prisma.$transaction(
        async transaction => {
          const rows =
            await transaction
              .$queryRaw<
                RoadEventDbRow[]
              >`
                SELECT
                  id::text AS "id",
                  city_id AS "cityId",
                  type::text AS "type",
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
                FOR UPDATE
              `;

          const current =
            rows[0];

          if (!current) {
            throw new NotFoundException(
              'Road event not found',
            );
          }

          if (
            current
              .createdByInstallationId ===
            dto.installationId
          ) {
            throw new ConflictException({
              message:
                'Creator cannot vote for own event',

              viewerRelation:
                'CREATOR',
            });
          }

          const now =
            new Date();

          const currentExpiresAt =
            new Date(
              current.expiresAt,
            );

          if (
            current.status ===
              'RESOLVED' ||
            currentExpiresAt.getTime() <=
              now.getTime()
          ) {
            throw new GoneException(
              'Road event no longer accepts feedback',
            );
          }

          const feedbackId =
            randomUUID();

          const insertedFeedback =
            await transaction
              .$queryRaw<
                FeedbackActionRow[]
              >`
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
                  ${dto.installationId},
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

          if (
            insertedFeedback.length ===
            0
          ) {
            const existing =
              await transaction
                .$queryRaw<
                  FeedbackActionRow[]
                >`
                  SELECT
                    action::text
                      AS "action"
                  FROM road_event_feedback
                  WHERE
                    road_event_id =
                      ${eventId}::uuid
                    AND installation_id =
                      ${dto.installationId}
                  LIMIT 1
                `;

            throw new ConflictException({
              message:
                'Feedback already submitted',

              existingAction:
                existing[0]
                  ?.action ??
                null,
            });
          }

          const confirmationCount =
            current.confirmationCount +
            (dto.action ===
            'CONFIRM'
              ? 1
              : 0);

          const rejectionCount =
            current.rejectionCount +
            (dto.action ===
            'REJECT'
              ? 1
              : 0);

          const confidence =
            this.calculateConfidence(
              confirmationCount,
              rejectionCount,
            );

          const expiresAt =
            dto.action ===
            'CONFIRM'
              ? new Date(
                  now.getTime() +
                    ROAD_EVENT_TTL_MINUTES[
                      current.type
                    ] *
                      60_000,
                )
              : currentExpiresAt;

          const lastConfirmedAt =
            dto.action ===
            'CONFIRM'
              ? now
              : current.lastConfirmedAt
                ? new Date(
                    current.lastConfirmedAt,
                  )
                : null;

          const status =
            this.deriveStatus(
              current.status,

              dto.action,

              confirmationCount,

              rejectionCount,

              confidence,
            );

          const result =
            await transaction
              .$queryRaw<
                RoadEventDbRow[]
              >`
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
        },
      );

    if (!updated) {
      throw new Error(
        'Failed to update road event',
      );
    }

    const event:
      RoadEventResponse = {
      ...this.toResponse(
        updated,
      ),

      viewerRelation:
        dto.action,
    };

    if (
      event.status ===
      'RESOLVED'
    ) {
      this.gateway.broadcastResolved({
        id:
          event.id,

        cityId:
          event.cityId,

        resolvedAt:
          new Date().toISOString(),
      });
    } else {
      this.gateway.broadcastUpdated(
        this.toRealtimePayload(
          event,
        ),
      );
    }

    return event;
  }

  private async refreshStatuses(
    cityId: string,
  ) {
    await this.prisma
      .$executeRaw`
        UPDATE road_events
        SET
          status =
            'RESOLVED'::"RoadEventStatus",
          updated_at =
            NOW()
        WHERE
          city_id =
            ${cityId}

          AND status <>
            'RESOLVED'::"RoadEventStatus"

          AND expires_at <=
            NOW()
      `;

    await this.prisma
      .$executeRaw`
        UPDATE road_events
        SET
          status =
            'STALE'::"RoadEventStatus",
          updated_at =
            NOW()
        WHERE
          city_id =
            ${cityId}

          AND status IN (
            'ACTIVE'::"RoadEventStatus",
            'UNCONFIRMED'::"RoadEventStatus"
          )

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
                THEN INTERVAL '66 minutes'

              WHEN
                'ROAD_CLOSURE'::"RoadEventType"
                THEN INTERVAL '198 minutes'

              WHEN
                'ROADWORKS'::"RoadEventType"
                THEN INTERVAL '396 minutes'

              WHEN
                'TRAFFIC'::"RoadEventType"
                THEN INTERVAL '25 minutes'

              WHEN
                'ROAD_HAZARD'::"RoadEventType"
                THEN INTERVAL '99 minutes'

              WHEN
                'TRAFFIC_LIGHT'::"RoadEventType"
                THEN INTERVAL '66 minutes'

              WHEN
                'ROAD_SERVICE'::"RoadEventType"
                THEN INTERVAL '33 minutes'

              WHEN
                'ROAD_PATROL'::"RoadEventType"
                THEN INTERVAL '25 minutes'

              ELSE
                INTERVAL '50 minutes'
            END
      `;
  }

  private calculateConfidence(
    confirmations: number,

    rejections: number,
  ) {
    const value =
      (confirmations + 1) /
      (
        confirmations +
        rejections +
        2
      );

    return Math.min(
      0.95,

      Math.max(
        0.05,
        value,
      ),
    );
  }

  private deriveStatus(
    currentStatus:
      RoadEventStatus,

    action:
      RoadEventFeedbackAction,

    confirmationCount: number,

    rejectionCount: number,

    confidence: number,
  ): RoadEventStatus {
    if (
      rejectionCount >= 3 &&
      confidence <= 0.35
    ) {
      return 'RESOLVED';
    }

    if (
      rejectionCount >= 2 &&
      confidence < 0.5
    ) {
      return 'STALE';
    }

    if (
      confirmationCount >= 2 &&
      confidence >= 0.6
    ) {
      return 'ACTIVE';
    }

    if (
      currentStatus ===
        'STALE' &&
      action === 'REJECT'
    ) {
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
      throw new BadRequestException(
        'Invalid coordinate',
      );
    }
  }

  private validateBounds(
    query:
      ListRoadEventsQueryDto,
  ) {
    if (
      query.west >=
      query.east
    ) {
      throw new BadRequestException(
        'west must be less than east',
      );
    }

    if (
      query.south >=
      query.north
    ) {
      throw new BadRequestException(
        'south must be less than north',
      );
    }
  }

  private toResponse(
    row:
      RoadEventDbRow,
  ): RoadEventResponse {
    const response:
      RoadEventResponse = {
      id:
        row.id,

      cityId:
        row.cityId,

      type:
        row.type,

      status:
        row.status,

      title:
        row.title,

      ...(row.description
        ? {
            description:
              row.description,
          }
        : {}),

      coordinate: [
        Number(
          row.longitude,
        ),

        Number(
          row.latitude,
        ),
      ],

      confirmationCount:
        Number(
          row.confirmationCount,
        ),

      rejectionCount:
        Number(
          row.rejectionCount,
        ),

      ...(row.lastConfirmedAt
        ? {
            lastConfirmedAt:
              new Date(
                row.lastConfirmedAt,
              ).toISOString(),
          }
        : {}),

      confidence:
        Number(
          row.confidence,
        ),

      createdAt:
        new Date(
          row.createdAt,
        ).toISOString(),

      expiresAt:
        new Date(
          row.expiresAt,
        ).toISOString(),
    };

    if (
      row.viewerRelation !==
      undefined
    ) {
      response.viewerRelation =
        row.viewerRelation ??
        null;
    }

    return response;
  }

  private toRealtimePayload(
    event:
      RoadEventResponse,
  ): RoadEventRealtimePayload {
    const {
      viewerRelation:
        _viewerRelation,

      ...payload
    } = event;

    return payload;
  }
}