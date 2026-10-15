import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service';
jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
import { PushCampaignBotService } from './push-campaign-bot.service';

const OWNER = 12345;
const message = (updateId: number, text: string, from = OWNER) => ({
  update_id: updateId,
  message: { text, from: { id: from }, chat: { id: from, type: 'private' } },
});
const callback = (updateId: number, data: string) => ({
  update_id: updateId,
  callback_query: {
    data,
    from: { id: OWNER },
    message: { chat: { id: OWNER, type: 'private' } },
  },
});

describe('PushCampaignBotService owner-only wizard', () => {
  let draft: { step: string; revision: number; payload: unknown } | null;
  const processed = new Set<bigint>();
  const createCampaign = jest.fn().mockResolvedValue({ id: 'campaign-1' });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
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
    pushBotDraft: {
      findUnique: jest.fn(() => Promise.resolve(draft)),
      upsert: jest.fn(
        ({
          create,
          update,
        }: {
          create: typeof draft;
          update: typeof draft;
        }) => {
          draft = draft ? update : create;
          return Promise.resolve(draft);
        },
      ),
      delete: jest.fn(() => {
        draft = null;
        return Promise.resolve(null);
      }),
    },
    partnerBotDraft: { findUnique: jest.fn().mockResolvedValue(null) },
    pushDevice: { count: jest.fn().mockResolvedValue(1) },
    pushCampaign: { create: createCampaign },
    pushCampaignCitySchedule: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  const config = {
    get: (key: string) =>
      key === 'TELEGRAM_PARTNER_OWNER_IDS' ? String(OWNER) : undefined,
  } as ConfigService;
  const service = new PushCampaignBotService(config, prisma);
  const previous = process.env.PUSH_ENQUEUE_ENABLED;

  beforeEach(() => {
    draft = null;
    processed.clear();
    jest.clearAllMocks();
    process.env.PUSH_ENQUEUE_ENABLED = 'true';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.PUSH_ENQUEUE_ENABLED;
    else process.env.PUSH_ENQUEUE_ENABLED = previous;
  });

  it('rejects a foreign sender and non-private chat', async () => {
    expect(await service.shouldHandle(message(1, '/push_new', 999))).toBe(
      false,
    );
    expect(
      await service.shouldHandle({
        ...message(2, '/push_new'),
        message: {
          ...message(2, '/push_new').message,
          chat: { id: OWNER, type: 'group' },
        },
      }),
    ).toBe(false);
    await expect(service.process(message(3, '/push_new', 999))).rejects.toThrow(
      'PUSH_BOT_UNAUTHORIZED',
    );
  });

  it('persists the draft and requires a fresh explicit confirmation exactly once', async () => {
    await service.process(message(10, '/push_new'));
    expect(draft?.step).toBe('CITIES');
    await service.process(message(11, 'все'));
    await service.process(message(12, 'Новости OnMap'));
    await service.process(message(13, 'Тестовая новость'));
    const preview = await service.process(message(14, 'сейчас'));
    expect(preview.text).toContain('Europe/Saratov');
    expect(createCampaign).not.toHaveBeenCalled();
    const confirmation = preview.keyboard?.inline_keyboard
      .flat()
      .find((button) =>
        button.callback_data.endsWith(':confirm'),
      )?.callback_data;
    expect(confirmation).toMatch(/^pc:/u);
    await service.process(callback(15, confirmation!));
    expect(createCampaign).toHaveBeenCalledTimes(1);
    expect(tx.pushCampaignCitySchedule.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          cityId: 'balakovo',
          timeZone: 'Europe/Saratov',
        }),
      ],
    });
    const duplicate = await service.process(callback(15, confirmation!));
    expect(duplicate.duplicate).toBe(true);
    const stale = await service.process(callback(16, confirmation!));
    expect(stale.callbackText).toBe('Кнопка устарела');
    expect(createCampaign).toHaveBeenCalledTimes(1);
  });

  it('builds a one-time schedule through local-time inline buttons', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T08:00:00.000Z'));
    try {
      await service.process(message(30, '/push_new'));
      await service.process(message(31, 'все'));
      await service.process(message(32, 'Новости'));
      await service.process(message(33, 'Текст'));
      const revision = () => draft?.revision ?? -1;
      await service.process(callback(34, `pc:mode:once:${revision()}`));
      await service.process(callback(35, `pc:date:day0:${revision()}`));
      await service.process(callback(36, `pc:date:hour14:${revision()}`));
      const preview = await service.process(
        callback(37, `pc:date:minute30:${revision()}`),
      );
      expect(draft?.step).toBe('PREVIEW');
      expect(preview.text).toContain('2026-10-15 14:30 Europe/Saratov');
      expect(createCampaign).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
