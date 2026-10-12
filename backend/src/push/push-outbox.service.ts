import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import {
  PUSH_PROVIDER,
  type PushProvider,
  type PushMessage,
} from './push-provider';
import {
  PUSH_DEVICE_MIN_INTERVAL_MS,
  PUSH_MAX_ATTEMPTS,
  PARTNER_PUSH_DELIVERY_WINDOW_MS,
  pushRetryDelayMs,
} from './push-policy';

const LEASE_MS = 120_000;
const TICK_MS = 5_000;

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
      void this.tick();
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
    if (!due.device.enabled || due.device.cityId !== due.cityId) {
      await this.cancel(due.id);
      return true;
    }
    if (
      due.kind === 'PARTNER_POINT' &&
      now.getTime() - due.createdAt.getTime() > PARTNER_PUSH_DELIVERY_WINDOW_MS
    ) {
      await this.cancel(due.id);
      return true;
    }
    const previous = await this.prisma.pushOutbox.findFirst({
      where: {
        deviceId: due.deviceId,
        status: 'SENT',
        updatedAt: {
          gt: new Date(now.getTime() - PUSH_DEVICE_MIN_INTERVAL_MS),
        },
      },
      select: { id: true },
    });
    if (previous) {
      await this.prisma.pushOutbox.update({
        where: { id: due.id },
        data: {
          status: 'RETRY',
          attempts: due.attempts,
          leaseUntil: null,
          nextAttemptAt: new Date(now.getTime() + PUSH_DEVICE_MIN_INTERVAL_MS),
        },
      });
      return true;
    }

    const message = await this.resolveMessage(
      due.kind,
      due.targetId,
      due.cityId,
      due.device.provider,
      due.device.token,
      due.dedupeKey,
      now,
    );
    if (!message) {
      await this.cancel(due.id);
      return true;
    }
    let result: Awaited<ReturnType<PushProvider['send']>>;
    try {
      result = await this.provider.send(message);
    } catch {
      result = { status: 'RETRY', code: 'NETWORK_ERROR' };
    }
    if (result.status === 'SENT') {
      await this.prisma.pushOutbox.update({
        where: { id: due.id },
        data: { status: 'SENT', leaseUntil: null, lastErrorCode: null },
      });
    } else if (result.status === 'INVALID_TOKEN') {
      await this.prisma.$transaction(async (tx) => {
        await tx.pushDevice.update({
          where: { id: due.deviceId },
          data: { enabled: false },
        });
        await tx.pushOutbox.updateMany({
          where: {
            deviceId: due.deviceId,
            status: { in: ['PENDING', 'RETRY', 'SENDING'] },
          },
          data: {
            status: 'CANCELLED',
            leaseUntil: null,
            lastErrorCode: 'INVALID_TOKEN',
          },
        });
      });
    } else {
      const attempts = due.attempts + 1;
      await this.prisma.pushOutbox.update({
        where: { id: due.id },
        data: {
          status: attempts >= PUSH_MAX_ATTEMPTS ? 'CANCELLED' : 'RETRY',
          leaseUntil: null,
          nextAttemptAt: new Date(now.getTime() + pushRetryDelayMs(attempts)),
          lastErrorCode: /^[A-Z_]{1,40}$/u.test(result.code)
            ? result.code
            : 'PROVIDER_ERROR',
        },
      });
    }
    return true;
  }

  private cancel(id: string) {
    return this.prisma.pushOutbox.update({
      where: { id },
      data: { status: 'CANCELLED', leaseUntil: null },
    });
  }

  private async resolveMessage(
    kind: 'ROAD_EVENT' | 'PARTNER_POINT',
    targetId: string,
    cityId: string,
    provider: 'APNS' | 'FCM',
    token: string,
    collapseKey: string,
    now: Date,
  ): Promise<PushMessage | null> {
    if (kind === 'ROAD_EVENT') {
      const event = await this.prisma.roadEvent.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          cityId: true,
          type: true,
          status: true,
          expiresAt: true,
        },
      });
      if (
        !event ||
        event.cityId !== cityId ||
        event.expiresAt <= now ||
        !['ACTIVE', 'UNCONFIRMED', 'STALE'].includes(event.status)
      )
        return null;
      return {
        provider,
        token,
        collapseKey,
        title: 'Новое дорожное событие',
        body: 'Откройте карту OnMap, чтобы узнать подробности.',
        data: { kind, targetId, cityId },
      };
    }
    const point = await this.prisma.partnerPoint.findUnique({
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
    return {
      provider,
      token,
      collapseKey,
      title: 'Предложение партнёра OnMap',
      body: point.title.slice(0, 100),
      data: { kind, targetId, cityId },
    };
  }
}
