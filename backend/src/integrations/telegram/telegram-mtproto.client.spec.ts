import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { Api, helpers, utils } from 'telegram';
import type { EventBuilder } from 'telegram/events/common';

import {
  classifyTelegramConnectionError,
  TelegramMtprotoClient,
} from './telegram-mtproto.client';

describe('TelegramMtprotoClient', () => {
  const apiHash = 'test-only-api-hash';
  const session = 'test-only-session';

  let configService: { get: jest.Mock };
  let runtimeConfig: Record<string, string>;
  let factory: { create: jest.Mock };
  let gramClient: {
    connect: jest.Mock;
    checkAuthorization: jest.Mock;
    getEntity: jest.Mock;
    getDialogs: jest.Mock;
    getMessages: jest.Mock;
    addEventHandler: jest.Mock;
    removeEventHandler: jest.Mock;
    disconnect: jest.Mock;
    connected: boolean;
    onError?: (error: Error) => Promise<void>;
  };
  let client: TelegramMtprotoClient;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let registeredHandlers: Array<(event: { message: unknown }) => void>;
  let registeredBuilders: EventBuilder[];

  beforeEach(() => {
    runtimeConfig = {
      TELEGRAM_API_ID: '12345',
      TELEGRAM_API_HASH: apiHash,
      TELEGRAM_SESSION: session,
      TELEGRAM_SOURCE_CHAT_ID: '-100123',
    };
    configService = {
      get: jest.fn((key: string) => runtimeConfig[key]),
    };
    registeredHandlers = [];
    registeredBuilders = [];
    gramClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      checkAuthorization: jest.fn().mockResolvedValue(true),
      getEntity: jest.fn().mockResolvedValue({}),
      getDialogs: jest.fn().mockResolvedValue([]),
      getMessages: jest.fn().mockResolvedValue([]),
      addEventHandler: jest.fn(
        (
          handler: (event: { message: unknown }) => void,
          builder: EventBuilder,
        ) => {
          registeredHandlers.push(handler);
          registeredBuilders.push(builder);
        },
      ),
      removeEventHandler: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
      connected: true,
    };
    factory = {
      create: jest.fn().mockReturnValue(gramClient),
    };
    client = new TelegramMtprotoClient(
      configService as unknown as ConfigService,
      factory,
    );
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stays disabled without complete credentials and makes no client', async () => {
    configService.get.mockReturnValue(undefined);

    expect(client.isAvailable()).toBe(false);
    await expect(client.connect()).rejects.toMatchObject({ code: 'DISABLED' });
    expect(factory.create).not.toHaveBeenCalled();
  });

  it('returns a controlled invalid-session error', async () => {
    factory.create.mockImplementation(() => {
      throw new Error(`invalid ${session}`);
    });

    const error = await client.connect().catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'INVALID_SESSION',
      message: 'Telegram MTProto session is invalid',
    });
    expect(String(error)).not.toContain(session);
  });

  it('returns a controlled auth error for an unauthorized session', async () => {
    gramClient.checkAuthorization.mockResolvedValue(false);

    await expect(client.connect()).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
    expect(gramClient.disconnect).toHaveBeenCalled();
  });

  it('returns a controlled source-not-found error', async () => {
    gramClient.getEntity.mockRejectedValue(new Error('private upstream data'));

    await expect(client.connect()).rejects.toMatchObject({
      code: 'SOURCE_NOT_FOUND',
      message: 'Configured Telegram source could not be resolved',
    });
  });

  it('resolves a marked numeric supergroup ID through exact dialog fallback', async () => {
    const sourceChatId = '-1001989574928';
    const sourceEntity = { source: true };
    runtimeConfig.TELEGRAM_SOURCE_CHAT_ID = sourceChatId;
    gramClient.getEntity.mockRejectedValue(
      new Error('access hash unavailable'),
    );
    gramClient.getDialogs.mockResolvedValue([
      { id: helpers.returnBigInt(sourceChatId), entity: sourceEntity },
    ]);
    jest.spyOn(utils, 'getPeerId').mockReturnValue(sourceChatId);

    const source = await client.connect();
    const getEntityCalls = gramClient.getEntity.mock.calls as unknown[][];
    const requestedPeer = getEntityCalls[0]?.[0];

    expect(requestedPeer).toBeInstanceOf(Api.PeerChannel);
    expect((requestedPeer as Api.PeerChannel).channelId.toString()).toBe(
      '1989574928',
    );
    expect(gramClient.getDialogs).toHaveBeenCalledWith({ limit: undefined });
    expect(source).toMatchObject({
      entity: sourceEntity,
      chatId: sourceChatId,
    });
  });

  it('keeps resolving username sources directly', async () => {
    const sourceEntity = { source: true };
    runtimeConfig.TELEGRAM_SOURCE_CHAT_ID = 'road_radar_source';
    gramClient.getEntity.mockResolvedValue(sourceEntity);
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');

    await expect(client.connect()).resolves.toMatchObject({
      entity: sourceEntity,
      chatId: '-100123',
    });

    expect(gramClient.getEntity).toHaveBeenCalledWith('road_radar_source');
    expect(gramClient.getDialogs).not.toHaveBeenCalled();
  });

  it('returns source-not-found for an unknown marked numeric ID', async () => {
    runtimeConfig.TELEGRAM_SOURCE_CHAT_ID = '-1001989574928';
    gramClient.getEntity.mockRejectedValue(new Error('not cached'));
    gramClient.getDialogs.mockResolvedValue([]);

    await expect(client.connect()).rejects.toMatchObject({
      code: 'SOURCE_NOT_FOUND',
    });
  });

  it('does not accept another dialog as the configured numeric source', async () => {
    const otherEntity = { source: false };
    runtimeConfig.TELEGRAM_SOURCE_CHAT_ID = '-1001989574928';
    gramClient.getEntity.mockResolvedValue(otherEntity);
    gramClient.getDialogs.mockResolvedValue([
      { id: helpers.returnBigInt('-1001111111111'), entity: otherEntity },
    ]);
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-1001111111111');

    await expect(client.connect()).rejects.toMatchObject({
      code: 'SOURCE_NOT_FOUND',
    });
  });

  it('does not expose credentials in source resolution errors or logs', async () => {
    gramClient.getEntity.mockRejectedValue(
      new Error(`resolve failed ${apiHash} ${session}`),
    );
    gramClient.getDialogs.mockRejectedValue(
      new Error(`dialogs failed ${apiHash} ${session}`),
    );

    const error = await client.connect().catch((caught: unknown) => caught);
    const loggedData = JSON.stringify(warnSpy.mock.calls);

    expect(error).toMatchObject({ code: 'SOURCE_NOT_FOUND' });
    expect(String(error)).not.toContain(apiHash);
    expect(String(error)).not.toContain(session);
    expect(loggedData).not.toContain(apiHash);
    expect(loggedData).not.toContain(session);
  });

  it('does not expose secrets in connection errors or logs', async () => {
    gramClient.connect.mockRejectedValue(
      new Error(`failed ${apiHash} ${session}`),
    );

    const error = await client.connect().catch((caught: unknown) => caught);
    const loggedData = JSON.stringify(warnSpy.mock.calls);

    expect(error).toMatchObject({ code: 'CONNECTION_ERROR' });
    expect(String(error)).not.toContain(apiHash);
    expect(String(error)).not.toContain(session);
    expect(loggedData).not.toContain(apiHash);
    expect(loggedData).not.toContain(session);
  });

  it.each([
    [
      Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }),
      'CONNECTION_RESET',
    ],
    [
      Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' }),
      'TIMEOUT',
    ],
    [
      Object.assign(new Error('getaddrinfo failed'), { code: 'ENOTFOUND' }),
      'DNS',
    ],
    [new Error('AUTH_KEY_UNREGISTERED'), 'AUTH'],
    [new Error('FLOOD_WAIT_30'), 'FLOOD'],
    [
      Object.assign(new Error('closed'), { code: 'EPIPE' }),
      'CONNECTION_CLOSED',
    ],
    [Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }), 'NETWORK'],
    [Object.assign(new Error('rpc failed'), { name: 'RPCError' }), 'RPC'],
    [new Error('unexpected failure'), 'UNKNOWN'],
  ] as const)('classifies %p as %s', (error, expected) => {
    expect(classifyTelegramConnectionError(error)).toBe(expected);
  });

  it('logs safe structured connection diagnostics and updates counters', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    await client.connect();
    const phone = '+79991234567';
    const error = Object.assign(
      new Error(
        `socket reset session=${session} api_hash=${apiHash} api=${runtimeConfig.TELEGRAM_API_ID} phone=${phone}`,
      ),
      {
        code: 'ECONNRESET',
        errno: -54,
        syscall: 'read',
        address: '149.154.167.50',
      },
    );

    await gramClient.onError?.(error);

    const loggedData = JSON.stringify(warnSpy.mock.calls);
    expect(loggedData).toContain('CONNECTION_RESET');
    expect(loggedData).toContain('KEEPALIVE');
    expect(loggedData).toContain('ECONNRESET');
    expect(loggedData).toContain('RUNNING_RECONNECTING');
    expect(loggedData).toContain('149.154.167.50');
    expect(loggedData).not.toContain(session);
    expect(loggedData).not.toContain(apiHash);
    expect(loggedData).not.toContain(phone);
    expect(loggedData).not.toContain('stack');
    expect(client.getConnectionSnapshot()).toMatchObject({
      connectionState: 'RUNNING_RECONNECTING',
      connectionErrors: 1,
      reconnectAttempts: 1,
      lastConnectionErrorCategory: 'CONNECTION_RESET',
    });
  });

  it('counts reconnect errors without starting a custom reconnect loop', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    await client.connect();

    await gramClient.onError?.(
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    );
    await gramClient.onError?.(
      Object.assign(new Error('timeout again'), { code: 'ETIMEDOUT' }),
    );

    expect(client.getConnectionSnapshot()).toMatchObject({
      connectionErrors: 2,
      reconnectAttempts: 2,
      lastConnectionErrorCategory: 'TIMEOUT',
    });
    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(gramClient.connect).toHaveBeenCalledTimes(1);
  });

  it('records successful reconnect and clears the transient state', async () => {
    jest.useFakeTimers();
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');

    try {
      await client.connect();
      gramClient.connected = false;
      await gramClient.onError?.(
        Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }),
      );
      expect(client.getConnectionSnapshot().connectionState).toBe(
        'RUNNING_RECONNECTING',
      );

      gramClient.connected = true;
      await jest.advanceTimersByTimeAsync(1_000);

      expect(client.getConnectionSnapshot()).toMatchObject({
        connectionState: 'RUNNING_CONNECTED',
        reconnectAttempts: 1,
        reconnectSuccesses: 1,
      });
      expect(JSON.stringify(logSpy.mock.calls)).toContain(
        'Telegram MTProto reconnected',
      );
      expect(factory.create).toHaveBeenCalledTimes(1);
      expect(gramClient.connect).toHaveBeenCalledTimes(1);
    } finally {
      await client.disconnect();
      jest.useRealTimers();
    }
  });

  it('notifies recovery listeners after a successful reconnect', async () => {
    jest.useFakeTimers();
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    const listener = jest.fn().mockResolvedValue(undefined);
    client.onReconnected(listener);

    try {
      await client.connect();
      gramClient.connected = false;
      await gramClient.onError?.(
        Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }),
      );
      gramClient.connected = true;
      await jest.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();

      expect(listener).toHaveBeenCalledWith('-100123');
    } finally {
      await client.disconnect();
      jest.useRealTimers();
    }
  });

  it('caps initial history and reuses one MTProto client', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');

    await Promise.all([
      client.getSourceChatId(),
      client.getRecentMessages(5_000),
    ]);

    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(gramClient.connect).toHaveBeenCalledTimes(1);
    expect(gramClient.getMessages).toHaveBeenCalledWith(expect.anything(), {
      limit: 50,
    });
  });

  it('fetches a historical page using the supplied Telegram offset', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    gramClient.getMessages.mockResolvedValue([
      { id: 98, peerId: {} },
      { id: 97, peerId: {} },
    ]);

    const page = await client.getHistoryPage(100, 99);

    expect(gramClient.getMessages).toHaveBeenCalledWith(expect.anything(), {
      limit: 100,
      offsetId: 99,
    });
    expect(page).toMatchObject({
      sourceChatId: '-100123',
      nextOffsetId: 97,
      fetched: 2,
      exhausted: true,
    });
  });

  it('fetches a bounded recovery window newer than cursor with overlap', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    gramClient.getMessages.mockResolvedValue([
      { id: 102, peerId: {} },
      { id: 101, peerId: {} },
      { id: 100, peerId: {} },
    ]);

    const batch = await client.getMessagesAfter('100', 200);

    expect(gramClient.getMessages).toHaveBeenCalledWith(expect.anything(), {
      limit: 201,
      minId: 98,
      reverse: true,
    });
    expect(batch).toMatchObject({ truncated: false });
    expect(batch.envelopes).toHaveLength(3);
  });

  it('marks recovery as truncated without loading beyond the hard batch', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    gramClient.getMessages.mockResolvedValue(
      Array.from({ length: 201 }, (_, index) => ({
        id: 301 - index,
        peerId: {},
      })),
    );

    const batch = await client.getMessagesAfter('100', 200);

    expect(batch.truncated).toBe(true);
    expect(batch.envelopes).toHaveLength(200);
  });

  it.each([null, undefined])(
    'treats editDate=%p as an ordinary history message',
    async (editDate) => {
      jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
      gramClient.getMessages.mockResolvedValue([
        { id: 1, peerId: {}, editDate },
      ]);

      const [message] = await client.getRecentMessages();

      expect(message).toMatchObject({ isEdited: false });
    },
  );

  it('treats a real editDate as an edited history message', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    gramClient.getMessages.mockResolvedValue([
      { id: 1, peerId: {}, editDate: 1_700_000_100 },
    ]);

    const [message] = await client.getRecentMessages();

    expect(message).toMatchObject({ isEdited: true });
  });

  it('subscribes with a resolvable numeric source filter', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    const listener = jest.fn();

    await client.subscribe(listener);

    expect(gramClient.addEventHandler).toHaveBeenCalledTimes(2);
    expect(registeredBuilders).toHaveLength(2);
    expect(registeredBuilders[0]?.chats).toEqual(['-100123']);
    expect(registeredBuilders[1]?.chats).toEqual(['-100123']);
    expect(registeredBuilders.every((builder) => builder.resolved)).toBe(true);
  });

  it('delivers configured-source new and edited updates', async () => {
    const sourcePeer = { source: true };
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    const listener = jest.fn();

    await client.subscribe(listener);

    const [newHandler, editedHandler] = registeredHandlers;
    const rawMessage = { peerId: sourcePeer, id: 1 };

    newHandler?.({ message: rawMessage });
    editedHandler?.({ message: rawMessage });
    await Promise.resolve();

    expect(listener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ isEdited: false, chatId: '-100123' }),
    );
    expect(listener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ isEdited: true, chatId: '-100123' }),
    );
  });

  it('ignores new and edited updates from another source', async () => {
    const sourceEntity = { source: true };
    const foreignPeer = { foreign: true };
    gramClient.getEntity.mockResolvedValue(sourceEntity);
    jest.spyOn(utils, 'getPeerId').mockImplementation((peer) => {
      const peerValue: unknown = peer;

      return peerValue === foreignPeer ? '-100999' : '-100123';
    });
    const listener = jest.fn();

    await client.subscribe(listener);

    const [newHandler, editedHandler] = registeredHandlers;
    const foreignMessage = { peerId: foreignPeer, id: 1 };

    newHandler?.({ message: foreignMessage });
    editedHandler?.({ message: foreignMessage });
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });

  it('returns a controlled error when live handler registration fails', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    gramClient.addEventHandler.mockImplementationOnce(() => {
      throw new Error(`private upstream data ${session}`);
    });

    let error: unknown;

    try {
      await client.subscribe(jest.fn());
    } catch (caught: unknown) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: 'CONNECTION_ERROR',
      message: 'Telegram MTProto live subscription failed',
    });
    expect(String(error)).not.toContain(session);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(session);
    expect(gramClient.removeEventHandler).toHaveBeenCalledTimes(2);
  });

  it('removes both live handlers when unsubscribing', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    await client.subscribe(jest.fn());

    client.unsubscribe();

    expect(gramClient.removeEventHandler).toHaveBeenCalledTimes(2);
    expect(gramClient.removeEventHandler).toHaveBeenNthCalledWith(
      1,
      registeredHandlers[0],
      registeredBuilders[0],
    );
    expect(gramClient.removeEventHandler).toHaveBeenNthCalledWith(
      2,
      registeredHandlers[1],
      registeredBuilders[1],
    );
  });

  it('disconnects the underlying GramJS client', async () => {
    jest.spyOn(utils, 'getPeerId').mockReturnValue('-100123');
    await client.connect();

    await client.disconnect();

    expect(gramClient.disconnect).toHaveBeenCalledTimes(1);
  });
});
