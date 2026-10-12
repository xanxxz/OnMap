import { PushOutboxService } from './push-outbox.service';
jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
import { RecordingPushProvider } from './push-provider';
import type { PrismaService } from '../database/prisma.service';
import type { ConfigService } from '@nestjs/config';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const due = () => ({
  id: 'outbox-1',
  deviceId: 'device-1',
  dedupeKey: 'road:event-1',
  kind: 'ROAD_EVENT' as const,
  targetId: 'event-1',
  cityId: 'balakovo',
  status: 'PENDING' as const,
  attempts: 0,
  createdAt: NOW,
  device: {
    id: 'device-1',
    enabled: true,
    cityId: 'balakovo',
    provider: 'APNS' as const,
    token: 'device-token',
  },
});

describe('PushOutboxService', () => {
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const update = jest.fn();
  const findUnique = jest.fn();
  const deviceUpdate = jest.fn();
  const tx = {
    pushDevice: { update: deviceUpdate },
    pushOutbox: { updateMany },
  };
  const prisma = {
    pushOutbox: { findFirst, updateMany, update },
    roadEvent: { findUnique },
    partnerPoint: { findUnique: jest.fn() },
    $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  const config = { get: () => 'false' } as unknown as ConfigService;
  const provider = new RecordingPushProvider();
  const service = new PushOutboxService(prisma, config, provider);

  beforeEach(() => {
    jest.clearAllMocks();
    provider.messages.length = 0;
    findFirst.mockResolvedValueOnce(due()).mockResolvedValueOnce(null);
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({
      id: 'event-1',
      cityId: 'balakovo',
      type: 'ACCIDENT',
      status: 'ACTIVE',
      expiresAt: new Date('2026-10-12T10:20:00.000Z'),
    });
  });

  it('delivers a data-only location-free target and marks it sent', async () => {
    await service.processDueOnce(NOW);
    expect(provider.messages).toEqual([
      expect.objectContaining({
        data: { kind: 'ROAD_EVENT', targetId: 'event-1', cityId: 'balakovo' },
      }),
    ]);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: { status: 'SENT', leaseUntil: null, lastErrorCode: null },
    });
  });

  it('does not deliver an expired event', async () => {
    findUnique.mockResolvedValue({
      id: 'event-1',
      cityId: 'balakovo',
      status: 'ACTIVE',
      expiresAt: NOW,
    });
    await service.processDueOnce(NOW);
    expect(provider.messages).toHaveLength(0);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: { status: 'CANCELLED', leaseUntil: null },
    });
  });

  it('drops a partner campaign that sat in the queue past its delivery window', async () => {
    findFirst.mockReset().mockResolvedValueOnce({
      ...due(),
      kind: 'PARTNER_POINT',
      createdAt: new Date(NOW.getTime() - 16 * 60_000),
    });
    await service.processDueOnce(NOW);
    expect(provider.messages).toHaveLength(0);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: { status: 'CANCELLED', leaseUntil: null },
    });
  });

  it('retries after provider failure and invalidates bad tokens', async () => {
    const failing = {
      ready: true,
      send: jest.fn().mockResolvedValue({ status: 'RETRY', code: 'TEMPORARY' }),
    };
    await new PushOutboxService(prisma, config, failing).processDueOnce(NOW);
    const retried = (
      update.mock.calls as unknown as Array<
        [
          {
            data: { status: string; lastErrorCode: string };
          },
        ]
      >
    )[0][0];
    expect(retried.data).toMatchObject({
      status: 'RETRY',
      lastErrorCode: 'TEMPORARY',
    });
    jest.clearAllMocks();
    findFirst.mockResolvedValueOnce(due()).mockResolvedValueOnce(null);
    updateMany.mockResolvedValue({ count: 1 });
    const invalid = {
      ready: true,
      send: jest.fn().mockResolvedValue({ status: 'INVALID_TOKEN' }),
    };
    await new PushOutboxService(prisma, config, invalid).processDueOnce(NOW);
    expect(deviceUpdate).toHaveBeenCalledWith({
      where: { id: 'device-1' },
      data: { enabled: false },
    });
  });
});
