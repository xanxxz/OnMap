import { PushDevicesService } from './push-devices.service';
jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
import type { PrismaService } from '../database/prisma.service';
import type { IdentityService } from '../identity/identity.service';
import {
  PushClientPlatform,
  PushClientProvider,
} from './dto/register-push-device.dto';

const input = {
  installationId: 'e2e238d0-8217-4cb1-b028-cd3f0fb7f1ad',
  cityId: 'balakovo',
  platform: PushClientPlatform.IOS,
  provider: PushClientProvider.APNS,
  token: 'a'.repeat(64),
};

describe('PushDevicesService', () => {
  const deleteMany = jest.fn();
  const upsert = jest.fn();
  const findMany = jest.fn();
  const findUnique = jest.fn().mockResolvedValue(null);
  const count = jest.fn().mockResolvedValue(0);
  const updateMany = jest.fn();
  const outboxUpdateMany = jest.fn();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    pushDevice: { deleteMany, upsert, findMany, findUnique, count, updateMany },
    pushOutbox: { updateMany: outboxUpdateMany },
  };
  const prisma = {
    $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  const identity = {
    pushDeviceIdentityKey: () => 'identity-hmac',
  } as unknown as IdentityService;
  const service = new PushDevicesService(prisma, identity);

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue(null);
    count.mockResolvedValue(0);
  });

  it('rotates token for the installation without storing raw identity', async () => {
    await service.register('secret-identity-id', input);
    const removed = (
      deleteMany.mock.calls as unknown as Array<
        [
          {
            where: {
              identityKey: string;
              installationId: string;
              tokenHash: { not: string };
            };
          },
        ]
      >
    )[0][0];
    expect(removed.where.identityKey).toBe('identity-hmac');
    expect(removed.where.installationId).toBe(input.installationId);
    expect(removed.where.tokenHash.not).toMatch(/^[a-f0-9]{64}$/u);
    const saved = (
      upsert.mock.calls as unknown as Array<
        [
          {
            create: { identityKey: string; token: string; enabled: boolean };
          },
        ]
      >
    )[0][0];
    expect(saved.create).toMatchObject({
      identityKey: 'identity-hmac',
      token: input.token,
      enabled: true,
    });
  });

  it('rejects platform/provider mismatch', async () => {
    await expect(
      service.register('identity', {
        ...input,
        provider: PushClientProvider.FCM,
      }),
    ).rejects.toThrow('Provider does not match platform');
  });

  it('caps registrations from one identity under the transaction lock', async () => {
    count.mockResolvedValueOnce(3);
    await expect(service.register('identity', input)).rejects.toThrow(
      'Push device limit exceeded',
    );
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('revokes device and pending delivery together', async () => {
    findMany.mockResolvedValueOnce([{ id: 'device-1' }]);
    await service.revoke('identity', input.installationId);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['device-1'] } },
      data: { enabled: false },
    });
    expect(outboxUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'CANCELLED' },
      }),
    );
  });
});
