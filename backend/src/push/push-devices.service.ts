import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { getCityConfig } from '../cities/city.registry';
import { PrismaService } from '../database/prisma.service';
import { IdentityService } from '../identity/identity.service';
import {
  PushClientPlatform,
  PushClientProvider,
  RegisterPushDeviceDto,
} from './dto/register-push-device.dto';
import { PUSH_MAX_DEVICES_PER_IDENTITY } from './push-policy';

@Injectable()
export class PushDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async register(identityId: string, input: RegisterPushDeviceDto) {
    if (!getCityConfig(input.cityId))
      throw new BadRequestException('Unsupported cityId');
    if (
      (input.platform === PushClientPlatform.IOS &&
        input.provider !== PushClientProvider.APNS) ||
      (input.platform === PushClientPlatform.ANDROID &&
        input.provider !== PushClientProvider.FCM)
    )
      throw new BadRequestException('Provider does not match platform');

    const identityKey = this.identity.pushDeviceIdentityKey(identityId);
    const tokenHash = createHash('sha256')
      .update(input.token, 'utf8')
      .digest('hex');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${identityKey}))`;
      const existing = await tx.pushDevice.findUnique({
        where: {
          identityKey_installationId: {
            identityKey,
            installationId: input.installationId,
          },
        },
      });
      if (!existing) {
        const count = await tx.pushDevice.count({
          where: { identityKey, enabled: true },
        });
        if (count >= PUSH_MAX_DEVICES_PER_IDENTITY)
          throw new HttpException(
            'Push device limit exceeded',
            HttpStatus.TOO_MANY_REQUESTS,
          );
      }
      if (
        existing?.tokenHash === tokenHash &&
        existing.cityId === input.cityId &&
        existing.enabled
      )
        return;
      // A rotated token replaces the previous credential for this installation.
      await tx.pushDevice.deleteMany({
        where: {
          identityKey,
          installationId: input.installationId,
          tokenHash: { not: tokenHash },
        },
      });
      await tx.pushDevice.upsert({
        where: { tokenHash },
        create: {
          identityKey,
          installationId: input.installationId,
          cityId: input.cityId,
          platform: input.platform,
          provider: input.provider,
          token: input.token,
          tokenHash,
          enabled: true,
        },
        update: {
          identityKey,
          installationId: input.installationId,
          cityId: input.cityId,
          platform: input.platform,
          provider: input.provider,
          token: input.token,
          enabled: true,
        },
      });
    });
    return { registered: true };
  }

  async revoke(identityId: string, installationId: string) {
    const identityKey = this.identity.pushDeviceIdentityKey(identityId);
    await this.prisma.$transaction(async (tx) => {
      const devices = await tx.pushDevice.findMany({
        where: { identityKey, installationId },
        select: { id: true },
      });
      const ids = devices.map((device) => device.id);
      if (ids.length === 0) return;
      await tx.pushDevice.updateMany({
        where: { id: { in: ids } },
        data: { enabled: false },
      });
      await tx.pushOutbox.updateMany({
        where: { deviceId: { in: ids }, status: { in: ['PENDING', 'RETRY'] } },
        data: { status: 'CANCELLED' },
      });
    });
    return { revoked: true };
  }
}
