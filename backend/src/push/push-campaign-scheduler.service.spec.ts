import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service';
jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
import { PushCampaignSchedulerService } from './push-campaign-scheduler.service';

const now = new Date('2026-10-13T10:00:00.000Z');
const campaign = () => ({
  id: 'campaign-1',
  kind: 'GENERAL',
  status: 'ACTIVE',
  scheduleKind: 'DAILY',
  localTime: '14:00',
  weekday: null,
  cityIds: ['balakovo'],
  partnerPointId: null,
  endsAt: new Date('2026-10-16T17:59:00.000Z'),
  nextRunAt: now,
});

describe('PushCampaignSchedulerService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    pushCampaign: { findUnique: jest.fn(), update: jest.fn() },
    pushCampaignCitySchedule: {
      findUnique: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    pushCampaignRun: { create: jest.fn(), update: jest.fn() },
    pushDevice: { findMany: jest.fn() },
    pushOutbox: { createMany: jest.fn(), count: jest.fn() },
  };
  const prisma = {
    $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  const service = new PushCampaignSchedulerService(prisma, {
    get: () => 'false',
  } as unknown as ConfigService);
  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([
      { campaignId: 'campaign-1', cityId: 'balakovo' },
    ]);
    tx.pushCampaign.findUnique.mockResolvedValue(campaign());
    tx.pushCampaignCitySchedule.findUnique.mockResolvedValue({
      campaignId: 'campaign-1',
      cityId: 'balakovo',
      timeZone: 'Europe/Saratov',
      nextRunAt: now,
      endsAt: campaign().endsAt,
    });
    tx.pushCampaignCitySchedule.aggregate.mockResolvedValue({
      _min: { nextRunAt: new Date('2026-10-14T10:00:00.000Z') },
    });
    tx.pushCampaignRun.create.mockResolvedValue({ id: 'run-1' });
    tx.pushDevice.findMany.mockResolvedValue([{ id: 'device-1' }]);
    tx.pushOutbox.count.mockResolvedValue(0);
  });

  it('creates one durable run with a per-run audience and advances recurrence', async () => {
    await service.processDueOnce(now);
    expect(tx.pushCampaignRun.create).toHaveBeenCalledWith({
      data: {
        campaignId: 'campaign-1',
        cityId: 'balakovo',
        scheduledAt: now,
        status: 'QUEUED',
      },
    });
    expect(tx.pushOutbox.createMany).toHaveBeenCalledTimes(1);
    expect(tx.pushCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: {
        status: 'ACTIVE',
        nextRunAt: new Date('2026-10-14T10:00:00.000Z'),
      },
    });
  });

  it('skips an old run instead of replaying backlog', async () => {
    await service.processDueOnce(new Date(now.getTime() + 60 * 60_000));
    expect(tx.pushCampaignRun.create).toHaveBeenCalledWith({
      data: {
        campaignId: 'campaign-1',
        cityId: 'balakovo',
        scheduledAt: now,
        status: 'SKIPPED',
      },
    });
    expect(tx.pushOutbox.createMany).not.toHaveBeenCalled();
    expect(tx.pushCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: {
        status: 'ACTIVE',
        nextRunAt: new Date('2026-10-14T10:00:00.000Z'),
      },
    });
  });

  it('treats a row already locked by another worker as no due work', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    expect(await service.processDueOnce(now)).toBe(false);
    expect(tx.pushCampaignRun.create).not.toHaveBeenCalled();
  });
});
