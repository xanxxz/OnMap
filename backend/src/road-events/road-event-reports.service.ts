import {
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { RoadEventsGateway } from './realtime/road-events.gateway';
import type { RoadEventReportReason } from './dto/report-road-event.dto';
import type { RoadEventModerationNotice } from './road-events.types';

export const ROAD_EVENT_REPORT_POLICY = {
  hideAtUniqueReports: 10,
  maxReportsPerActorPerHour: 5,
} as const;

interface ReportEventRow {
  id: string;
  cityId: string;
  type: string;
  status: string;
  expiresAt: Date | string;
  createdByActorId: string | null;
}

interface ReportOutcome {
  duplicate: boolean;
  hidden: boolean;
  id: string;
  cityId: string;
  hiddenAt: Date | null;
}

@Injectable()
export class RoadEventReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RoadEventsGateway,
  ) {}

  async report(
    eventId: string,
    actorId: string,
    reason: RoadEventReportReason,
  ): Promise<{ accepted: true; duplicate: boolean; hidden: boolean }> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`event-report:${actorId}`}))
      `;

      const events = await tx.$queryRaw<ReportEventRow[]>`
        SELECT
          id::text AS id,
          city_id AS "cityId",
          type::text AS type,
          status::text AS status,
          expires_at AS "expiresAt",
          created_by_installation_id AS "createdByActorId"
        FROM road_events
        WHERE id = ${eventId}::uuid
        FOR UPDATE
      `;
      const event = events[0];
      if (!event) throw new NotFoundException('Road event not found');
      if (event.createdByActorId === actorId) {
        throw new ConflictException('Creators cannot report their own event');
      }

      const existing = await tx.$queryRaw<readonly { id: string }[]>`
        SELECT id::text AS id
        FROM road_event_reports
        WHERE road_event_id = ${eventId}::uuid
          AND reporter_actor_id = ${actorId}
        LIMIT 1
      `;
      if (existing.length > 0) {
        return {
          duplicate: true,
          hidden: false,
          id: event.id,
          cityId: event.cityId,
          hiddenAt: null,
        } satisfies ReportOutcome;
      }

      if (
        event.status === 'RESOLVED' ||
        event.status === 'HIDDEN_PENDING_REVIEW' ||
        new Date(event.expiresAt).getTime() <= Date.now()
      ) {
        throw new GoneException('Road event is not available for reports');
      }

      const recent = await tx.$queryRaw<readonly { count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM road_event_reports
        WHERE reporter_actor_id = ${actorId}
          AND created_at > NOW() - INTERVAL '1 hour'
      `;
      if (
        Number(recent[0]?.count ?? 0) >=
        ROAD_EVENT_REPORT_POLICY.maxReportsPerActorPerHour
      ) {
        throw new HttpException(
          'Road event report rate limit exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await tx.$executeRaw`
        INSERT INTO road_event_reports (id, road_event_id, reporter_actor_id, reason)
        VALUES (${randomUUID()}::uuid, ${eventId}::uuid, ${actorId}, ${reason})
        ON CONFLICT (road_event_id, reporter_actor_id) DO NOTHING
      `;

      const totals = await tx.$queryRaw<readonly { count: number }[]>`
        SELECT COUNT(DISTINCT report.reporter_actor_id)::int AS count
        FROM road_event_reports report
        LEFT JOIN actor_restrictions restriction
          ON restriction.actor_id = report.reporter_actor_id
          AND restriction.blocked_until > NOW()
        WHERE report.road_event_id = ${eventId}::uuid
          AND restriction.actor_id IS NULL
      `;
      const total = Number(totals[0]?.count ?? 0);
      if (total < ROAD_EVENT_REPORT_POLICY.hideAtUniqueReports) {
        return {
          duplicate: false,
          hidden: false,
          id: event.id,
          cityId: event.cityId,
          hiddenAt: null,
        } satisfies ReportOutcome;
      }

      const hiddenAt = new Date();
      const hidden = await tx.$queryRaw<readonly { id: string }[]>`
        UPDATE road_events
        SET status = 'HIDDEN_PENDING_REVIEW'::"RoadEventStatus",
            status_before_moderation = ${event.status}::"RoadEventStatus",
            hidden_at = ${hiddenAt},
            updated_at = ${hiddenAt}
        WHERE id = ${eventId}::uuid
          AND status IN (
            'ACTIVE'::"RoadEventStatus",
            'UNCONFIRMED'::"RoadEventStatus",
            'STALE'::"RoadEventStatus"
          )
          AND expires_at > ${hiddenAt}
        RETURNING id::text AS id
      `;
      if (hidden.length === 0) {
        return {
          duplicate: false,
          hidden: false,
          id: event.id,
          cityId: event.cityId,
          hiddenAt: null,
        } satisfies ReportOutcome;
      }

      await tx.$executeRaw`
        INSERT INTO road_event_moderation_cases (road_event_id)
        VALUES (${eventId}::uuid)
        ON CONFLICT (road_event_id) DO NOTHING
      `;
      if (event.createdByActorId) {
        await tx.$executeRaw`
          INSERT INTO road_event_author_notices (id, road_event_id, actor_id)
          VALUES (${randomUUID()}::uuid, ${eventId}::uuid, ${event.createdByActorId})
          ON CONFLICT (road_event_id, actor_id) DO NOTHING
        `;
      }
      await tx.$executeRaw`
        INSERT INTO telegram_moderation_outbox (id, road_event_id)
        VALUES (${randomUUID()}::uuid, ${eventId}::uuid)
        ON CONFLICT (road_event_id) DO NOTHING
      `;

      return {
        duplicate: false,
        hidden: true,
        id: event.id,
        cityId: event.cityId,
        hiddenAt,
      } satisfies ReportOutcome;
    });

    if (outcome.hidden && outcome.hiddenAt) {
      this.gateway.broadcastHidden({
        id: outcome.id,
        cityId: outcome.cityId,
        hiddenAt: outcome.hiddenAt.toISOString(),
      });
    }

    return {
      accepted: true,
      duplicate: outcome.duplicate,
      hidden: outcome.hidden,
    };
  }

  async getAuthorNotices(
    actorId: string,
  ): Promise<RoadEventModerationNotice[]> {
    return this.prisma.$queryRaw<RoadEventModerationNotice[]>`
      SELECT
        notice.id::text AS id,
        event.id::text AS "eventId",
        event.type::text AS type,
        notice.created_at AS "createdAt",
        moderation.state AS "moderationState",
        event.status::text AS "eventStatus"
      FROM road_event_author_notices notice
      INNER JOIN road_events event ON event.id = notice.road_event_id
      LEFT JOIN road_event_moderation_cases moderation ON moderation.road_event_id = event.id
      WHERE notice.actor_id = ${actorId}
        AND notice.acknowledged_at IS NULL
      ORDER BY notice.created_at DESC
      LIMIT 20
    `;
  }

  async acknowledgeAuthorNotice(
    noticeId: string,
    actorId: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE road_event_author_notices
      SET acknowledged_at = COALESCE(acknowledged_at, NOW())
      WHERE id = ${noticeId}::uuid
        AND actor_id = ${actorId}
    `;
  }
}
