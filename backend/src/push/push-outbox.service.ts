import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import {
  PUSH_PROVIDER,
  type PushProvider,
  type PushMessage,
} from './push-provider';
import {
  PUSH_DEVICE_MIN_INTERVAL_MS,
  PUSH_MAX_ATTEMPTS,
  PUSH_NEWS_MAX_PER_DAY,
  PUSH_ROAD_MAX_PER_HOUR,
  PARTNER_PUSH_MIN_INTERVAL_MS,
  roadPushEligible,
  PARTNER_PUSH_DELIVERY_WINDOW_MS,
  pushRetryDelayMs,
} from './push-policy';
import { isNewsHour, saratovDayStart } from './push-campaign-time';

const LEASE_MS = 120_000;
const TICK_MS = 5_000;
const SAFE_STREET_LABEL = /^(?:ул\.?|улица)\s+[\p{L}\p{N}.\-\s]{2,70}$/iu;

const patrolBody = (label: string | null, precision: string | null): string => {
  const street = label?.trim();
  if (!street || !SAFE_STREET_LABEL.test(street))
    return 'В городе есть подтверждённая отметка. Откройте карту.';
  return precision === 'EXACT'
    ? `Есть подтверждённая отметка на ${street}. Проверьте место на карте.`
    : `Примерное место: ${street}. Проверьте точку на карте.`;
};

@Injectable()
export class PushOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushOutboxService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('PUSH_DELIVERY_ENABLED') !== 'true') return;
    if (!this.provider.ready) {
      throw new Error(
        'PUSH_DELIVERY_ENABLED requires a configured push provider',
      );
    }
    this.timer = setInterval(() => {
      this.tick().catch(() => undefined);
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.processDueOnce();
    } catch (error) {
      // No exception message: providers may embed a token or request URL.
      this.logger.warn(
        `Push outbox tick failed category=${error instanceof Error ? error.name : 'UNKNOWN'}`,
      );
    } finally {
      this.running = false;
    }
  }

  async processDueOnce(now = new Date()): Promise<boolean> {
    if (!this.provider.ready) return false;
    const due = await this.prisma.pushOutbox.findFirst({
      where: {
        OR: [
          { status: { in: ['PENDING', 'RETRY'] }, nextAttemptAt: { lte: now } },
          { status: 'SENDING', leaseUntil: { lt: now } },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      include: { device: true },
    });
    if (!due) return false;
    const claimed = await this.prisma.pushOutbox.updateMany({
      where: { id: due.id, status: due.status, attempts: due.attempts },
      data: {
        status: 'SENDING',
        attempts: { increment: 1 },
        leaseUntil: new Date(now.getTime() + LEASE_MS),
      },
    });
    if (claimed.count !== 1) return true;
    await this.prisma.$transaction(
      async (tx) => {
        // A device-scoped database lock keeps frequency checks correct when
        // several outbox workers claim different rows for the same phone.
        await tx.$queryRaw<readonly { locked: boolean }[]>`
        SELECT pg_advisory_xact_lock(hashtext(${due.deviceId})) IS NULL AS locked
      `;
        const current = await tx.pushOutbox.findUnique({
          where: { id: due.id },
          include: {
            device: true,
            campaignRun: { include: { campaign: true } },
          },
        });
        if (
          !current ||
          current.status !== 'SENDING' ||
          current.attempts !== due.attempts + 1
        )
          return;
        const isRoad = current.kind === 'ROAD_EVENT';
        const allowed =
          current.device.enabled &&
          current.device.cityId === current.cityId &&
          (isRoad
            ? current.device.roadPushEnabled
            : current.device.newsPushEnabled);
        if (
          !allowed ||
          (!isRoad &&
            now.getTime() - current.createdAt.getTime() >
              PARTNER_PUSH_DELIVERY_WINDOW_MS) ||
          (!isRoad && !isNewsHour(now)) ||
          (current.campaignRun &&
            ['PAUSED', 'CANCELLED'].includes(
              current.campaignRun.campaign.status,
            ))
        ) {
          await this.cancel(tx, current.id);
          return;
        }
        const message = await this.resolveMessage(tx, current, now);
        if (!message) {
          await this.cancel(tx, current.id);
          return;
        }
        const previous = await tx.pushOutbox.findFirst({
          where: {
            deviceId: current.deviceId,
            status: 'SENT',
            updatedAt: {
              gt: new Date(now.getTime() - PUSH_DEVICE_MIN_INTERVAL_MS),
            },
          },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        });
        if (previous) {
          await tx.pushOutbox.update({
            where: { id: current.id },
            data: {
              status: 'RETRY',
              attempts: due.attempts,
              leaseUntil: null,
              nextAttemptAt: new Date(
                previous.updatedAt.getTime() + PUSH_DEVICE_MIN_INTERVAL_MS,
              ),
            },
          });
          return;
        }
        const categoryCount = await tx.pushOutbox.count({
          where: {
            deviceId: current.deviceId,
            status: 'SENT',
            kind: isRoad ? 'ROAD_EVENT' : { in: ['PARTNER_POINT', 'GENERAL'] },
            updatedAt: {
              gte: isRoad
                ? new Date(now.getTime() - 60 * 60_000)
                : saratovDayStart(now),
            },
          },
        });
        if (
          categoryCount >=
          (isRoad ? PUSH_ROAD_MAX_PER_HOUR : PUSH_NEWS_MAX_PER_DAY)
        ) {
          await this.cancel(tx, current.id);
          return;
        }
        if (current.kind === 'PARTNER_POINT') {
          const recentSamePoint = await tx.pushOutbox.count({
            where: {
              deviceId: current.deviceId,
              targetId: current.targetId,
              kind: 'PARTNER_POINT',
              status: 'SENT',
              updatedAt: {
                gte: new Date(now.getTime() - PARTNER_PUSH_MIN_INTERVAL_MS),
              },
            },
          });
          if (recentSamePoint > 0) {
            await this.cancel(tx, current.id);
            return;
          }
        }
        let result: Awaited<ReturnType<PushProvider['send']>>;
        try {
          result = await this.provider.send(message);
        } catch {
          result = { status: 'RETRY', code: 'NETWORK_ERROR' };
        }
        if (result.status === 'SENT') {
          await tx.pushOutbox.update({
            where: { id: current.id },
            data: { status: 'SENT', leaseUntil: null, lastErrorCode: null },
          });
        } else if (result.status === 'INVALID_TOKEN') {
          await tx.pushDevice.update({
            where: { id: current.deviceId },
            data: { enabled: false },
          });
          await tx.pushOutbox.updateMany({
            where: {
              deviceId: current.deviceId,
              status: { in: ['PENDING', 'RETRY', 'SENDING'] },
            },
            data: {
              status: 'CANCELLED',
              leaseUntil: null,
              lastErrorCode: 'INVALID_TOKEN',
            },
          });
        } else {
          const attempts = current.attempts;
          await tx.pushOutbox.update({
            where: { id: current.id },
            data: {
              status: attempts >= PUSH_MAX_ATTEMPTS ? 'CANCELLED' : 'RETRY',
              leaseUntil: null,
              nextAttemptAt: new Date(
                now.getTime() + pushRetryDelayMs(attempts),
              ),
              lastErrorCode: /^[A-Z_]{1,40}$/u.test(result.code)
                ? result.code
                : 'PROVIDER_ERROR',
            },
          });
        }
      },
      { timeout: 30_000 },
    );
    return true;
  }

  private cancel(tx: Prisma.TransactionClient, id: string) {
    return tx.pushOutbox.update({
      where: { id },
      data: { status: 'CANCELLED', leaseUntil: null },
    });
  }

  private async resolveMessage(
    tx: Prisma.TransactionClient,
    due: {
      kind: 'ROAD_EVENT' | 'PARTNER_POINT' | 'GENERAL';
      targetId: string;
      cityId: string;
      dedupeKey: string;
      device: { provider: 'APNS' | 'FCM'; token: string };
      campaignRun: {
        campaign: {
          id: string;
          kind: 'GENERAL' | 'PARTNER_POINT';
          partnerPointId: string | null;
          cityIds: unknown;
          title: string;
          body: string;
        };
      } | null;
    },
    now: Date,
  ): Promise<PushMessage | null> {
    const { kind, targetId, cityId } = due;
    const base = {
      provider: due.device.provider,
      token: due.device.token,
      collapseKey: due.dedupeKey,
    };
    if (kind === 'ROAD_EVENT') {
      const event = await tx.roadEvent.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          cityId: true,
          type: true,
          status: true,
          source: true,
          confidence: true,
          confirmationCount: true,
          rejectionCount: true,
          lastConfirmedAt: true,
          createdAt: true,
          expiresAt: true,
          createdByInstallationId: true,
          locationLabel: true,
          locationPrecision: true,
        },
      });
      if (!event || event.cityId !== cityId) return null;
      const independentConfirmations = await tx.roadEventFeedback.count({
        where: {
          roadEventId: targetId,
          action: 'CONFIRM',
          ...(event.createdByInstallationId
            ? { installationId: { not: event.createdByInstallationId } }
            : {}),
        },
      });
      if (
        !roadPushEligible(
          {
            type: event.type,
            status: event.status,
            source: event.source,
            storedConfidence: Number(event.confidence),
            confirmationCount: event.confirmationCount,
            rejectionCount: event.rejectionCount,
            independentConfirmations,
            lastConfirmedAt: event.lastConfirmedAt,
            createdAt: event.createdAt,
            expiresAt: event.expiresAt,
          },
          now,
        )
      )
        return null;
      return {
        ...base,
        title: 'OnMap · ДПС',
        body: patrolBody(event.locationLabel, event.locationPrecision),
        data: { kind, targetId, cityId },
      };
    }
    const campaign = due.campaignRun?.campaign;
    if (kind === 'GENERAL') {
      if (
        !campaign ||
        campaign.kind !== 'GENERAL' ||
        campaign.id !== targetId ||
        !Array.isArray(campaign.cityIds) ||
        !campaign.cityIds.includes(cityId)
      )
        return null;
      return { ...base, title: campaign.title, body: campaign.body };
    }
    const point = await tx.partnerPoint.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        cityId: true,
        status: true,
        startsAt: true,
        endsAt: true,
        title: true,
        longitude: true,
        latitude: true,
      },
    });
    if (
      !point ||
      point.cityId !== cityId ||
      point.status !== 'ACTIVE' ||
      point.startsAt > now ||
      point.endsAt <= now ||
      point.longitude === null ||
      point.latitude === null
    )
      return null;
    if (
      campaign &&
      (campaign.kind !== 'PARTNER_POINT' ||
        campaign.partnerPointId !== point.id ||
        !Array.isArray(campaign.cityIds) ||
        !campaign.cityIds.includes(cityId))
    )
      return null;
    return {
      ...base,
      title: campaign?.title ?? 'Предложение партнёра OnMap',
      body: campaign?.body ?? point.title.slice(0, 100),
      data: { kind, targetId, cityId },
    };
  }
}
