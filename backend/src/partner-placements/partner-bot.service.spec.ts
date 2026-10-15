jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service';
import sharp from 'sharp';
import {
  parsePartnerOwnerIds,
  partnerUpdateOwner,
  PartnerBotService,
} from './partner-bot.service';

const OWNER = 123456;
const POINT_ID = '00000000-0000-4000-8000-000000000001';
const message = (updateId: number, text: string, sender = OWNER) => ({
  update_id: updateId,
  message: {
    text,
    from: { id: sender },
    chat: { id: sender, type: 'private' },
  },
});
const callback = (updateId: number, data: string, sender = OWNER) => ({
  update_id: updateId,
  callback_query: {
    id: `callback-${updateId}`,
    data,
    from: { id: sender },
    message: { chat: { id: sender, type: 'private' } },
  },
});

const createHarness = () => {
  const processed = new Set<bigint>();
  let draft: {
    ownerTelegramId: string;
    kind: string;
    step: string;
    payload: unknown;
    revision: number;
  } | null = null;
  const createdPoints: unknown[] = [];
  const banners: unknown[] = [];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    telegramModerationUpdate: {
      findUnique: jest.fn(({ where }: { where: { updateId: bigint } }) =>
        Promise.resolve(
          processed.has(where.updateId) ? { updateId: where.updateId } : null,
        ),
      ),
      create: jest.fn(({ data }: { data: { updateId: bigint } }) => {
        processed.add(data.updateId);
        return Promise.resolve(data);
      }),
    },
    partnerBotDraft: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(draft)),
      upsert: jest.fn(({ create }: { create: typeof draft }) => {
        draft = create;
        return Promise.resolve(create);
      }),
      update: jest.fn(
        ({ data }: { data: Partial<NonNullable<typeof draft>> }) => {
          draft = { ...draft!, ...data };
          return Promise.resolve(draft);
        },
      ),
      delete: jest.fn().mockImplementation(() => {
        draft = null;
        return Promise.resolve({});
      }),
    },
    partnerPoint: {
      create: jest.fn(({ data }: { data: unknown }) => {
        createdPoints.push(data);
        return Promise.resolve({ id: POINT_ID });
      }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    partnerPointContact: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    partnerImageAsset: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ key: 'present' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    partnerCityBanner: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(({ create }: { create: unknown }) => {
        banners.push(create);
        return Promise.resolve(create);
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    partnerStatDaily: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    partnerPushCampaign: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({ id: '00000000-0000-4000-8000-000000000099' }),
      update: jest.fn().mockResolvedValue({}),
    },
    pushDevice: { findMany: jest.fn().mockResolvedValue([{ id: 'device-1' }]) },
    pushOutbox: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const config = {
    get: (key: string) =>
      key === 'TELEGRAM_PARTNER_OWNER_IDS' ? String(OWNER) : undefined,
  };
  const service = () =>
    new PartnerBotService(
      config as ConfigService,
      prisma as unknown as PrismaService,
    );
  return {
    service,
    tx,
    processed,
    createdPoints,
    banners,
    getDraft: () => draft,
    setDraft: (value: NonNullable<typeof draft>) => {
      draft = value;
    },
  };
};

describe('partner bot owner access', () => {
  it('selects placement start with inline local date and time buttons', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T08:00:00.000Z'));
    try {
      const harness = createHarness();
      harness.setDraft({
        ownerTelegramId: String(OWNER),
        kind: 'POINT',
        step: 'STARTS_AT',
        revision: 2,
        payload: { cityId: 'balakovo', contacts: [] },
      });
      await harness.service().process(callback(1001, 'pp:date:day1:2'));
      await harness.service().process(callback(1002, 'pp:date:hour12:3'));
      await harness.service().process(callback(1003, 'pp:date:minute30:4'));
      expect(harness.getDraft()).toMatchObject({
        step: 'ENDS_AT',
        payload: { startsAt: '2026-10-16T08:30:00.000Z' },
      });
    } finally {
      jest.useRealTimers();
    }
  });
  it('reorders contacts without changing their stable IDs', async () => {
    const harness = createHarness();
    harness.setDraft({
      ownerTelegramId: String(OWNER),
      kind: 'POINT',
      step: 'CONTACT_CHOICE',
      revision: 3,
      payload: {
        cityId: 'balakovo',
        contacts: [
          {
            id: 'first-id',
            type: 'PHONE',
            label: 'Телефон',
            value: '111',
            displayOrder: 0,
          },
          {
            id: 'second-id',
            type: 'PHONE',
            label: 'Другой телефон',
            value: '222',
            displayOrder: 1,
          },
        ],
      },
    });
    await harness.service().process(callback(999, 'pp:contact:down:0:3'));
    expect(
      (
        harness.getDraft()?.payload as {
          contacts: Array<{ id: string; displayOrder: number }>;
        }
      ).contacts,
    ).toEqual([
      expect.objectContaining({ id: 'second-id', displayOrder: 0 }),
      expect.objectContaining({ id: 'first-id', displayOrder: 1 }),
    ]);
  });
  it('requires a separate owner callback before partner push is queued', async () => {
    const previous = process.env.PUSH_ENQUEUE_ENABLED;
    process.env.PUSH_ENQUEUE_ENABLED = 'true';
    try {
      const harness = createHarness();
      harness.tx.partnerPoint.findUnique.mockResolvedValue({
        id: POINT_ID,
        cityId: 'balakovo',
        title: 'Партнёр',
        status: 'ACTIVE',
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 3600_000),
        latitude: 52,
        longitude: 47,
      });
      const bot = harness.service();
      await expect(
        bot.process(message(1, `/partner_push ${POINT_ID}`, 999)),
      ).rejects.toThrow('UNAUTHORIZED');
      const prepared = await bot.process(
        message(2, `/partner_push ${POINT_ID}`),
      );
      expect(prepared.keyboard?.inline_keyboard[0][0].text).toContain(
        'Подтвердить',
      );
      expect(harness.tx.pushOutbox.createMany).not.toHaveBeenCalled();
      harness.tx.partnerPushCampaign.findUnique.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000099',
        partnerPointId: POINT_ID,
        status: 'AWAITING_CONFIRMATION',
      });
      const data = 'pp:push:00000000-0000-4000-8000-000000000099:confirm';
      const approved = await bot.process(callback(3, data));
      expect(approved.callbackText).toBe('Поставлено в очередь');
      expect(harness.tx.pushOutbox.createMany).toHaveBeenCalledTimes(1);
      expect(await bot.process(callback(3, data))).toMatchObject({
        duplicate: true,
      });
      expect(harness.tx.pushOutbox.createMany).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.PUSH_ENQUEUE_ENABLED;
      else process.env.PUSH_ENQUEUE_ENABLED = previous;
    }
  });
  it('shows only owner-only aggregate statistics for 7/30/all periods', async () => {
    const harness = createHarness();
    harness.tx.partnerPoint.findUnique.mockResolvedValue({
      id: POINT_ID,
      title: 'Партнёр',
      contacts: [{ id: 'contact-uuid', label: 'Позвонить', type: 'PHONE' }],
    });
    harness.tx.partnerStatDaily.groupBy.mockResolvedValue([
      {
        action: 'POINT_OPEN',
        detailId: '',
        day: new Date(),
        _sum: { count: 4 },
      },
      {
        action: 'CONTACT_CLICK',
        detailId: 'contact-uuid',
        day: new Date(),
        _sum: { count: 2 },
      },
      {
        action: 'BANNER_IMPRESSION',
        detailId: 'banner-uuid',
        day: new Date(),
        _sum: { count: 3 },
      },
      {
        action: 'BANNER_CLICK',
        detailId: 'banner-uuid',
        day: new Date(),
        _sum: { count: 1 },
      },
    ]);
    const bot = harness.service();
    expect(
      await bot.shouldHandle(message(1, `/partner_stats ${POINT_ID}`, 999)),
    ).toBe(false);
    await expect(
      bot.process(message(2, `/partner_stats ${POINT_ID}`, 999)),
    ).rejects.toThrow('UNAUTHORIZED');
    const response = await bot.process(
      message(3, `/partner_stats ${POINT_ID}`),
    );
    expect(response.text).toContain('7 дней\nОткрытия карточки: 4');
    expect(response.text).toContain('30 дней\nОткрытия карточки: 4');
    expect(response.text).toContain('Всё время\nОткрытия карточки: 4');
    expect(response.text).toContain('Позвонить: 2');
    expect(response.text).not.toMatch(/actor|token|\+7/i);
    expect(harness.tx.partnerStatDaily.groupBy).toHaveBeenCalledTimes(1);
    expect(
      await bot.process(message(3, `/partner_stats ${POINT_ID}`)),
    ).toMatchObject({ duplicate: true });
  });
  it('accepts only an allowlisted sender in their own private chat', () => {
    const owners = parsePartnerOwnerIds('123456,not-an-id');
    expect(partnerUpdateOwner(message(1, '/partner', OWNER), owners)).toBe(
      String(OWNER),
    );
    expect(partnerUpdateOwner(message(1, '/partner', 999), owners)).toBeNull();
    expect(
      partnerUpdateOwner(
        {
          update_id: 1,
          message: {
            text: '/partner',
            from: { id: OWNER },
            chat: { id: -55, type: 'group' },
          },
        },
        owners,
      ),
    ).toBeNull();
    expect(
      partnerUpdateOwner(
        {
          update_id: 1,
          callback_query: {
            from: { id: 999 },
            message: { chat: { id: OWNER, type: 'private' } },
          },
        },
        owners,
      ),
    ).toBeNull();
  });

  it('does not claim existing moderation commands', async () => {
    const { service } = createHarness();
    expect(await service().shouldHandle(message(1, '/queue'))).toBe(false);
    expect(await service().shouldHandle(message(2, '/help'))).toBe(false);
    expect(
      await service().shouldHandle(message(3, '/partner_new balakovo', 999)),
    ).toBe(false);
    await expect(
      service().process(message(4, '/partner_new balakovo', 999)),
    ).rejects.toThrow('UNAUTHORIZED');
  });

  it('routes wizard slash controls only while an owner draft exists', async () => {
    const harness = createHarness();
    const bot = harness.service();
    expect(await bot.shouldHandle(message(1, '/skip'))).toBe(false);
    await bot.process(message(2, '/partner_new balakovo'));
    expect(await bot.shouldHandle(message(3, '/skip'))).toBe(true);
    expect(await bot.shouldHandle(message(4, '/keep'))).toBe(true);
    expect(await bot.shouldHandle(message(6, '/clear_promo'))).toBe(true);
    expect(await bot.shouldHandle(message(5, '/queue'))).toBe(false);
  });
});

describe('partner bot persisted workflow and idempotence', () => {
  it('attaches a normalized image while creating a new point only after confirmation', async () => {
    const harness = createHarness();
    const bot = harness.service();
    await bot.process(message(900, '/partner_new balakovo'));
    for (const [id, text] of [
      [901, 'Партнёр'],
      [902, 'SERVICE'],
      [903, '/skip'],
      [904, '52.0, 47.8'],
      [905, '/skip'],
    ] as const)
      await bot.process(message(id, text));
    await bot.process(callback(906, `pp:done:${harness.getDraft()!.revision}`));
    for (const [id, text] of [
      [907, '2026-10-10T12:00+04:00'],
      [908, '2026-10-20T12:00+04:00'],
      [909, '/keep'],
      [910, '/keep'],
    ] as const)
      await bot.process(message(id, text));
    const png = await sharp({
      create: { width: 40, height: 20, channels: 4, background: '#22aa88ff' },
    })
      .png()
      .toBuffer();
    await bot.process(message(911, ''), { bytes: png });
    await bot.process(message(913, '/skip'));
    expect(harness.getDraft()?.step).toBe('PREVIEW');
    const imageAssetKey = (
      harness.getDraft()?.payload as { imageAssetKey: string }
    ).imageAssetKey;
    expect(harness.createdPoints).toHaveLength(0);
    await bot.process(
      callback(912, `pp:confirm:${harness.getDraft()!.revision}`),
    );
    expect(harness.createdPoints[0]).toMatchObject({
      imageAssetKey,
    });
    expect(harness.tx.partnerImageAsset.create).toHaveBeenCalledTimes(1);
  });
  it('accepts an owner image only in the image step and does not replace the old image on failure', async () => {
    const harness = createHarness();
    const bot = harness.service();
    const oldKey = '11111111-1111-4111-8111-111111111111';
    harness.tx.partnerPoint.findUnique.mockResolvedValue({
      id: POINT_ID,
      cityId: 'balakovo',
      status: 'ACTIVE',
      title: 'Точка',
      category: 'SERVICE',
      description: null,
      latitude: 52,
      longitude: 47.8,
      displayAddress: null,
      backgroundColor: '#153D32',
      textColor: '#FDFBF4',
      startsAt: new Date('2026-10-10T08:00:00Z'),
      endsAt: new Date('2026-10-20T08:00:00Z'),
      imageAssetKey: oldKey,
      contacts: [],
    });
    await expect(
      bot.process(message(800, '/partner_edit ' + POINT_ID, 999), {
        bytes: Buffer.from('x'),
      }),
    ).rejects.toThrow('UNAUTHORIZED');
    await bot.process(message(801, '/partner_edit ' + POINT_ID));
    for (const [id, text] of [
      [802, '/keep'],
      [803, '/keep'],
      [804, '/skip'],
      [805, '/keep'],
      [806, '/skip'],
    ] as const)
      await bot.process(message(id, text));
    await bot.process(callback(807, `pp:done:${harness.getDraft()!.revision}`));
    for (const [id, text] of [
      [808, '/keep'],
      [809, '/keep'],
      [810, '/keep'],
      [811, '/keep'],
    ] as const)
      await bot.process(message(id, text));
    expect(harness.getDraft()?.step).toBe('IMAGE');
    const failed = await bot.process(message(812, ''), {
      bytes: Buffer.from('<svg/>'),
    });
    expect(failed.text).toContain('не является исправным');
    expect(harness.getDraft()?.step).toBe('IMAGE');
    expect(
      (harness.getDraft()?.payload as { imageAssetKey: string }).imageAssetKey,
    ).toBe(oldKey);
    expect(harness.tx.partnerImageAsset.deleteMany).not.toHaveBeenCalled();
    expect(harness.tx.partnerPoint.update).not.toHaveBeenCalled();
    const png = await sharp({
      create: { width: 16, height: 8, channels: 4, background: '#00ff00ff' },
    })
      .png()
      .toBuffer();
    const upload = message(813, '');
    await bot.process(upload, { bytes: png });
    await bot.process(message(815, '/skip'));
    expect(harness.getDraft()?.step).toBe('PREVIEW');
    const newKey = (harness.getDraft()?.payload as { imageAssetKey: string })
      .imageAssetKey;
    expect(newKey).not.toBe(oldKey);
    expect(harness.tx.partnerImageAsset.create).toHaveBeenCalledTimes(1);
    expect(harness.tx.partnerImageAsset.deleteMany).not.toHaveBeenCalled();
    expect((await bot.process(upload, { bytes: png })).duplicate).toBe(true);
    expect(harness.tx.partnerImageAsset.create).toHaveBeenCalledTimes(1);
    await bot.process(
      callback(814, `pp:confirm:${harness.getDraft()!.revision}`),
    );
    const pointUpdateCalls = harness.tx.partnerPoint.update.mock
      .calls as unknown as Array<[unknown]>;
    expect(pointUpdateCalls[0]?.[0]).toMatchObject({
      data: { imageAssetKey: newKey },
    });
    expect(harness.tx.partnerImageAsset.deleteMany).toHaveBeenCalledWith({
      where: { key: oldKey },
    });
  });
  it('survives a service restart and creates exactly one point after explicit confirmation', async () => {
    const harness = createHarness();
    let bot = harness.service();
    await bot.process(message(1, '/partner_new balakovo'));
    expect(harness.getDraft()?.step).toBe('TITLE');
    bot = harness.service();
    expect((await bot.process(message(2, '/partner_status'))).text).toContain(
      'Название точки',
    );
    for (const [id, text] of [
      [3, 'Автосервис'],
      [4, 'SERVICE'],
      [5, '/skip'],
      [6, '52.0, 47.8'],
      [7, 'ул. Ленина, 1'],
    ] as const)
      await bot.process(message(id, text));
    expect(harness.getDraft()?.step).toBe('CONTACT_CHOICE');
    const addRevision = harness.getDraft()!.revision;
    await bot.process(callback(8, `pp:add:${addRevision}`));
    expect(
      (await bot.process(callback(9, `pp:add:${addRevision}`))).callbackText,
    ).toContain('устарела');
    expect(harness.getDraft()?.step).toBe('CONTACT_TYPE');
    await bot.process(message(10, 'PHONE'));
    await bot.process(message(11, 'Позвонить'));
    await bot.process(message(12, '+79990000000'));
    await bot.process(callback(13, `pp:done:${harness.getDraft()!.revision}`));
    await bot.process(message(14, '2026-10-10T12:00+04:00'));
    await bot.process(message(15, '2026-10-20T12:00+04:00'));
    const colorRevision = harness.getDraft()!.revision;
    await bot.process(callback(16, `pp:color:285C78:${colorRevision}`));
    expect(harness.getDraft()?.step).toBe('TEXT_COLOR');
    expect(
      (await bot.process(callback(17, `pp:color:285C78:${colorRevision}`)))
        .callbackText,
    ).toContain('устарела');
    await bot.process(
      callback(18, `pp:color:FDFBF4:${harness.getDraft()!.revision}`),
    );
    expect(harness.getDraft()?.step).toBe('IMAGE');
    await bot.process(message(181, '/skip'));
    await bot.process(message(182, '/skip'));
    expect(harness.getDraft()?.step).toBe('PREVIEW');
    expect(harness.createdPoints).toHaveLength(0);
    const confirm = callback(19, `pp:confirm:${harness.getDraft()!.revision}`);
    await bot.process(confirm);
    expect(harness.createdPoints).toHaveLength(1);
    expect(harness.createdPoints[0]).toMatchObject({
      status: 'ACTIVE',
      title: 'Автосервис',
      backgroundColor: '#285C78',
      textColor: '#FDFBF4',
    });
    expect(harness.getDraft()).toBeNull();
    expect((await bot.process(confirm)).duplicate).toBe(true);
    expect(
      (await bot.process(callback(20, `pp:confirm:10`))).callbackText,
    ).toContain('устарела');
    expect(harness.createdPoints).toHaveLength(1);
  });

  it('does not activate a banner or point when the wizard is cancelled', async () => {
    const harness = createHarness();
    const bot = harness.service();
    await bot.process(message(1, '/partner_banner balakovo'));
    expect(harness.getDraft()?.step).toBe('TITLE');
    await bot.process(message(2, '/partner_cancel'));
    expect(harness.getDraft()).toBeNull();
    expect(harness.banners).toHaveLength(0);
    expect(harness.createdPoints).toHaveLength(0);
  });

  it('does not advance after a low-contrast color callback', async () => {
    const harness = createHarness();
    const bot = harness.service();
    await bot.process(message(60, '/partner_new balakovo'));
    for (const [id, text] of [
      [61, 'Мастерская'],
      [62, 'Сервис'],
      [63, '/skip'],
      [64, '52.0, 47.8'],
      [65, '/skip'],
    ] as const)
      await bot.process(message(id, text));
    await bot.process(callback(66, `pp:done:${harness.getDraft()!.revision}`));
    await bot.process(message(67, '2026-10-10T12:00+04:00'));
    await bot.process(message(68, '2026-10-20T12:00+04:00'));
    await bot.process(
      callback(69, `pp:color:F7F4EA:${harness.getDraft()!.revision}`),
    );
    const revision = harness.getDraft()!.revision;
    const rejected = await bot.process(
      callback(70, `pp:color:FDFBF4:${revision}`),
    );
    expect(rejected.callbackText).toContain('контрастную');
    expect(harness.getDraft()).toMatchObject({ step: 'TEXT_COLOR', revision });
    await bot.process(callback(71, `pp:color:14241E:${revision}`));
    expect(harness.getDraft()?.step).toBe('IMAGE');
    await bot.process(message(72, '/skip'));
    await bot.process(message(73, '/skip'));
    expect(harness.getDraft()?.step).toBe('PREVIEW');
  });

  it('enables a banner only after its own confirmation and never changes the linked point', async () => {
    const harness = createHarness();
    const bot = harness.service();
    harness.tx.partnerPoint.findUnique.mockResolvedValue({
      id: POINT_ID,
      cityId: 'balakovo',
      status: 'ACTIVE',
    });
    await bot.process(message(30, '/partner_banner balakovo'));
    const values = [
      'Партнёр дня',
      'Полезное предложение',
      'Подробнее',
      'https://example.com',
      POINT_ID,
      '2026-10-10T12:00+04:00',
      '2026-10-20T12:00+04:00',
    ];
    for (let index = 0; index < values.length; index += 1)
      await bot.process(message(31 + index, values[index]));
    expect(harness.getDraft()?.step).toBe('PREVIEW');
    expect(harness.banners).toHaveLength(0);
    harness.tx.partnerPoint.findUnique.mockResolvedValueOnce({
      id: POINT_ID,
      cityId: 'balakovo',
      status: 'PAUSED',
    });
    await bot.process(
      callback(38, `pp:confirm:${harness.getDraft()!.revision}`),
    );
    expect(harness.banners).toHaveLength(0);
    expect(harness.getDraft()?.step).toBe('PREVIEW');
    await bot.process(
      callback(39, `pp:confirm:${harness.getDraft()!.revision}`),
    );
    expect(harness.banners).toHaveLength(1);
    expect(harness.banners[0]).toMatchObject({
      enabled: true,
      partnerPointId: POINT_ID,
      title: 'Партнёр дня',
    });
    expect(harness.tx.partnerPoint.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.partnerPoint.update).not.toHaveBeenCalled();
  });

  it('lets the owner select the linked banner point with a short callback', async () => {
    const harness = createHarness();
    const bot = harness.service();
    harness.tx.partnerPoint.findMany.mockResolvedValue([
      { id: POINT_ID, title: 'Партнёрская точка' },
    ]);
    await bot.process(message(560, '/partner_banner balakovo'));
    for (const [index, value] of [
      'Заголовок',
      'Текст',
      'Подробнее',
      'https://example.com',
    ].entries())
      await bot.process(message(561 + index, value));
    const revision = harness.getDraft()!.revision;
    const response = await bot.process(callback(565, `pp:bp:0:${revision}`));
    expect(response.text).toContain('Начало баннера');
    expect(harness.getDraft()?.payload).toMatchObject({
      partnerPointId: POINT_ID,
    });
    expect(Buffer.byteLength(`pp:bp:0:${revision}`)).toBeLessThanOrEqual(64);
  });

  it('ends a banner without changing its linked point', async () => {
    const harness = createHarness();
    const bot = harness.service();
    const response = await bot.process(
      message(570, '/partner_banner_end balakovo'),
    );
    expect(response.text).toContain('Баннер завершён');
    const bannerUpdates = harness.tx.partnerCityBanner.updateMany.mock
      .calls as unknown as Array<Array<unknown>>;
    expect(bannerUpdates[0]?.[0]).toMatchObject({
      where: { cityId: 'balakovo' },
      data: { enabled: false },
    });
    expect(harness.tx.partnerPoint.updateMany).not.toHaveBeenCalled();
  });

  it('stages edits without changing the point before confirmation and keeps financial commands private', async () => {
    const harness = createHarness();
    const bot = harness.service();
    harness.tx.partnerPoint.findUnique.mockResolvedValue({
      id: POINT_ID,
      cityId: 'balakovo',
      status: 'ACTIVE',
      title: 'Старая точка',
      category: 'SERVICE',
      backgroundColor: '#263D35',
      textColor: '#FDFBF4',
      description: null,
      latitude: 52,
      longitude: 47.8,
      displayAddress: null,
      startsAt: new Date('2026-10-10T08:00:00Z'),
      endsAt: new Date('2026-10-20T08:00:00Z'),
      contacts: [],
    });
    await bot.process(message(50, `/partner_edit ${POINT_ID}`));
    expect(harness.getDraft()?.step).toBe('TITLE');
    expect(harness.getDraft()?.payload).toMatchObject({
      backgroundColor: '#263D35',
      textColor: '#FDFBF4',
    });
    expect(harness.tx.partnerPoint.update).not.toHaveBeenCalled();
    await bot.process(message(51, '/partner_cancel'));
    expect(harness.tx.partnerPoint.update).not.toHaveBeenCalled();

    await bot.process(message(52, `/partner_price point ${POINT_ID} 1250.50`));
    expect(harness.tx.partnerPoint.updateMany).toHaveBeenCalledWith({
      where: { id: POINT_ID },
      data: { agreedPriceKopecks: 125050n },
    });
    await bot.process(message(53, `/partner_paid point ${POINT_ID}`));
    const calls = harness.tx.partnerPoint.updateMany.mock
      .calls as unknown as Array<[{ where: object; data: { paidAt: Date } }]>;
    const paidCall = calls.at(-1)?.[0];
    if (!paidCall) throw new Error('Expected manual payment update');
    expect(paidCall.where).toEqual({
      id: POINT_ID,
      paidAt: null,
      agreedPriceKopecks: { not: null },
    });
    expect(paidCall.data.paidAt).toBeInstanceOf(Date);
  });

  it('rolls back update acknowledgement when a domain operation fails', async () => {
    const harness = createHarness();
    harness.tx.partnerBotDraft.upsert.mockRejectedValueOnce(
      new Error('DB_UNAVAILABLE'),
    );
    await expect(
      harness.service().process(message(20, '/partner_new balakovo')),
    ).rejects.toThrow('DB_UNAVAILABLE');
    expect(harness.processed.has(20n)).toBe(false);
  });
});
