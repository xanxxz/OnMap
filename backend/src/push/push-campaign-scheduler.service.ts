import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { queueCampaignRunPush } from './push-queue';
import { PUSH_CAMPAIGN_LATE_GRACE_MS } from './push-policy';
import { isNewsHourInZone, nextRecurringRun } from './push-campaign-time';

const TICK_MS = 5_000;

@Injectable()
export class PushCampaignSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PushCampaignSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('PUSH_ENQUEUE_ENABLED') !== 'true') return;
    this.timer = setInterval(() => this.tick().catch(() => undefined), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processDueOnce();
    } catch (error) {
      this.logger.warn(
        `Push campaign scheduling failed category=${error instanceof Error ? error.name : 'UNKNOWN'}`,
      );
    } finally {
      this.running = false;
    }
  }

  async processDueOnce(now = new Date()): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        // The row lock serializes a run across backend instances. The run's
        // unique (campaign, scheduled_at) key is an additional crash barrier.
        const due = await tx.$queryRaw<
          readonly { campaignId: string; cityId: string }[]
        >`
        SELECT s.campaign_id::text AS "campaignId", s.city_id AS "cityId"
        FROM push_campaign_city_schedules s
        JOIN push_campaigns c ON c.id = s.campaign_id
        WHERE c.status = 'ACTIVE'::"PushCampaignStatus"
          AND s.next_run_at <= ${now}
        ORDER BY s.next_run_at, s.campaign_id, s.city_id
        FOR UPDATE OF s SKIP LOCKED
        LIMIT 1
      `;
        if (!due[0]) return false;
        const campaign = await tx.pushCampaign.findUnique({
          where: { id: due[0].campaignId },
        });
        const schedule = await tx.pushCampaignCitySchedule.findUnique({
          where: {
            campaignId_cityId: {
              campaignId: due[0].campaignId,
              cityId: due[0].cityId,
            },
          },
        });
        if (!campaign || !schedule?.nextRunAt || campaign.status !== 'ACTIVE')
          return true;
        const scheduledAt = schedule.nextRunAt;
        const recurrenceKind =
          campaign.scheduleKind === 'DAILY' ||
          campaign.scheduleKind === 'WEEKLY'
            ? campaign.scheduleKind
            : null;
        const nextRunAt =
          recurrenceKind && campaign.localTime && schedule.endsAt
            ? nextRecurringRun(
                recurrenceKind,
                campaign.localTime,
                campaign.weekday,
                now,
                schedule.endsAt,
                schedule.timeZone,
              )
            : null;
        const cityId = schedule.cityId;
        let eligible =
          now.getTime() - scheduledAt.getTime() <=
            PUSH_CAMPAIGN_LATE_GRACE_MS &&
          isNewsHourInZone(now, schedule.timeZone);
        if (campaign.kind === 'PARTNER_POINT') {
          const point = campaign.partnerPointId
            ? await tx.partnerPoint.findUnique({
                where: { id: campaign.partnerPointId },
              })
            : null;
          eligible =
            eligible &&
            Boolean(
              point &&
              point.cityId === cityId &&
              point.status === 'ACTIVE' &&
              point.startsAt <= now &&
              point.endsAt > now &&
              point.longitude !== null &&
              point.latitude !== null,
            );
        }
        const run = await tx.pushCampaignRun.create({
          data: {
            campaignId: campaign.id,
            cityId,
            scheduledAt,
            status: eligible ? 'QUEUED' : 'SKIPPED',
          },
        });
        if (eligible) {
          const audienceCount = await queueCampaignRunPush(tx, {
            id: run.id,
            campaignId: campaign.id,
            kind: campaign.kind,
            targetId: campaign.partnerPointId ?? campaign.id,
            cityIds: [cityId],
          });
          await tx.pushCampaignRun.update({
            where: { id: run.id },
            data: { audienceCount },
          });
        }
        await tx.pushCampaignCitySchedule.update({
          where: { campaignId_cityId: { campaignId: campaign.id, cityId } },
          data: { nextRunAt },
        });
        const remaining = await tx.pushCampaignCitySchedule.aggregate({
          where: { campaignId: campaign.id, nextRunAt: { not: null } },
          _min: { nextRunAt: true },
        });
        await tx.pushCampaign.update({
          where: { id: campaign.id },
          data: {
            nextRunAt: remaining._min.nextRunAt,
            status: remaining._min.nextRunAt ? 'ACTIVE' : 'COMPLETED',
          },
        });
        return true;
      },
      { timeout: 30_000 },
    );
  }
}
