import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { parsePartnerOwnerIds } from '../partner-placements/partner-bot.service';
import { PUSH_PROVIDER, type PushProvider } from './push-provider';

const CODE_TTL_MS = 10 * 60_000;
const ATTEMPT_WINDOW_MS = 60 * 60_000;
const TEST_MIN_INTERVAL_MS = 60_000;
const codeHash = (value: string) =>
  createHash('sha256')
    .update(value.replace(/-/gu, '').toUpperCase())
    .digest('hex');

@Injectable()
export class PushOwnerPairingService {
  private readonly ownerIds: ReadonlySet<string>;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {
    this.ownerIds = parsePartnerOwnerIds(
      config.get<string>('TELEGRAM_PARTNER_OWNER_IDS'),
    );
  }

  async createCode(ownerTelegramId: string): Promise<string> {
    if (!this.ownerIds.has(ownerTelegramId)) throw new ForbiddenException();
    const compact = randomBytes(6).toString('hex').toUpperCase();
    await this.prisma.$transaction(async (tx) => {
      await tx.pushOwnerPairing.deleteMany({
        where: { ownerTelegramId, consumedAt: null },
      });
      await tx.pushOwnerPairing.create({
        data: {
          ownerTelegramId,
          codeHash: codeHash(compact),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      });
    });
    return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8)}`;
  }

  async sendTelegramChallenge(
    ownerTelegramId: string,
  ): Promise<'SENT' | 'UNAVAILABLE' | 'RETRY'> {
    if (!this.ownerIds.has(ownerTelegramId)) throw new ForbiddenException();
    if (!this.provider.ready) return 'UNAVAILABLE';
    // A single registered token is not proof of ownership. The owner must
    // return the code delivered to that device in their private bot chat.
    const devices = await this.prisma.pushDevice.findMany({
      where: {
        platform: 'IOS',
        provider: 'APNS',
        enabled: true,
        newsPushEnabled: true,
      },
      take: 2,
    });
    if (devices.length !== 1)
      throw new BadRequestException('Exactly one eligible iPhone required');
    const now = new Date();
    const recent = await this.prisma.pushOwnerPairing.count({
      where: {
        ownerTelegramId,
        consumedAt: null,
        createdAt: { gt: new Date(now.getTime() - TEST_MIN_INTERVAL_MS) },
      },
    });
    if (recent)
      throw new HttpException(
        'Wait before another challenge',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const compact = randomBytes(6).toString('hex').toUpperCase();
    const challenge = await this.prisma.$transaction(async (tx) => {
      await tx.pushOwnerPairing.deleteMany({
        where: { ownerTelegramId, consumedAt: null },
      });
      return tx.pushOwnerPairing.create({
        data: {
          ownerTelegramId,
          deviceId: devices[0].id,
          codeHash: codeHash(compact),
          expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        },
      });
    });
    const code = `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8)}`;
    let result: Awaited<ReturnType<PushProvider['send']>>;
    try {
      result = await this.provider.send({
        provider: devices[0].provider,
        token: devices[0].token,
        title: 'OnMap · подтверждение iPhone',
        body: `Код привязки: ${code}. Отправьте его в личном чате бота OnMap.`,
        collapseKey: `owner-pair:${challenge.id}`,
      });
    } catch {
      result = { status: 'RETRY', code: 'NETWORK_ERROR' };
    }
    if (result.status !== 'SENT') {
      await this.prisma.pushOwnerPairing.deleteMany({
        where: { id: challenge.id, consumedAt: null },
      });
    }
    return result.status === 'SENT'
      ? 'SENT'
      : result.status === 'RETRY'
        ? 'RETRY'
        : 'UNAVAILABLE';
  }

  async confirmTelegramChallenge(
    ownerTelegramId: string,
    code: string,
  ): Promise<{ paired: true }> {
    if (!this.ownerIds.has(ownerTelegramId)) throw new ForbiddenException();
    const now = new Date();
    const attemptKey = createHash('sha256')
      .update(`telegram-owner-pair:v1:${ownerTelegramId}`)
      .digest('hex');
    const paired = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<readonly { locked: boolean }[]>`
        SELECT pg_advisory_xact_lock(hashtext(${attemptKey})) IS NULL AS locked
      `;
      const attempt = await tx.pushOwnerPairingAttempt.findUnique({
        where: { identityKey: attemptKey },
      });
      if (
        attempt &&
        attempt.windowStart > new Date(now.getTime() - ATTEMPT_WINDOW_MS) &&
        attempt.count >= 5
      )
        throw new HttpException(
          'Too many attempts',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      await tx.pushOwnerPairingAttempt.upsert({
        where: { identityKey: attemptKey },
        create: { identityKey: attemptKey, count: 1, windowStart: now },
        update:
          attempt?.windowStart &&
          attempt.windowStart > new Date(now.getTime() - ATTEMPT_WINDOW_MS)
            ? { count: { increment: 1 } }
            : { count: 1, windowStart: now },
      });
      if (!/^[0-9A-F]{4}-?[0-9A-F]{4}-?[0-9A-F]{4}$/iu.test(code)) return false;
      const challenge = await tx.pushOwnerPairing.findFirst({
        where: {
          ownerTelegramId,
          codeHash: codeHash(code),
          consumedAt: null,
          expiresAt: { gt: now },
          deviceId: { not: null },
        },
      });
      if (!challenge?.deviceId) return false;
      const device = await tx.pushDevice.findUnique({
        where: { id: challenge.deviceId },
      });
      if (!device?.enabled || !device.newsPushEnabled) return false;
      const changed = await tx.pushOwnerPairing.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (changed.count !== 1) return false;
      await tx.pushOwnerPairing.updateMany({
        where: {
          ownerTelegramId,
          id: { not: challenge.id },
          deviceId: { not: null },
        },
        data: { deviceId: null },
      });
      await tx.pushOwnerPairingAttempt.delete({
        where: { identityKey: attemptKey },
      });
      return true;
    });
    if (!paired) throw new BadRequestException('Challenge code unavailable');
    return { paired: true };
  }

  async bindDevice(
    identityId: string,
    installationId: string,
    code: string,
  ): Promise<{ paired: true }> {
    const identityKey = this.identity.pushDeviceIdentityKey(identityId);
    const now = new Date();
    const paired = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<readonly { locked: boolean }[]>`
        SELECT pg_advisory_xact_lock(hashtext(${identityKey})) IS NULL AS locked
      `;
      const attempt = await tx.pushOwnerPairingAttempt.findUnique({
        where: { identityKey },
      });
      if (
        attempt &&
        attempt.windowStart.getTime() > now.getTime() - ATTEMPT_WINDOW_MS &&
        attempt.count >= 5
      )
        throw new HttpException(
          'Too many attempts',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      await tx.pushOwnerPairingAttempt.upsert({
        where: { identityKey },
        create: { identityKey, count: 1, windowStart: now },
        update:
          attempt?.windowStart.getTime() &&
          attempt.windowStart.getTime() > now.getTime() - ATTEMPT_WINDOW_MS
            ? { count: { increment: 1 } }
            : { count: 1, windowStart: now },
      });
      const device = await tx.pushDevice.findUnique({
        where: { identityKey_installationId: { identityKey, installationId } },
        select: { id: true, enabled: true },
      });
      const pairing = await tx.pushOwnerPairing.findUnique({
        where: { codeHash: codeHash(code) },
      });
      if (
        !device?.enabled ||
        !pairing ||
        pairing.consumedAt ||
        pairing.expiresAt <= now
      )
        return false;
      const changed = await tx.pushOwnerPairing.updateMany({
        where: { id: pairing.id, consumedAt: null, expiresAt: { gt: now } },
        data: { deviceId: device.id, consumedAt: now },
      });
      if (changed.count !== 1) return false;
      // A new successful pairing replaces the owner's previous test target.
      await tx.pushOwnerPairing.updateMany({
        where: {
          ownerTelegramId: pairing.ownerTelegramId,
          id: { not: pairing.id },
          deviceId: { not: null },
        },
        data: { deviceId: null },
      });
      await tx.pushOwnerPairingAttempt.delete({ where: { identityKey } });
      return true;
    });
    if (!paired)
      throw new BadRequestException('Code or registered device unavailable');
    return { paired: true };
  }

  async sendCampaignTest(
    ownerTelegramId: string,
    campaignId: string,
  ): Promise<'SENT' | 'UNAVAILABLE' | 'RETRY'> {
    if (!this.ownerIds.has(ownerTelegramId)) throw new ForbiddenException();
    if (!this.provider.ready) return 'UNAVAILABLE';
    const campaign = await this.prisma.pushCampaign.findFirst({
      where: { id: campaignId, ownerTelegramId },
    });
    if (!campaign) throw new BadRequestException('Campaign unavailable');
    if (campaign.kind === 'PARTNER_POINT') {
      const point = campaign.partnerPointId
        ? await this.prisma.partnerPoint.findUnique({
            where: { id: campaign.partnerPointId },
          })
        : null;
      const now = new Date();
      if (
        !point ||
        point.status !== 'ACTIVE' ||
        point.startsAt > now ||
        point.endsAt <= now
      )
        throw new BadRequestException('Partner point unavailable');
    }
    const pairings = await this.prisma.pushOwnerPairing.findMany({
      where: {
        ownerTelegramId,
        consumedAt: { not: null },
        deviceId: { not: null },
      },
      orderBy: { consumedAt: 'desc' },
    });
    const deviceIds = [
      ...new Set(
        pairings
          .map((row) => row.deviceId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (deviceIds.length !== 1)
      throw new BadRequestException('Pair exactly one test device first');
    const device = await this.prisma.pushDevice.findUnique({
      where: { id: deviceIds[0] },
    });
    if (!device?.enabled || !device.newsPushEnabled)
      throw new BadRequestException('Test device is unavailable or opted out');
    const pairing = pairings.find((row) => row.deviceId === device.id);
    if (!pairing) return 'UNAVAILABLE';
    const now = new Date();
    const claimed = await this.prisma.pushOwnerPairing.updateMany({
      where: {
        id: pairing.id,
        OR: [
          { testSentAt: null },
          {
            testSentAt: { lt: new Date(now.getTime() - TEST_MIN_INTERVAL_MS) },
          },
        ],
      },
      data: { testSentAt: now },
    });
    if (claimed.count !== 1)
      throw new HttpException(
        'Wait before another test',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    try {
      const result = await this.provider.send({
        provider: device.provider,
        token: device.token,
        title: campaign.title,
        body: campaign.body,
        collapseKey: `owner-test:${campaign.id}:${now.getTime()}`,
        ...(campaign.kind === 'PARTNER_POINT' && campaign.partnerPointId
          ? {
              data: {
                kind: 'PARTNER_POINT' as const,
                targetId: campaign.partnerPointId,
                cityId: device.cityId,
              },
            }
          : {}),
      });
      return result.status === 'SENT'
        ? 'SENT'
        : result.status === 'RETRY'
          ? 'RETRY'
          : 'UNAVAILABLE';
    } catch {
      return 'RETRY';
    }
  }
}
