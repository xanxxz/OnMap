import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service';
jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
import { PushOutboxService } from './push-outbox.service';
import { RecordingPushProvider } from './push-provider';

const NOW = new Date('2026-10-13T10:00:00.000Z');
const device = {
  id: 'device-1',
  enabled: true,
  cityId: 'balakovo',
  roadPushEnabled: true,
  newsPushEnabled: true,
  provider: 'APNS',
  token: 'opaque-token',
};
const row = () => ({
  id: 'outbox-1',
  deviceId: device.id,
  device,
  kind: 'GENERAL',
  targetId: 'campaign-1',
  cityId: 'balakovo',
  dedupeKey: 'campaign:1',
  status: 'SENDING',
  attempts: 1,
  createdAt: NOW,
  campaignRun: {
    campaign: {
      id: 'campaign-1',
      kind: 'GENERAL',
      status: 'COMPLETED',
      partnerPointId: null,
      cityIds: ['balakovo'],
      title: 'Новости OnMap',
      body: 'Тест',
    },
  },
});

describe('PushOutboxService', () => {
  const findFirst = jest.fn();
  const findUnique = jest.fn();
  const updateMany = jest.fn();
  const update = jest.fn();
  const count = jest.fn();
  const deviceUpdate = jest.fn();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    pushOutbox: { findUnique, findFirst: jest.fn(), count, update, updateMany },
    pushDevice: { update: deviceUpdate },
    roadEvent: { findUnique: jest.fn() },
    roadEventFeedback: { count: jest.fn() },
    partnerPoint: { findUnique: jest.fn() },
  };
  const prisma = {
    pushOutbox: { findFirst, updateMany },
    $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  const config = { get: () => 'false' } as unknown as ConfigService;
  const provider = new RecordingPushProvider();
  const service = new PushOutboxService(prisma, config, provider);

  beforeEach(() => {
    jest.clearAllMocks();
    provider.messages.length = 0;
    findFirst.mockResolvedValue({ ...row(), status: 'PENDING', attempts: 0 });
    findUnique.mockResolvedValue(row());
    updateMany.mockResolvedValue({ count: 1 });
    tx.pushOutbox.findFirst.mockResolvedValue(null);
    count.mockResolvedValue(0);
  });

  it('sends generic message without a deep link and records provider acceptance', async () => {
    await service.processDueOnce(NOW);
    expect(provider.messages).toEqual([
      expect.objectContaining({ title: 'Новости OnMap', body: 'Тест' }),
    ]);
    expect(provider.messages[0].data).toBeUndefined();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: {
        status: 'SENT',
        leaseUntil: null,
        lastErrorCode: null,
      },
    });
  });

  it('cancels stale messages and opted-out devices', async () => {
    findUnique.mockResolvedValueOnce({
      ...row(),
      createdAt: new Date(NOW.getTime() - 16 * 60_000),
    });
    await service.processDueOnce(NOW);
    expect(provider.messages).toHaveLength(0);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: { status: 'CANCELLED', leaseUntil: null },
    });
    jest.clearAllMocks();
    findFirst.mockResolvedValue({ ...row(), status: 'PENDING', attempts: 0 });
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValueOnce({
      ...row(),
      device: { ...device, newsPushEnabled: false },
    });
    await service.processDueOnce(NOW);
    expect(provider.messages).toHaveLength(0);
  });

  it('enforces category cap and invalidates a provider-rejected token', async () => {
    count.mockResolvedValueOnce(1);
    await service.processDueOnce(NOW);
    expect(provider.messages).toHaveLength(0);
    jest.clearAllMocks();
    findFirst.mockResolvedValue({ ...row(), status: 'PENDING', attempts: 0 });
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue(row());
    tx.pushOutbox.findFirst.mockResolvedValue(null);
    count.mockResolvedValue(0);
    const rejected = {
      ready: true,
      send: jest.fn().mockResolvedValue({ status: 'INVALID_TOKEN' }),
    };
    await new PushOutboxService(prisma, config, rejected).processDueOnce(NOW);
    expect(deviceUpdate).toHaveBeenCalledWith({
      where: { id: device.id },
      data: { enabled: false },
    });
  });
});
