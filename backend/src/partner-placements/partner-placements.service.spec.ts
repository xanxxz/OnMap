jest.mock('../database/prisma.service', () => ({
  PrismaService: class {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { PartnerPlacementsService } from './partner-placements.service';

const now = new Date('2026-10-09T12:00:00.000Z');
const before = new Date('2026-10-08T12:00:00.000Z');
const after = new Date('2026-10-10T12:00:00.000Z');
const imageKey = 'b909ee9c-12a8-4c4c-8e3c-d89021525d55';
const query = {
  cityId: 'balakovo',
  west: 47.7,
  south: 51.9,
  east: 47.9,
  north: 52.1,
};

const point = {
  id: 'point-1',
  cityId: 'balakovo',
  title: 'Тестовая точка',
  category: 'SERVICE',
  backgroundColor: '#285C78',
  textColor: '#FDFBF4',
  description: 'Описание',
  longitude: 47.8,
  latitude: 52.0,
  displayAddress: 'Балаково',
  imageAssetKey: 'private-media-key',
  promoCode: 'OnMap-10',
  agreedPriceKopecks: 125050n,
  paidAt: new Date('2026-10-08T12:00:00.000Z'),
  startsAt: before,
  endsAt: after,
  status: 'ACTIVE',
  createdAt: before,
  updatedAt: before,
  contacts: [
    {
      id: '1',
      type: 'PHONE',
      label: 'Телефон',
      value: '+79990000000',
      displayOrder: 0,
    },
    {
      id: '2',
      type: 'WEBSITE',
      label: 'Сайт',
      value: 'https://example.com',
      displayOrder: 1,
    },
  ],
};

const banner = {
  id: 'banner-1',
  cityId: 'balakovo',
  title: 'Предложение партнёра',
  partnerPointId: 'point-1',
  partnerPoint: point,
  text: 'Предложение',
  buttonLabel: 'Подробнее',
  buttonUrl: 'https://example.com',
  startsAt: before,
  endsAt: after,
  enabled: true,
  agreedPriceKopecks: 300000n,
  paidAt: new Date('2026-10-08T12:00:00.000Z'),
  createdAt: before,
  updatedAt: before,
};

describe('PartnerPlacementsService', () => {
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const findFirst = jest.fn();
  const findImage = jest.fn();
  const prisma = {
    partnerPoint: { findMany, findFirst },
    partnerCityBanner: { findUnique },
    partnerImageAsset: { findUnique: findImage },
  } as unknown as PrismaService;
  const service = new PartnerPlacementsService(prisma);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    findMany.mockReset().mockResolvedValue([point]);
    findUnique.mockReset().mockResolvedValue(banner);
    findFirst
      .mockReset()
      .mockResolvedValue({ cityId: 'balakovo', latitude: 52, longitude: 47.8 });
    findImage
      .mockReset()
      .mockResolvedValue({ pngBytes: Uint8Array.from([137, 80, 78, 71]) });
  });

  afterEach(() => jest.useRealTimers());

  it('returns active points in the requested city and viewport with ordered contacts', async () => {
    const result = await service.list(query);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        cityId: 'balakovo',
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
        longitude: { not: null, gte: 47.7, lte: 47.9 },
        latitude: { not: null, gte: 51.9, lte: 52.1 },
      },
      include: {
        contacts: { orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({
      coordinates: { longitude: 47.8, latitude: 52 },
      imageUrl: null,
      appearance: { backgroundColor: '#285C78', textColor: '#FDFBF4' },
    });
    expect(result.points[0]).not.toHaveProperty('imageAssetKey');
    expect(result.points[0]).not.toHaveProperty('agreedPriceKopecks');
    expect(result.points[0]).not.toHaveProperty('paidAt');
    expect(result.points[0].promoCode).toBe('OnMap-10');
    expect(result.banner).not.toHaveProperty('agreedPriceKopecks');
    expect(result.banner).not.toHaveProperty('paidAt');
    expect(
      result.points[0].contacts.map((contact) => contact.displayOrder),
    ).toEqual([0, 1]);
    expect(result.banner).toMatchObject({
      text: 'Предложение',
      button: { label: 'Подробнее', url: 'https://example.com' },
      appearance: { backgroundColor: '#285C78', textColor: '#FDFBF4' },
    });
  });

  it('exposes only an opaque image URL and serves bytes only while the point is active', async () => {
    findMany.mockResolvedValue([{ ...point, imageAssetKey: imageKey }]);
    expect((await service.list(query)).points[0].imageUrl).toBe(
      `/partner-placements/images/${imageKey}`,
    );
    expect(await service.getActiveImage(imageKey)).toEqual(
      Buffer.from([137, 80, 78, 71]),
    );
    const imageLookupCalls = findFirst.mock.calls as unknown as Array<
      [unknown]
    >;
    expect(imageLookupCalls[0]?.[0]).toMatchObject({
      where: { imageAssetKey: imageKey, status: 'ACTIVE' },
    });
    findFirst.mockResolvedValueOnce(null);
    expect(await service.getActiveImage(imageKey)).toBeNull();
    expect(await service.getActiveImage('../../secret')).toBeNull();
    expect(findImage).toHaveBeenCalledTimes(1);
  });

  it('makes the banner inherit changed colors from its linked point', async () => {
    const updatedPoint = {
      ...point,
      backgroundColor: '#F7F4EA',
      textColor: '#14241E',
    };
    findMany.mockResolvedValue([updatedPoint]);
    findUnique.mockResolvedValue({ ...banner, partnerPoint: updatedPoint });
    const result = await service.list(query);
    expect(result.points[0].appearance).toEqual({
      backgroundColor: '#F7F4EA',
      textColor: '#14241E',
    });
    expect(result.banner?.appearance).toEqual(result.points[0].appearance);
  });

  it('does not expose records with missing/invalid coordinates, wrong status, dates, city or viewport', async () => {
    findMany.mockResolvedValue([
      point,
      { ...point, id: 'no-coords', latitude: null, longitude: null },
      { ...point, id: 'draft', status: 'DRAFT' },
      { ...point, id: 'paused', status: 'PAUSED' },
      { ...point, id: 'future', startsAt: after },
      { ...point, id: 'expired', endsAt: now },
      { ...point, id: 'other-city', cityId: 'saratov' },
      { ...point, id: 'offscreen', longitude: 47.95 },
    ]);

    const result = await service.list(query);
    expect(result.points.map((item) => item.id)).toEqual(['point-1']);
  });

  it('does not expose a point outside city coverage even when the viewport includes it', async () => {
    findMany.mockResolvedValue([
      point,
      { ...point, id: 'outside-city', longitude: 48.25, latitude: 52.0 },
    ]);
    const result = await service.list({
      ...query,
      west: 47.4,
      east: 48.3,
    });
    expect(result.points.map((item) => item.id)).toEqual(['point-1']);
  });

  it.each([
    { enabled: false },
    { partnerPointId: null },
    { partnerPoint: { ...point, status: 'PAUSED' } },
    { title: null },
    { text: null },
    { text: '  ' },
    { buttonLabel: null },
    { buttonUrl: null },
    { buttonUrl: 'http://example.com' },
    { buttonUrl: 'https://user:pass@example.com' },
    { startsAt: null },
    { startsAt: after },
    { endsAt: null },
    { endsAt: now },
    { cityId: 'saratov' },
  ])(
    'hides an incomplete, disabled or out-of-period banner: %p',
    async (change) => {
      findUnique.mockResolvedValue({ ...banner, ...change });
      expect((await service.list(query)).banner).toBeNull();
    },
  );

  it('rejects an unsupported city or invalid viewport before querying the database', async () => {
    await expect(
      service.list({ ...query, cityId: 'unknown' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.list({ ...query, east: query.west }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('resolves only an active point for a notification and preserves its promo code', async () => {
    const found = await service.getActivePoint('point-1', 'balakovo');
    expect(found.promoCode).toBe('OnMap-10');
    expect(found).not.toHaveProperty('agreedPriceKopecks');
    await expect(
      service.getActivePoint('missing', 'balakovo'),
    ).rejects.toBeInstanceOf(NotFoundException);
    findMany.mockResolvedValue([{ ...point, status: 'PAUSED' }]);
    await expect(
      service.getActivePoint('point-1', 'balakovo'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
