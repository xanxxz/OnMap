import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { Prisma } from '../../../generated/prisma/client';
import {
  getCityConfig,
  isCoordinateInsideCityCoverage,
} from '../../../cities/city.registry';
import { PrismaService } from '../../../database/prisma.service';
import {
  ROAD_EVENT_DEDUPLICATION,
  ROAD_EVENT_TITLE_BY_TYPE,
  ROAD_PATROL_LIFECYCLE,
  TELEGRAM_EVENT_TTL_MS,
} from '../../../road-events/road-events.constants';
import type { RoadEventType } from '../../../road-events/road-events.constants';
import type { NormalizedTelegramEvent } from '../ingestion/telegram-ingestion.types';
import { isMorePreciseLocation } from '../location-resolver/telegram-location-precision';
import type { TelegramLocationPrecision } from '../location-resolver/telegram-location-precision';

import {
  TELEGRAM_PERSISTENCE_TARGET_MATCH_WINDOW_MS,
  TELEGRAM_TO_ROAD_EVENT_TYPE,
} from './telegram-ingestion-persistence.constants';
import type {
  TelegramAppliedMessageRow,
  TelegramPersistenceCandidate,
  TelegramPersistenceResult,
  TelegramPersistenceTarget,
  TelegramRoadEventInsertRow,
} from './telegram-ingestion-persistence.types';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class TelegramIngestionPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(
    event: NormalizedTelegramEvent,
  ): Promise<TelegramPersistenceResult> {
    if (!['CREATE', 'UPDATE', 'RESOLVE'].includes(event.decision)) {
      return { status: 'NOOP', reason: 'UNSUPPORTED_DECISION' };
    }

    const type = TELEGRAM_TO_ROAD_EVENT_TYPE[event.eventType];

    if (type === undefined) {
      return { status: 'NOOP', reason: 'UNSUPPORTED_EVENT_TYPE' };
    }

    const candidate = this.toCandidate(event, type);

    if (candidate === null) {
      return {
        status: 'NOOP',
        reason: this.hasValidTimestamp(event.timestamp)
          ? 'INVALID_COORDINATES'
          : 'INVALID_TIMESTAMP',
      };
    }

    try {
      return await this.prisma.$transaction((transaction) =>
        this.applyInTransaction(transaction, event, candidate),
      );
    } catch (error) {
      const applied = await this.findAppliedMessage(this.prisma, event);

      if (applied !== null) {
        return {
          status: 'NOOP',
          reason: 'ALREADY_APPLIED',
          ...(applied.roadEventId === null
            ? {}
            : { roadEventId: applied.roadEventId }),
        };
      }

      throw error;
    }
  }

  private async applyInTransaction(
    transaction: TransactionClient,
    event: NormalizedTelegramEvent,
    candidate: TelegramPersistenceCandidate,
  ): Promise<TelegramPersistenceResult> {
    const applied = await this.findAppliedMessage(transaction, event);

    if (applied !== null) {
      if (this.isNewerMessageVersion(event, applied)) {
        return this.applyEditedVersion(transaction, event, applied, candidate);
      }

      return {
        status: 'NOOP',
        reason: 'ALREADY_APPLIED',
        ...(applied.roadEventId === null
          ? {}
          : { roadEventId: applied.roadEventId }),
      };
    }

    if (event.decision === 'CREATE') {
      return this.create(transaction, event, candidate);
    }

    return this.updateOrResolve(transaction, event, candidate);
  }

  private async applyEditedVersion(
    transaction: TransactionClient,
    event: NormalizedTelegramEvent,
    applied: TelegramAppliedMessageRow,
    candidate: TelegramPersistenceCandidate,
  ): Promise<TelegramPersistenceResult> {
    if (applied.roadEventId === null) {
      return { status: 'NOOP', reason: 'ALREADY_APPLIED' };
    }

    const effectiveDecision =
      event.decision === 'CREATE' ? 'UPDATE' : event.decision;
    const versionTimestamp = new Date(event.messageVersion ?? event.timestamp);

    if (effectiveDecision === 'RESOLVE') {
      const rows = await transaction.$queryRaw<TelegramRoadEventInsertRow[]>`
        UPDATE road_events
        SET
          status = 'RESOLVED'::"RoadEventStatus",
          resolved_at = ${versionTimestamp},
          updated_at = NOW()
        WHERE
          id = ${applied.roadEventId}::uuid
          AND source = 'TELEGRAM'::"RoadEventSource"
          AND status = 'ACTIVE'::"RoadEventStatus"
        RETURNING id::text AS "id"
      `;

      if (rows[0] === undefined) {
        return { status: 'NOOP', reason: 'TARGET_NOT_FOUND' };
      }

      await this.updateMessageMapping(
        transaction,
        event,
        applied.roadEventId,
        effectiveDecision,
        'RESOLVED',
      );

      return { status: 'RESOLVED', roadEventId: applied.roadEventId };
    }

    const expiresAt = this.getTelegramExpiresAt(
      candidate.type,
      versionTimestamp,
      applied.createdAt == null
        ? versionTimestamp
        : new Date(applied.createdAt),
    );
    const rows = await this.updateActiveEvent(
      transaction,
      applied.roadEventId,
      candidate,
      expiresAt,
      applied.locationPrecision,
      true,
    );

    if (rows[0] === undefined) {
      return { status: 'NOOP', reason: 'TARGET_NOT_FOUND' };
    }

    await this.updateMessageMapping(
      transaction,
      event,
      applied.roadEventId,
      'UPDATE',
      'UPDATED',
    );

    return { status: 'UPDATED', roadEventId: applied.roadEventId };
  }

  private async create(
    transaction: TransactionClient,
    event: NormalizedTelegramEvent,
    candidate: TelegramPersistenceCandidate,
  ): Promise<TelegramPersistenceResult> {
    const duplicate = await this.findActiveTargets(
      transaction,
      event,
      candidate,
      candidate.type === 'ROAD_PATROL'
        ? ROAD_PATROL_LIFECYCLE.maxLifetimeMs
        : ROAD_EVENT_DEDUPLICATION.windowMs,
    );

    if (duplicate.length > 0) {
      const roadEventId = duplicate[0].id;

      if (candidate.type === 'ROAD_PATROL') {
        const expiresAt = this.getTelegramExpiresAt(
          candidate.type,
          new Date(event.messageVersion ?? event.timestamp),
          new Date(duplicate[0].createdAt),
        );
        await this.updateActiveEvent(
          transaction,
          roadEventId,
          candidate,
          expiresAt,
          duplicate[0].locationPrecision,
          false,
        );
        await this.insertMessageMapping(
          transaction,
          event,
          roadEventId,
          'UPDATED',
        );

        return { status: 'UPDATED', roadEventId };
      }

      await this.insertMessageMapping(
        transaction,
        event,
        roadEventId,
        'DUPLICATE_ACTIVE_EVENT',
      );

      return {
        status: 'NOOP',
        reason: 'DUPLICATE_ACTIVE_EVENT',
        roadEventId,
      };
    }

    const sourceTimestamp = new Date(event.messageVersion ?? event.timestamp);
    const expiresAt = this.getTelegramExpiresAt(
      candidate.type,
      sourceTimestamp,
    );
    const id = randomUUID();
    const geometryJson = JSON.stringify(candidate.geometry);
    const rows = await transaction.$queryRaw<TelegramRoadEventInsertRow[]>`
      WITH candidate_geometry AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326) AS value
      )
      INSERT INTO road_events (
        id,
        city_id,
        type,
        status,
        source,
        title,
        description,
        longitude,
        latitude,
        location,
        location_precision,
        location_label,
        source_text,
        created_by_installation_id,
        confirmation_count,
        rejection_count,
        last_confirmed_at,
        confidence,
        created_at,
        updated_at,
        expires_at
      )
      SELECT
        ${id}::uuid,
        ${candidate.cityId},
        ${candidate.type}::"RoadEventType",
        'ACTIVE'::"RoadEventStatus",
        'TELEGRAM'::"RoadEventSource",
        ${ROAD_EVENT_TITLE_BY_TYPE[candidate.type]},
        NULL,
        ST_X(ST_PointOnSurface(candidate_geometry.value)),
        ST_Y(ST_PointOnSurface(candidate_geometry.value)),
        candidate_geometry.value,
        ${candidate.locationPrecision}::"RoadEventLocationPrecision",
        ${candidate.locationLabel},
        ${candidate.sourceText},
        NULL,
        0,
        0,
        ${candidate.timestamp},
        ${event.parserConfidence},
        ${candidate.timestamp},
        NOW(),
        ${expiresAt}
      FROM candidate_geometry
      RETURNING id::text AS "id"
    `;
    const created = rows[0];

    if (created === undefined) {
      throw new Error('Telegram RoadEvent insert returned no row');
    }

    await this.insertMessageMapping(transaction, event, created.id, 'CREATED');

    return { status: 'CREATED', roadEventId: created.id };
  }

  private async updateOrResolve(
    transaction: TransactionClient,
    event: NormalizedTelegramEvent,
    candidate: TelegramPersistenceCandidate,
  ): Promise<TelegramPersistenceResult> {
    const active = await this.findActiveTargets(
      transaction,
      event,
      candidate,
      TELEGRAM_PERSISTENCE_TARGET_MATCH_WINDOW_MS,
    );

    if (active.length > 1) {
      return {
        status: 'REVIEW',
        reason: 'AMBIGUOUS_TARGET',
        candidateCount: active.length,
      };
    }

    const target = active[0];

    if (target === undefined) {
      const resolved = await this.findResolvedTargets(
        transaction,
        event,
        candidate,
      );

      if (event.decision === 'RESOLVE' && resolved.length === 1) {
        await this.insertMessageMapping(
          transaction,
          event,
          resolved[0].id,
          'ALREADY_RESOLVED',
        );

        return {
          status: 'NOOP',
          reason: 'ALREADY_RESOLVED',
          roadEventId: resolved[0].id,
        };
      }

      if (resolved.length > 1) {
        return {
          status: 'REVIEW',
          reason: 'AMBIGUOUS_TARGET',
          candidateCount: resolved.length,
        };
      }

      return { status: 'NOOP', reason: 'TARGET_NOT_FOUND' };
    }

    if (event.decision === 'UPDATE') {
      const expiresAt = this.getTelegramExpiresAt(
        candidate.type,
        new Date(event.messageVersion ?? event.timestamp),
        new Date(target.createdAt),
      );

      await this.updateActiveEvent(
        transaction,
        target.id,
        candidate,
        expiresAt,
        target.locationPrecision,
        false,
      );
      await this.insertMessageMapping(transaction, event, target.id, 'UPDATED');

      return { status: 'UPDATED', roadEventId: target.id };
    }

    await transaction.$executeRaw`
      UPDATE road_events
      SET
        status = 'RESOLVED'::"RoadEventStatus",
        resolved_at = ${candidate.timestamp},
        updated_at = NOW()
      WHERE
        id = ${target.id}::uuid
        AND source = 'TELEGRAM'::"RoadEventSource"
        AND status = 'ACTIVE'::"RoadEventStatus"
    `;
    await this.insertMessageMapping(transaction, event, target.id, 'RESOLVED');

    return { status: 'RESOLVED', roadEventId: target.id };
  }

  private async findAppliedMessage(
    client: Pick<PrismaService, '$queryRaw'> | TransactionClient,
    event: NormalizedTelegramEvent,
  ): Promise<TelegramAppliedMessageRow | null> {
    const rows = await client.$queryRaw<TelegramAppliedMessageRow[]>`
      SELECT
        mapping.road_event_id::text AS "roadEventId",
        mapping.source_timestamp AS "sourceTimestamp",
        mapping.applied_decision AS "appliedDecision",
        mapping.outcome,
        event.location_precision::text AS "locationPrecision",
        event.created_at AS "createdAt"
      FROM telegram_road_event_messages mapping
      LEFT JOIN road_events event ON event.id = mapping.road_event_id
      WHERE
        mapping.source = 'TELEGRAM'::"RoadEventSource"
        AND mapping.source_chat_id = ${event.sourceChatId}
        AND mapping.external_message_id = ${event.externalId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private async updateActiveEvent(
    transaction: TransactionClient,
    roadEventId: string,
    candidate: TelegramPersistenceCandidate,
    expiresAt: Date,
    currentPrecision: TelegramLocationPrecision | null | undefined,
    updateSourceText: boolean,
  ): Promise<readonly TelegramRoadEventInsertRow[]> {
    const shouldRefine = isMorePreciseLocation(
      candidate.locationPrecision,
      currentPrecision ?? 'EXACT',
    );

    if (shouldRefine) {
      const geometryJson = JSON.stringify(candidate.geometry);

      return transaction.$queryRaw<TelegramRoadEventInsertRow[]>`
        WITH candidate_geometry AS (
          SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326) AS value
        )
        UPDATE road_events event
        SET
          location = candidate_geometry.value,
          longitude = ST_X(ST_PointOnSurface(candidate_geometry.value)),
          latitude = ST_Y(ST_PointOnSurface(candidate_geometry.value)),
          location_precision = ${candidate.locationPrecision}::"RoadEventLocationPrecision",
          location_label = ${candidate.locationLabel},
          source_text = CASE
            WHEN ${updateSourceText} THEN ${candidate.sourceText}
            ELSE event.source_text
          END,
          expires_at = ${expiresAt},
          status = CASE
            WHEN ${candidate.type}::"RoadEventType" = 'ROAD_PATROL'::"RoadEventType"
              THEN 'ACTIVE'::"RoadEventStatus"
            ELSE event.status
          END,
          updated_at = NOW()
        FROM candidate_geometry
        WHERE
          event.id = ${roadEventId}::uuid
          AND event.source = 'TELEGRAM'::"RoadEventSource"
          AND (
            event.status = 'ACTIVE'::"RoadEventStatus"
            OR (
              ${candidate.type}::"RoadEventType" = 'ROAD_PATROL'::"RoadEventType"
              AND event.status = 'STALE'::"RoadEventStatus"
            )
          )
        RETURNING event.id::text AS "id"
      `;
    }

    return transaction.$queryRaw<TelegramRoadEventInsertRow[]>`
      UPDATE road_events
      SET
        source_text = CASE
          WHEN ${updateSourceText} THEN ${candidate.sourceText}
          ELSE source_text
        END,
        expires_at = ${expiresAt},
        status = CASE
          WHEN ${candidate.type}::"RoadEventType" = 'ROAD_PATROL'::"RoadEventType"
            THEN 'ACTIVE'::"RoadEventStatus"
          ELSE status
        END,
        updated_at = NOW()
      WHERE
        id = ${roadEventId}::uuid
        AND source = 'TELEGRAM'::"RoadEventSource"
        AND (
          status = 'ACTIVE'::"RoadEventStatus"
          OR (
            ${candidate.type}::"RoadEventType" = 'ROAD_PATROL'::"RoadEventType"
            AND status = 'STALE'::"RoadEventStatus"
          )
        )
      RETURNING id::text AS "id"
    `;
  }

  private async updateMessageMapping(
    transaction: TransactionClient,
    event: NormalizedTelegramEvent,
    roadEventId: string,
    decision: 'UPDATE' | 'RESOLVE',
    outcome: 'UPDATED' | 'RESOLVED',
  ): Promise<void> {
    await transaction.$executeRaw`
      UPDATE telegram_road_event_messages
      SET
        road_event_id = ${roadEventId}::uuid,
        canonical_location_id = ${event.canonicalLocationId},
        source_timestamp = ${new Date(event.messageVersion ?? event.timestamp)},
        applied_decision = ${decision},
        outcome = ${outcome}
      WHERE
        source = 'TELEGRAM'::"RoadEventSource"
        AND source_chat_id = ${event.sourceChatId}
        AND external_message_id = ${event.externalId}
    `;
  }

  private async findActiveTargets(
    transaction: TransactionClient,
    event: NormalizedTelegramEvent,
    candidate: TelegramPersistenceCandidate,
    windowMs: number,
  ): Promise<readonly TelegramPersistenceTarget[]> {
    if (event.canonicalLocationId !== null) {
      const canonicalMatches = await this.findTargetsByCanonicalLocation(
        transaction,
        event,
        candidate,
        windowMs,
        'ACTIVE',
      );

      if (canonicalMatches.length > 0) {
        return canonicalMatches;
      }
    }

    return this.findTargetsByCoordinates(
      transaction,
      candidate,
      windowMs,
      'ACTIVE',
    );
  }

  private async findResolvedTargets(
    transaction: TransactionClient,
    event: NormalizedTelegramEvent,
    candidate: TelegramPersistenceCandidate,
  ): Promise<readonly TelegramPersistenceTarget[]> {
    if (event.canonicalLocationId !== null) {
      const canonicalMatches = await this.findTargetsByCanonicalLocation(
        transaction,
        event,
        candidate,
        TELEGRAM_PERSISTENCE_TARGET_MATCH_WINDOW_MS,
        'RESOLVED',
      );

      if (canonicalMatches.length > 0) {
        return canonicalMatches;
      }
    }

    return this.findTargetsByCoordinates(
      transaction,
      candidate,
      TELEGRAM_PERSISTENCE_TARGET_MATCH_WINDOW_MS,
      'RESOLVED',
    );
  }

  private async findTargetsByCanonicalLocation(
    transaction: TransactionClient,
    event: NormalizedTelegramEvent,
    candidate: TelegramPersistenceCandidate,
    windowMs: number,
    status: 'ACTIVE' | 'RESOLVED',
  ): Promise<readonly TelegramPersistenceTarget[]> {
    return transaction.$queryRaw<TelegramPersistenceTarget[]>`
      SELECT
        road_event.id::text AS "id",
        road_event.status::text AS "status",
        road_event.location_precision::text AS "locationPrecision",
        road_event.created_at AS "createdAt"
      FROM road_events road_event
      WHERE
        road_event.source = 'TELEGRAM'::"RoadEventSource"
        AND road_event.city_id = ${candidate.cityId}
        AND road_event.type = ${candidate.type}::"RoadEventType"
        AND (
          road_event.status = ${status}::"RoadEventStatus"
          OR (
            ${status}::text = 'ACTIVE'
            AND ${candidate.type}::"RoadEventType" = 'ROAD_PATROL'::"RoadEventType"
            AND road_event.status = 'STALE'::"RoadEventStatus"
          )
        )
        AND road_event.created_at BETWEEN
          ${new Date(candidate.timestamp.getTime() - windowMs)}
          AND ${new Date(candidate.timestamp.getTime() + windowMs)}
        AND EXISTS (
          SELECT 1
          FROM telegram_road_event_messages mapping
          WHERE
            mapping.road_event_id = road_event.id
            AND mapping.source = 'TELEGRAM'::"RoadEventSource"
            AND mapping.canonical_location_id = ${event.canonicalLocationId}
        )
      ORDER BY road_event.created_at DESC
      LIMIT 2
      FOR UPDATE
    `;
  }

  private async findTargetsByCoordinates(
    transaction: TransactionClient,
    candidate: TelegramPersistenceCandidate,
    windowMs: number,
    status: 'ACTIVE' | 'RESOLVED',
  ): Promise<readonly TelegramPersistenceTarget[]> {
    return transaction.$queryRaw<TelegramPersistenceTarget[]>`
      WITH candidate_location AS (
        SELECT ST_SetSRID(
          ST_MakePoint(${candidate.longitude}, ${candidate.latitude}),
          4326
        ) AS location
      )
      SELECT
        road_event.id::text AS "id",
        road_event.status::text AS "status",
        road_event.location_precision::text AS "locationPrecision",
        road_event.created_at AS "createdAt"
      FROM road_events road_event
      CROSS JOIN candidate_location
      WHERE
        road_event.source = 'TELEGRAM'::"RoadEventSource"
        AND road_event.city_id = ${candidate.cityId}
        AND road_event.type = ${candidate.type}::"RoadEventType"
        AND (
          road_event.status = ${status}::"RoadEventStatus"
          OR (
            ${status}::text = 'ACTIVE'
            AND ${candidate.type}::"RoadEventType" = 'ROAD_PATROL'::"RoadEventType"
            AND road_event.status = 'STALE'::"RoadEventStatus"
          )
        )
        AND road_event.created_at BETWEEN
          ${new Date(candidate.timestamp.getTime() - windowMs)}
          AND ${new Date(candidate.timestamp.getTime() + windowMs)}
        AND road_event.location && ST_Expand(
          candidate_location.location,
          ${ROAD_EVENT_DEDUPLICATION.boundingBoxRadiusDegrees}
        )
        AND ST_DWithin(
          road_event.location::geography,
          candidate_location.location::geography,
          ${ROAD_EVENT_DEDUPLICATION.radiusMeters}
        )
      ORDER BY road_event.created_at DESC
      LIMIT 2
      FOR UPDATE
    `;
  }

  private async insertMessageMapping(
    transaction: TransactionClient,
    event: NormalizedTelegramEvent,
    roadEventId: string,
    outcome: string,
  ): Promise<void> {
    await transaction.$executeRaw`
      INSERT INTO telegram_road_event_messages (
        id,
        source,
        source_chat_id,
        external_message_id,
        road_event_id,
        canonical_location_id,
        source_timestamp,
        applied_decision,
        outcome,
        created_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        'TELEGRAM'::"RoadEventSource",
        ${event.sourceChatId},
        ${event.externalId},
        ${roadEventId}::uuid,
        ${event.canonicalLocationId},
        ${new Date(event.messageVersion ?? event.timestamp)},
        ${event.decision},
        ${outcome},
        NOW()
      )
    `;
  }

  private toCandidate(
    event: NormalizedTelegramEvent,
    type: RoadEventType,
  ): TelegramPersistenceCandidate | null {
    const timestamp = new Date(event.timestamp);

    if (!this.hasValidTimestamp(event.timestamp)) {
      return null;
    }

    const { latitude, longitude } = event;

    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    if (event.geometry === null || event.locationPrecision === null) {
      return null;
    }

    const city = getCityConfig(event.cityId);

    if (
      city === undefined ||
      !isCoordinateInsideCityCoverage(city, latitude, longitude)
    ) {
      return null;
    }

    if (!isValidEventGeometry(event.geometry)) {
      return null;
    }

    return {
      cityId: event.cityId,
      type,
      timestamp,
      latitude,
      longitude,
      geometry: event.geometry,
      locationPrecision: event.locationPrecision,
      locationLabel: event.canonicalLocationTitle ?? event.locationInput,
      sourceText: event.sourceText,
    };
  }

  private hasValidTimestamp(timestamp: string): boolean {
    return Number.isFinite(Date.parse(timestamp));
  }

  private getTelegramExpiresAt(
    type: RoadEventType,
    sourceTimestamp: Date,
    createdAt: Date = sourceTimestamp,
  ): Date {
    const ttlMs = TELEGRAM_EVENT_TTL_MS[type];

    if (ttlMs === undefined) {
      throw new Error(`Missing Telegram lifecycle TTL for event type: ${type}`);
    }

    const rollingExpiry = sourceTimestamp.getTime() + ttlMs;

    if (type !== 'ROAD_PATROL') {
      return new Date(rollingExpiry);
    }

    return new Date(
      Math.min(
        rollingExpiry,
        createdAt.getTime() + ROAD_PATROL_LIFECYCLE.maxLifetimeMs,
      ),
    );
  }

  private isNewerMessageVersion(
    event: NormalizedTelegramEvent,
    applied: TelegramAppliedMessageRow,
  ): boolean {
    const currentVersion = Date.parse(event.messageVersion ?? event.timestamp);
    const appliedVersion = new Date(applied.sourceTimestamp).getTime();

    return (
      Number.isFinite(currentVersion) &&
      Number.isFinite(appliedVersion) &&
      currentVersion > appliedVersion
    );
  }
}

const isValidEventGeometry = (
  geometry: NormalizedTelegramEvent['geometry'],
): geometry is NonNullable<NormalizedTelegramEvent['geometry']> => {
  if (geometry === null) return false;

  if (geometry.type === 'Point') {
    return isCoordinate(geometry.coordinates);
  }

  if (geometry.type === 'LineString') {
    return (
      geometry.coordinates.length >= 2 &&
      geometry.coordinates.every(isCoordinate)
    );
  }

  return (
    geometry.coordinates.length > 0 &&
    geometry.coordinates.every(
      (segment) => segment.length >= 2 && segment.every(isCoordinate),
    )
  );
};

const isCoordinate = (coordinate: readonly number[]): boolean =>
  coordinate.length >= 2 &&
  Number.isFinite(coordinate[0]) &&
  Number.isFinite(coordinate[1]) &&
  coordinate[0] >= -180 &&
  coordinate[0] <= 180 &&
  coordinate[1] >= -90 &&
  coordinate[1] <= 90;
