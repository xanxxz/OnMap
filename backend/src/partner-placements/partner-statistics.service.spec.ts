jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../identity/identity.service', () => ({
  IdentityService: class {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { IdentityService } from '../identity/identity.service';
import { PartnerInteractionAction } from './dto/record-partner-interaction.dto';
import { PartnerStatisticsService } from './partner-statistics.service';

const pointId = '00000000-0000-4000-8000-000000000001';
const bannerId = '00000000-0000-4000-8000-000000000002';
const contactId = '00000000-0000-4000-8000-000000000003';
const now = new Date('2026-10-09T12:00:00.000Z');
const point = {
  id: pointId,
  cityId: 'balakovo',
  status: 'ACTIVE',
  startsAt: new Date('2026-10-01'),
  endsAt: new Date('2026-10-20'),
  latitude: 52,
  longitude: 47.8,
};
const banner = {
  id: bannerId,
  cityId: 'balakovo',
  enabled: true,
  title: 'Title',
  text: 'Text',
  buttonLabel: 'Go',
  buttonUrl: 'https://example.com',
  partnerPointId: pointId,
  partnerPoint: point,
  startsAt: point.startsAt,
  endsAt: point.endsAt,
};

describe('PartnerStatisticsService', () => {
  const seen = new Map<string, Date>();
  const daily = new Map<string, number>();
  const tx = {
    partnerPoint: { findUnique: jest.fn().mockResolvedValue(point) },
    partnerPointContact: {
      findFirst: jest.fn().mockResolvedValue({ id: contactId }),
    },
    partnerCityBanner: { findUnique: jest.fn().mockResolvedValue(banner) },
    partnerStatWindow: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn(
        ({
          data,
        }: {
          data: Array<{
            actorHash: string;
            action: string;
            detailId: string;
            lastAcceptedAt: Date;
          }>;
        }) => {
          const row = data[0];
          const key = `${row.actorHash}:${row.action}:${row.detailId}`;
          if (seen.has(key)) return Promise.resolve({ count: 0 });
          seen.set(key, row.lastAcceptedAt);
          return Promise.resolve({ count: 1 });
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: {
            actorHash: string;
            action: string;
            detailId: string;
            lastAcceptedAt: { lte: Date };
          };
          data: { lastAcceptedAt: Date };
        }) => {
          const key = `${where.actorHash}:${where.action}:${where.detailId}`;
          const previous = seen.get(key);
          if (!previous || previous > where.lastAcceptedAt.lte)
            return Promise.resolve({ count: 0 });
          seen.set(key, data.lastAcceptedAt);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    partnerStatDaily: {
      upsert: jest.fn(
        ({
          where,
        }: {
          where: {
            partnerPointId_action_detailId_day: {
              action: string;
              detailId: string;
              day: Date;
            };
          };
        }) => {
          const { action, detailId, day } =
            where.partnerPointId_action_detailId_day;
          const key = `${action}:${detailId}:${day.toISOString()}`;
          daily.set(key, (daily.get(key) ?? 0) + 1);
          return Promise.resolve({ count: daily.get(key) });
        },
      ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const identity = {
    partnerStatisticsPseudonym: (id: string) => `hashed-${id}`,
  };
  const service = new PartnerStatisticsService(
    prisma as unknown as PrismaService,
    identity as unknown as IdentityService,
  );

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    seen.clear();
    daily.clear();
    jest.clearAllMocks();
    prisma.partnerPoint.findUnique.mockResolvedValue(point);
    prisma.partnerCityBanner.findUnique.mockResolvedValue(banner);
    prisma.partnerPointContact.findFirst.mockResolvedValue({ id: contactId });
  });
  afterEach(() => jest.useRealTimers());

  it('counts independent card opens but not repeated or simultaneous requests from one client', async () => {
    const dto = {
      action: PartnerInteractionAction.POINT_OPEN,
      targetId: pointId,
    };
    expect(
      await Promise.all([
        service.record(dto, 'actor-a'),
        service.record(dto, 'actor-a'),
      ]),
    ).toEqual([{ counted: true }, { counted: false }]);
    expect(await service.record(dto, 'actor-b')).toEqual({ counted: true });
    expect(prisma.partnerStatDaily.upsert).toHaveBeenCalledTimes(2);
    expect(
      JSON.stringify(prisma.partnerStatDaily.upsert.mock.calls),
    ).not.toContain('actor-a');
    jest.setSystemTime(new Date(now.getTime() + 14 * 60_000));
    expect(await service.record(dto, 'actor-a')).toEqual({ counted: false });
    jest.setSystemTime(new Date(now.getTime() + 15 * 60_000));
    expect(await service.record(dto, 'actor-a')).toEqual({ counted: true });
  });

  it('tracks only a contact belonging to the active point, never its value', async () => {
    const dto = {
      action: PartnerInteractionAction.CONTACT_CLICK,
      targetId: pointId,
      contactId,
    };
    expect(await service.record(dto, 'actor-a')).toEqual({ counted: true });
    expect(prisma.partnerPointContact.findFirst).toHaveBeenCalledWith({
      where: { id: contactId, partnerPointId: pointId },
      select: { id: true },
    });
    expect(
      JSON.stringify(prisma.partnerStatDaily.upsert.mock.calls),
    ).not.toMatch(/phone|email|value|actor-a/i);
    prisma.partnerPointContact.findFirst.mockResolvedValue(null);
    await expect(service.record(dto, 'actor-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.record(
        { action: PartnerInteractionAction.CONTACT_CLICK, targetId: pointId },
        'actor-b',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts banner impressions/clicks only while linked placement is active', async () => {
    expect(
      await service.record(
        {
          action: PartnerInteractionAction.BANNER_IMPRESSION,
          targetId: bannerId,
        },
        'actor-a',
      ),
    ).toEqual({ counted: true });
    expect(
      await service.record(
        {
          action: PartnerInteractionAction.BANNER_IMPRESSION,
          targetId: bannerId,
        },
        'actor-a',
      ),
    ).toEqual({ counted: false });
    expect(
      await service.record(
        { action: PartnerInteractionAction.BANNER_CLICK, targetId: bannerId },
        'actor-a',
      ),
    ).toEqual({ counted: true });
    prisma.partnerCityBanner.findUnique.mockResolvedValue({
      ...banner,
      enabled: false,
    });
    await expect(
      service.record(
        {
          action: PartnerInteractionAction.BANNER_IMPRESSION,
          targetId: bannerId,
        },
        'actor-b',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
