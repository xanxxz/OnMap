import type { PrismaService } from '../../../database/prisma.service';
import type { TelegramMessage } from '../telegram.types';

jest.mock('../../../database/prisma.service', () => ({
  PrismaService: class {},
}));

import { TelegramSourceCursorStore } from './telegram-source-cursor.store';

const source = { cityId: 'balakovo', sourceChatId: '-1001' } as const;

const message = (
  id: number,
  overrides: Partial<TelegramMessage> = {},
): TelegramMessage => ({
  externalId: `telegram:-1001:${id}`,
  source: 'TELEGRAM',
  cityId: 'balakovo',
  chatId: '-1001',
  text: 'авария',
  publishedAt: '2026-09-10T12:00:00.000Z',
  rawSourceType: 'message',
  ...overrides,
});

describe('TelegramSourceCursorStore', () => {
  let queryRaw: jest.Mock;
  let store: TelegramSourceCursorStore;

  beforeEach(() => {
    queryRaw = jest.fn();
    store = new TelegramSourceCursorStore({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  });

  it('loads a durable cursor by city and source', async () => {
    queryRaw.mockResolvedValue([
      {
        cityId: 'balakovo',
        sourceChatId: '-1001',
        lastMessageId: 100n,
        lastMessageTimestamp: new Date('2026-09-10T12:00:00.000Z'),
      },
    ]);

    await expect(store.get(source)).resolves.toEqual({
      cityId: 'balakovo',
      sourceChatId: '-1001',
      lastMessageId: '100',
      lastMessageTimestamp: '2026-09-10T12:00:00.000Z',
    });
  });

  it('returns null when a source has no cursor', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(store.get(source)).resolves.toBeNull();
  });

  it('creates a zero baseline when history is empty', async () => {
    queryRaw.mockResolvedValue([
      {
        cityId: 'balakovo',
        sourceChatId: '-1001',
        lastMessageId: 0n,
        lastMessageTimestamp: null,
      },
    ]);

    await expect(store.initialize(source, null)).resolves.toMatchObject({
      lastMessageId: '0',
      lastMessageTimestamp: null,
    });
    expect(queryRaw.mock.calls[0]).toContain(0n);
  });

  it('initializes from the latest bounded history message', async () => {
    queryRaw.mockResolvedValue([
      {
        cityId: 'balakovo',
        sourceChatId: '-1001',
        lastMessageId: 101n,
        lastMessageTimestamp: new Date('2026-09-10T12:00:00.000Z'),
      },
    ]);

    await store.initialize(source, message(101));

    expect(queryRaw.mock.calls[0]).toContain(101n);
  });

  it('advances with an edited message version', async () => {
    queryRaw.mockResolvedValue([
      {
        cityId: 'balakovo',
        sourceChatId: '-1001',
        lastMessageId: 102n,
        lastMessageTimestamp: new Date('2026-09-10T12:05:00.000Z'),
      },
    ]);

    const cursor = await store.advance(
      source,
      message(102, {
        editedAt: '2026-09-10T12:05:00.000Z',
        rawSourceType: 'edited_message',
      }),
    );

    expect(cursor).toMatchObject({
      lastMessageId: '102',
      lastMessageTimestamp: '2026-09-10T12:05:00.000Z',
    });
  });
});
