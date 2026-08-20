"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoadEventsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../database/prisma.service");
const road_events_constants_1 = require("./road-events.constants");
const road_events_gateway_1 = require("./realtime/road-events.gateway");
let RoadEventsService = class RoadEventsService {
    prisma;
    gateway;
    constructor(prisma, gateway) {
        this.prisma = prisma;
        this.gateway = gateway;
    }
    async list(query) {
        this.validateBounds(query);
        await this.refreshStatuses(query.cityId);
        const rows = await this.prisma
            .$queryRaw `
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
        return rows.map(row => this.toResponse(row));
    }
    async create(dto) {
        const [longitude, latitude,] = dto.coordinate;
        this.validateCoordinate(longitude, latitude);
        const id = (0, node_crypto_1.randomUUID)();
        const now = new Date();
        const ttlMinutes = road_events_constants_1.ROAD_EVENT_TTL_MINUTES[dto.type];
        const expiresAt = new Date(now.getTime() +
            ttlMinutes *
                60_000);
        const title = dto.title?.trim() ||
            road_events_constants_1.ROAD_EVENT_TITLE_BY_TYPE[dto.type];
        const confidence = this.calculateConfidence(1, 0);
        const rows = await this.prisma
            .$queryRaw `
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
        const row = rows[0];
        if (!row) {
            throw new Error('Failed to create road event');
        }
        const event = {
            ...this.toResponse(row),
            viewerRelation: 'CREATOR',
        };
        this.gateway.broadcastCreated(this.toRealtimePayload(event));
        return event;
    }
    async feedback(eventId, dto) {
        const updated = await this.prisma.$transaction(async (transaction) => {
            const rows = await transaction
                .$queryRaw `
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
            const current = rows[0];
            if (!current) {
                throw new common_1.NotFoundException('Road event not found');
            }
            if (current
                .createdByInstallationId ===
                dto.installationId) {
                throw new common_1.ConflictException({
                    message: 'Creator cannot vote for own event',
                    viewerRelation: 'CREATOR',
                });
            }
            const now = new Date();
            const currentExpiresAt = new Date(current.expiresAt);
            if (current.status ===
                'RESOLVED' ||
                currentExpiresAt.getTime() <=
                    now.getTime()) {
                throw new common_1.GoneException('Road event no longer accepts feedback');
            }
            const feedbackId = (0, node_crypto_1.randomUUID)();
            const insertedFeedback = await transaction
                .$queryRaw `
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
            if (insertedFeedback.length ===
                0) {
                const existing = await transaction
                    .$queryRaw `
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
                throw new common_1.ConflictException({
                    message: 'Feedback already submitted',
                    existingAction: existing[0]
                        ?.action ??
                        null,
                });
            }
            const confirmationCount = current.confirmationCount +
                (dto.action ===
                    'CONFIRM'
                    ? 1
                    : 0);
            const rejectionCount = current.rejectionCount +
                (dto.action ===
                    'REJECT'
                    ? 1
                    : 0);
            const confidence = this.calculateConfidence(confirmationCount, rejectionCount);
            const expiresAt = dto.action ===
                'CONFIRM'
                ? new Date(now.getTime() +
                    road_events_constants_1.ROAD_EVENT_TTL_MINUTES[current.type] *
                        60_000)
                : currentExpiresAt;
            const lastConfirmedAt = dto.action ===
                'CONFIRM'
                ? now
                : current.lastConfirmedAt
                    ? new Date(current.lastConfirmedAt)
                    : null;
            const status = this.deriveStatus(current.status, dto.action, confirmationCount, rejectionCount, confidence);
            const result = await transaction
                .$queryRaw `
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
        });
        if (!updated) {
            throw new Error('Failed to update road event');
        }
        const event = {
            ...this.toResponse(updated),
            viewerRelation: dto.action,
        };
        if (event.status ===
            'RESOLVED') {
            this.gateway.broadcastResolved({
                id: event.id,
                cityId: event.cityId,
                resolvedAt: new Date().toISOString(),
            });
        }
        else {
            this.gateway.broadcastUpdated(this.toRealtimePayload(event));
        }
        return event;
    }
    async refreshStatuses(cityId) {
        await this.prisma
            .$executeRaw `
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
            .$executeRaw `
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
    calculateConfidence(confirmations, rejections) {
        const value = (confirmations + 1) /
            (confirmations +
                rejections +
                2);
        return Math.min(0.95, Math.max(0.05, value));
    }
    deriveStatus(currentStatus, action, confirmationCount, rejectionCount, confidence) {
        if (rejectionCount >= 3 &&
            confidence <= 0.35) {
            return 'RESOLVED';
        }
        if (rejectionCount >= 2 &&
            confidence < 0.5) {
            return 'STALE';
        }
        if (confirmationCount >= 2 &&
            confidence >= 0.6) {
            return 'ACTIVE';
        }
        if (currentStatus ===
            'STALE' &&
            action === 'REJECT') {
            return 'STALE';
        }
        return 'UNCONFIRMED';
    }
    validateCoordinate(longitude, latitude) {
        if (longitude < -180 ||
            longitude > 180 ||
            latitude < -90 ||
            latitude > 90) {
            throw new common_1.BadRequestException('Invalid coordinate');
        }
    }
    validateBounds(query) {
        if (query.west >=
            query.east) {
            throw new common_1.BadRequestException('west must be less than east');
        }
        if (query.south >=
            query.north) {
            throw new common_1.BadRequestException('south must be less than north');
        }
    }
    toResponse(row) {
        const response = {
            id: row.id,
            cityId: row.cityId,
            type: row.type,
            status: row.status,
            title: row.title,
            ...(row.description
                ? {
                    description: row.description,
                }
                : {}),
            coordinate: [
                Number(row.longitude),
                Number(row.latitude),
            ],
            confirmationCount: Number(row.confirmationCount),
            rejectionCount: Number(row.rejectionCount),
            ...(row.lastConfirmedAt
                ? {
                    lastConfirmedAt: new Date(row.lastConfirmedAt).toISOString(),
                }
                : {}),
            confidence: Number(row.confidence),
            createdAt: new Date(row.createdAt).toISOString(),
            expiresAt: new Date(row.expiresAt).toISOString(),
        };
        if (row.viewerRelation !==
            undefined) {
            response.viewerRelation =
                row.viewerRelation ??
                    null;
        }
        return response;
    }
    toRealtimePayload(event) {
        const { viewerRelation: _viewerRelation, ...payload } = event;
        return payload;
    }
};
exports.RoadEventsService = RoadEventsService;
exports.RoadEventsService = RoadEventsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        road_events_gateway_1.RoadEventsGateway])
], RoadEventsService);
//# sourceMappingURL=road-events.service.js.map