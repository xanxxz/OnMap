import { TELEGRAM_RUNTIME_DEDUP_LIMIT } from './telegram.constants';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';
import { TelegramMtprotoSource } from './telegram-mtproto.source';
import type { TelegramCitySourceRegistry } from './telegram-city-source.registry';
import type {
  TelegramMtprotoEnvelopeListener,
  TelegramMtprotoMessageEnvelope,
} from './telegram.types';

const CHAT_ID = '-100123';

const envelope = (
  id: number,
  overrides: Partial<TelegramMtprotoMessageEnvelope> = {},
): TelegramMtprotoMessageEnvelope => ({
  chatId: CHAT_ID,
  isChannel: false,
  isEdited: false,
  rawMessage: {
    id,
    message: `message ${id}`,
    date: 1_700_000_000 + id,
  },
  ...overrides,
});

describe('TelegramMtprotoSource', () => {
  let client: {
    isAvailable: jest.Mock;
    getSourceChatId: jest.Mock;
    getRecentMessages: jest.Mock;
    getMessagesAfter: jest.Mock;
    onReconnected: jest.Mock;
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
    disconnect: jest.Mock;
  };
  let source: TelegramMtprotoSource;

  beforeEach(() => {
    client = {
      isAvailable: jest.fn().mockReturnValue(true),
      getSourceChatId: jest.fn().mockResolvedValue(CHAT_ID),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      getMessagesAfter: jest.fn().mockResolvedValue({
        envelopes: [],
        truncated: false,
      }),
      onReconnected: jest.fn(() => jest.fn()),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    source = new TelegramMtprotoSource(
      client as unknown as TelegramMtprotoClient,
      {
        getPrimarySource: () => ({ cityId: 'balakovo', sourceChatId: CHAT_ID }),
      } as TelegramCitySourceRegistry,
    );
  });

  it('ignores messages from another chat', async () => {
    client.getRecentMessages.mockResolvedValue([
      envelope(1, { chatId: '-100-other' }),
    ]);

    await expect(source.getRecentMessages()).resolves.toEqual([]);
  });

  it('does not process an ordinary duplicate twice', async () => {
    client.getRecentMessages.mockResolvedValue([envelope(1)]);

    await expect(source.getRecentMessages()).resolves.toHaveLength(1);
    await expect(source.getRecentMessages()).resolves.toEqual([]);
  });

  it('allows an edited message as an update of the same externalId', async () => {
    client.getRecentMessages
      .mockResolvedValueOnce([envelope(1)])
      .mockResolvedValueOnce([
        envelope(1, {
          isEdited: true,
          rawMessage: {
            id: 1,
            message: 'edited message',
            date: 1_700_000_001,
            editDate: 1_700_000_100,
          },
        }),
      ]);

    const original = await source.getRecentMessages();
    const edited = await source.getRecentMessages();

    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({
      externalId: original[0]?.externalId,
      rawSourceType: 'edited_message',
    });
  });

  it('does not process the same edited version twice', async () => {
    const editedEnvelope = envelope(1, {
      isEdited: true,
      rawMessage: {
        id: 1,
        message: 'edited message',
        date: 1_700_000_001,
        editDate: 1_700_000_100,
      },
    });
    client.getRecentMessages.mockResolvedValue([editedEnvelope]);

    await expect(source.getRecentMessages()).resolves.toHaveLength(1);
    await expect(source.getRecentMessages()).resolves.toEqual([]);
  });

  it('keeps runtime dedup bounded and evicts the oldest ID', async () => {
    client.getRecentMessages.mockResolvedValue(
      Array.from({ length: TELEGRAM_RUNTIME_DEDUP_LIMIT + 1 }, (_, index) =>
        envelope(index + 1),
      ),
    );

    await expect(source.getRecentMessages()).resolves.toHaveLength(
      TELEGRAM_RUNTIME_DEDUP_LIMIT + 1,
    );

    client.getRecentMessages.mockResolvedValue([envelope(1)]);

    await expect(source.getRecentMessages()).resolves.toHaveLength(1);
  });

  it('normalizes subscribed MTProto updates before delivering them', async () => {
    let transportListener: TelegramMtprotoEnvelopeListener | undefined;
    const listener = jest.fn();

    client.subscribe.mockImplementation(
      (callback: TelegramMtprotoEnvelopeListener) => {
        transportListener = callback;

        return Promise.resolve();
      },
    );

    await source.start(listener);
    await transportListener?.(envelope(3));

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'telegram:-100123:3' }),
    );
  });

  it('ignores subscribed MTProto updates from another chat', async () => {
    let transportListener: TelegramMtprotoEnvelopeListener | undefined;
    const listener = jest.fn();

    client.subscribe.mockImplementation(
      (callback: TelegramMtprotoEnvelopeListener) => {
        transportListener = callback;

        return Promise.resolve();
      },
    );

    await source.start(listener);
    await transportListener?.(envelope(3, { chatId: '-100-other' }));

    expect(listener).not.toHaveBeenCalled();
  });

  it('blocks duplicate live messages but allows their edited version', async () => {
    let transportListener: TelegramMtprotoEnvelopeListener | undefined;
    const listener = jest.fn();

    client.subscribe.mockImplementation(
      (callback: TelegramMtprotoEnvelopeListener) => {
        transportListener = callback;

        return Promise.resolve();
      },
    );

    await source.start(listener);
    await transportListener?.(envelope(3));
    await transportListener?.(envelope(3));
    await transportListener?.(
      envelope(3, {
        isEdited: true,
        rawMessage: {
          id: 3,
          message: 'edited message 3',
          date: 1_700_000_003,
          editDate: 1_700_000_100,
        },
      }),
    );

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        externalId: 'telegram:-100123:3',
        editedAt: '2023-11-14T22:15:00.000Z',
        rawSourceType: 'edited_message',
      }),
    );
  });

  it('returns recovery messages oldest first without source-level dedup', async () => {
    client.getMessagesAfter.mockResolvedValue({
      envelopes: [envelope(102), envelope(100), envelope(101)],
      truncated: false,
    });
    const configuredSource = {
      cityId: 'balakovo',
      sourceChatId: CHAT_ID,
    };
    const cursor = {
      ...configuredSource,
      lastMessageId: '100',
      lastMessageTimestamp: '2026-09-10T12:00:00.000Z',
    };

    const first = await source.getMessagesAfter(configuredSource, cursor, 200);
    const second = await source.getMessagesAfter(configuredSource, cursor, 200);

    expect(first.messages.map((item) => item.externalId)).toEqual([
      'telegram:-100123:100',
      'telegram:-100123:101',
      'telegram:-100123:102',
    ]);
    expect(second.messages).toHaveLength(3);
    expect(client.getMessagesAfter).toHaveBeenCalledWith('100', 200);
  });

  it('forwards reconnect only for the configured source', async () => {
    let reconnect: ((sourceChatId: string) => Promise<void>) | undefined;
    client.onReconnected.mockImplementation(
      (callback: (sourceChatId: string) => Promise<void>) => {
        reconnect = callback;

        return jest.fn();
      },
    );
    const listener = jest.fn();

    source.onReconnected(listener);
    await reconnect?.(CHAT_ID);
    await reconnect?.('-100-other');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      cityId: 'balakovo',
      sourceChatId: CHAT_ID,
    });
  });

  it('stops live subscriptions through the MTProto client', async () => {
    await source.stop();

    expect(client.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('disconnects the MTProto client during Nest shutdown', async () => {
    await source.onModuleDestroy();

    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});
