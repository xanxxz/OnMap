import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.mock('../persistence/telegram-road-event-realtime.bridge', () => ({
  TelegramRoadEventRealtimeBridge: class {},
}));
jest.mock('../../../database/prisma.service', () => ({
  PrismaService: class {},
}));

import type { TelegramDryRunIngestionPipeline } from '../ingestion/telegram-dry-run-ingestion.pipeline';
import type {
  NormalizedTelegramEvent,
  TelegramDryRunIngestionInput,
  TelegramDryRunIngestionResult,
} from '../ingestion/telegram-ingestion.types';
import type { TelegramRoadEventRealtimeBridge } from '../persistence/telegram-road-event-realtime.bridge';
import type { TelegramMtprotoSource } from '../telegram-mtproto.source';
import type {
  TelegramCitySource,
  TelegramMessage,
  TelegramMessageListener,
  TelegramReconnectListener,
  TelegramSourceCursor,
} from '../telegram.types';

import { TelegramIngestionRuntimeService } from './telegram-ingestion-runtime.service';
import { TelegramRuntimeReviewLogger } from './telegram-runtime-review.logger';
import { TelegramRuntimeContextStore } from './telegram-runtime-context.store';
import type { TelegramSourceCursorStore } from './telegram-source-cursor.store';
import type { DpsActivityTracker } from '../../../road-events/dps-activity-tracker.service';

const CHAT_ID = '-1001';

const message = (
  id: number,
  overrides: Partial<TelegramMessage> = {},
): TelegramMessage => ({
  externalId: `telegram:${CHAT_ID}:${id}`,
  source: 'TELEGRAM',
  cityId: 'balakovo',
  chatId: CHAT_ID,
  text: 'авария на комарова',
  publishedAt: new Date(Date.UTC(2026, 7, 31, 8, id)).toISOString(),
  rawSourceType: 'message',
  ...overrides,
});

const normalizedEvent = (
  overrides: Partial<NormalizedTelegramEvent> = {},
): NormalizedTelegramEvent => ({
  source: 'TELEGRAM',
  cityId: 'balakovo',
  telegramMessageId: `telegram:${CHAT_ID}:1`,
  externalId: `telegram:${CHAT_ID}:1`,
  sourceChatId: CHAT_ID,
  timestamp: '2026-08-31T08:01:00.000Z',
  messageVersion: '2026-08-31T08:01:00.000Z',
  eventType: 'ACCIDENT',
  intent: 'REPORT',
  state: 'ACTIVE',
  sourceText: 'авария на комарова',
  locationInput: 'комарова',
  canonicalLocationId: 'komarova',
  canonicalLocationTitle: 'Улица Комарова',
  latitude: 52.02,
  longitude: 47.8,
  geometry: { type: 'Point', coordinates: [47.8, 52.02] },
  locationPrecision: 'LANDMARK',
  geometryProvider: null,
  geometryStatus: null,
  locationConfidence: 0.99,
  parserConfidence: 0.9,
  contextUsed: false,
  replyContextUsed: false,
  resolverStatus: 'RESOLVED',
  decision: 'CREATE',
  reason: 'READY_TO_CREATE',
  ...overrides,
});

const pipelineResult = (
  events: readonly NormalizedTelegramEvent[],
  matched = true,
): TelegramDryRunIngestionResult => ({
  parserResult: {
    matched,
    eventType: events[0]?.eventType ?? 'OTHER',
    intent: events[0]?.intent ?? 'NOISE',
    state: events[0]?.state ?? 'UNKNOWN',
    locationText: events[0]?.locationInput ?? null,
    locationAlias: events[0]?.canonicalLocationId ?? null,
    locations: [],
    locationResolutionAllowed: matched,
    confidence: events[0]?.parserConfidence ?? 0,
    matchedTerms: [],
    contextUsed: events[0]?.contextUsed ?? false,
  },
  events,
});

interface SetupOptions {
  readonly enabled?: boolean;
  readonly available?: boolean;
  readonly history?: readonly TelegramMessage[];
  readonly process?: jest.Mock;
  readonly apply?: jest.Mock;
  readonly recordReviewLog?: jest.Mock;
  readonly reviewLogger?: TelegramRuntimeReviewLogger;
  readonly citySources?: readonly { cityId: string; sourceChatId: string }[];
  readonly cursors?: readonly TelegramSourceCursor[];
  readonly recoveryMessages?: readonly TelegramMessage[];
  readonly recoveryTruncated?: boolean;
  readonly getMessagesAfter?: jest.Mock;
  readonly recordUnlocated?: jest.Mock;
  readonly clearDpsObservation?: jest.Mock;
}

const setup = (options: SetupOptions = {}) => {
  let listener: TelegramMessageListener | undefined;
  let reconnectListener: TelegramReconnectListener | undefined;
  const configService = {
    get: jest.fn((key: string) =>
      key === 'TELEGRAM_INGESTION_ENABLED' && options.enabled !== false
        ? 'true'
        : undefined,
    ),
  };
  const source = {
    isAvailable: jest.fn().mockReturnValue(options.available !== false),
    getConnectionSnapshot: jest.fn().mockReturnValue({
      connectionState: 'RUNNING_CONNECTED',
      connectionErrors: 0,
      reconnectAttempts: 0,
      reconnectSuccesses: 0,
      lastConnectionErrorAt: null,
      lastConnectionErrorCategory: null,
      lastConnectedAt: '2026-08-31T08:00:00.000Z',
      lastDisconnectedAt: null,
    }),
    getSourceChatId: jest.fn().mockResolvedValue(CHAT_ID),
    getCitySources: jest
      .fn()
      .mockResolvedValue(
        options.citySources ?? [{ cityId: 'balakovo', sourceChatId: CHAT_ID }],
      ),
    getRecentMessages: jest.fn().mockResolvedValue(options.history ?? []),
    getMessagesAfter:
      options.getMessagesAfter ??
      jest.fn().mockResolvedValue({
        messages: options.recoveryMessages ?? [],
        truncated: options.recoveryTruncated ?? false,
      }),
    onReconnected: jest.fn((callback: TelegramReconnectListener) => {
      reconnectListener = callback;

      return jest.fn();
    }),
    start: jest.fn((callback: TelegramMessageListener) => {
      listener = callback;
      return Promise.resolve();
    }),
    stop: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const process =
    options.process ??
    jest.fn().mockResolvedValue(pipelineResult([normalizedEvent()]));
  const apply =
    options.apply ??
    jest.fn().mockResolvedValue({
      status: 'CREATED',
      roadEventId: 'event-1',
    });
  const context = new TelegramRuntimeContextStore();
  const recordReviewLog =
    options.recordReviewLog ?? jest.fn().mockResolvedValue(undefined);
  const initializeReviewLog = jest.fn().mockResolvedValue(undefined);
  const reviewLogger =
    options.reviewLogger ??
    ({
      initialize: initializeReviewLog,
      record: recordReviewLog,
    } as unknown as TelegramRuntimeReviewLogger);
  const recordUnlocated = options.recordUnlocated ?? jest.fn();
  const clearDpsObservation = options.clearDpsObservation ?? jest.fn();
  const storedCursors = new Map<string, TelegramSourceCursor>(
    (options.cursors ?? []).map((cursor) => [
      `${cursor.cityId}:${cursor.sourceChatId}`,
      cursor,
    ]),
  );
  const cursorStore = {
    get: jest.fn((source: TelegramCitySource) =>
      Promise.resolve(
        storedCursors.get(`${source.cityId}:${source.sourceChatId}`) ?? null,
      ),
    ),
    initialize: jest.fn(
      (source: TelegramCitySource, baseline: TelegramMessage | null) => {
        const cursor = cursorFor(source, baseline);
        storedCursors.set(`${source.cityId}:${source.sourceChatId}`, cursor);

        return Promise.resolve(cursor);
      },
    ),
    advance: jest.fn(
      (source: TelegramCitySource, incoming: TelegramMessage) => {
        const cursor = cursorFor(source, incoming);
        const key = `${source.cityId}:${source.sourceChatId}`;
        const existing = storedCursors.get(key);
        const advanced =
          existing === undefined ||
          BigInt(cursor.lastMessageId) >= BigInt(existing.lastMessageId)
            ? cursor
            : existing;
        storedCursors.set(key, advanced);

        return Promise.resolve(advanced);
      },
    ),
  };
  const service = new TelegramIngestionRuntimeService(
    configService as unknown as ConfigService,
    source as unknown as TelegramMtprotoSource,
    { process } as unknown as TelegramDryRunIngestionPipeline,
    { apply } as unknown as TelegramRoadEventRealtimeBridge,
    context,
    reviewLogger,
    cursorStore as unknown as TelegramSourceCursorStore,
    {
      recordUnlocated,
      clear: clearDpsObservation,
    } as unknown as DpsActivityTracker,
  );

  return {
    service,
    source,
    process,
    apply,
    context,
    recordReviewLog,
    initializeReviewLog,
    recordUnlocated,
    clearDpsObservation,
    cursorStore,
    storedCursors,
    emit: async (incoming: TelegramMessage) => {
      if (listener === undefined) {
        throw new Error('listener not registered');
      }

      await listener(incoming);
    },
    reconnect: async (sourceToRecover?: TelegramCitySource) => {
      if (reconnectListener === undefined) {
        throw new Error('reconnect listener not registered');
      }

      await reconnectListener(
        sourceToRecover ?? { cityId: 'balakovo', sourceChatId: CHAT_ID },
      );
      await Promise.resolve();
      await Promise.resolve();
    },
  };
};

const cursorFor = (
  source: TelegramCitySource,
  incoming: TelegramMessage | null,
): TelegramSourceCursor => ({
  cityId: source.cityId,
  sourceChatId: source.sourceChatId,
  lastMessageId:
    incoming?.externalId.slice(incoming.externalId.lastIndexOf(':') + 1) ?? '0',
  lastMessageTimestamp:
    incoming === null ? null : (incoming.editedAt ?? incoming.publishedAt),
});

const durableCursor = (
  id: number,
  cityId = 'balakovo',
  sourceChatId = CHAT_ID,
): TelegramSourceCursor => ({
  cityId,
  sourceChatId,
  lastMessageId: String(id),
  lastMessageTimestamp: new Date(Date.UTC(2026, 7, 31, 8, id)).toISOString(),
});

describe('TelegramIngestionRuntimeService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('does not connect when the feature flag is disabled', async () => {
    const { service, source } = setup({ enabled: false });

    await service.start();

    expect(service.getSnapshot().status).toBe('DISABLED');
    expect(source.getCitySources).not.toHaveBeenCalled();
    expect(source.start).not.toHaveBeenCalled();
  });

  it('stays controlled and disabled when credentials are incomplete', async () => {
    const { service, source } = setup({ available: false });

    await expect(service.start()).resolves.toBeUndefined();

    expect(service.getSnapshot().status).toBe('DISABLED');
    expect(source.start).not.toHaveBeenCalled();
  });

  it('resolves the source, seeds history, and registers one live subscription', async () => {
    const history = [message(1)];
    const { service, source, context } = setup({ history });

    await service.start();

    expect(source.getCitySources).toHaveBeenCalledTimes(1);
    expect(source.getRecentMessages).toHaveBeenCalledTimes(1);
    expect(source.start).toHaveBeenCalledTimes(1);
    expect(context.size()).toBe(1);
    expect(service.getSnapshot().status).toBe('RUNNING');
    expect(service.getSnapshot().connection.connectionState).toBe(
      'RUNNING_CONNECTED',
    );
  });

  it('does not persist startup history', async () => {
    const { service, apply } = setup({ history: [message(1), message(2)] });

    await service.start();

    expect(apply).not.toHaveBeenCalled();
  });

  it('creates a durable baseline without ingesting old history', async () => {
    const history = [message(100), message(102), message(101)];
    const { service, cursorStore, process, storedCursors } = setup({ history });

    await service.start();

    expect(process).not.toHaveBeenCalled();
    expect(cursorStore.initialize).toHaveBeenCalledWith(
      { cityId: 'balakovo', sourceChatId: CHAT_ID },
      message(102),
    );
    expect(storedCursors.get(`balakovo:${CHAT_ID}`)?.lastMessageId).toBe('102');
  });

  it('advances the durable cursor after a live terminal result', async () => {
    const { service, emit, cursorStore, storedCursors } = setup();
    await service.start();

    await emit(message(103));

    expect(cursorStore.advance).toHaveBeenCalledWith(
      { cityId: 'balakovo', sourceChatId: CHAT_ID },
      message(103),
    );
    expect(storedCursors.get(`balakovo:${CHAT_ID}`)?.lastMessageId).toBe('103');
  });

  it('recovers a reconnect gap in chronological order and advances to the last message', async () => {
    const getMessagesAfter = jest
      .fn()
      .mockResolvedValueOnce({ messages: [], truncated: false })
      .mockResolvedValueOnce({
        messages: [message(101), message(102)],
        truncated: false,
      });
    const { service, reconnect, process, storedCursors } = setup({
      cursors: [durableCursor(100)],
      getMessagesAfter,
    });
    await service.start();
    process.mockClear();

    await reconnect();

    const calls = process.mock.calls as unknown[][];

    expect(
      calls.map(
        (call) => (call[0] as TelegramDryRunIngestionInput).message.externalId,
      ),
    ).toEqual([`telegram:${CHAT_ID}:101`, `telegram:${CHAT_ID}:102`]);
    expect(storedCursors.get(`balakovo:${CHAT_ID}`)?.lastMessageId).toBe('102');
  });

  it('completes reconnect recovery when there is no gap', async () => {
    const getMessagesAfter = jest.fn().mockResolvedValue({
      messages: [],
      truncated: false,
    });
    const { service, reconnect, process } = setup({
      cursors: [durableCursor(100)],
      getMessagesAfter,
    });
    await service.start();
    process.mockClear();

    await reconnect();

    expect(process).not.toHaveBeenCalled();
    expect(getMessagesAfter).toHaveBeenCalledTimes(2);
  });

  it('deduplicates the cursor overlap during recovery', async () => {
    const getMessagesAfter = jest.fn().mockResolvedValue({
      messages: [message(100), message(101)],
      truncated: false,
    });
    const { service, process, cursorStore } = setup({
      cursors: [durableCursor(100)],
      getMessagesAfter,
    });

    await service.start();

    expect(process).toHaveBeenCalledTimes(1);
    expect(cursorStore.advance).toHaveBeenCalledTimes(1);
    expect(cursorStore.advance).toHaveBeenCalledWith(
      expect.anything(),
      message(101),
    );
  });

  it('serializes recovery messages before a simultaneous live update', async () => {
    const order: string[] = [];
    const process = jest.fn((input: TelegramDryRunIngestionInput) => {
      order.push(input.message.externalId);

      return Promise.resolve(pipelineResult([normalizedEvent()]));
    });
    const getMessagesAfter = jest
      .fn()
      .mockResolvedValueOnce({ messages: [], truncated: false })
      .mockResolvedValueOnce({
        messages: [message(101), message(102)],
        truncated: false,
      });
    const { service, reconnect, emit, storedCursors } = setup({
      cursors: [durableCursor(100)],
      getMessagesAfter,
      process,
    });
    await service.start();
    order.length = 0;

    const recovery = reconnect();
    const live = emit(message(103));
    await Promise.all([recovery, live]);

    expect(order).toEqual([
      `telegram:${CHAT_ID}:101`,
      `telegram:${CHAT_ID}:102`,
      `telegram:${CHAT_ID}:103`,
    ]);
    expect(storedCursors.get(`balakovo:${CHAT_ID}`)?.lastMessageId).toBe('103');
  });

  it('does not advance past a failed recovery message and retries it later', async () => {
    const process = jest
      .fn()
      .mockResolvedValueOnce(pipelineResult([normalizedEvent()]))
      .mockRejectedValueOnce(new Error('parser failure'))
      .mockResolvedValueOnce(pipelineResult([normalizedEvent()]));
    const getMessagesAfter = jest
      .fn()
      .mockResolvedValueOnce({
        messages: [message(101), message(102)],
        truncated: false,
      })
      .mockResolvedValueOnce({ messages: [message(102)], truncated: false });
    const { service, reconnect, storedCursors } = setup({
      cursors: [durableCursor(100)],
      getMessagesAfter,
      process,
    });

    await service.start();
    expect(storedCursors.get(`balakovo:${CHAT_ID}`)?.lastMessageId).toBe('101');

    await reconnect();

    expect(process).toHaveBeenCalledTimes(3);
    expect(storedCursors.get(`balakovo:${CHAT_ID}`)?.lastMessageId).toBe('102');
  });

  it('keeps live ingestion recoverable after a history-fetch failure', async () => {
    const getMessagesAfter = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary history error'))
      .mockResolvedValueOnce({
        messages: [message(101)],
        truncated: false,
      });
    const { service, emit, process, storedCursors } = setup({
      cursors: [durableCursor(100)],
      getMessagesAfter,
    });
    await service.start();

    await emit(message(102));

    expect(process).toHaveBeenCalledTimes(2);
    expect(storedCursors.get(`balakovo:${CHAT_ID}`)?.lastMessageId).toBe('102');
    expect(service.getSnapshot().status).toBe('RUNNING');
  });

  it('processes a newer edit version at the current cursor', async () => {
    const edited = message(100, {
      editedAt: '2026-09-10T14:00:00.000Z',
      rawSourceType: 'edited_message',
    });
    const { service, process, cursorStore } = setup({
      cursors: [durableCursor(100)],
      recoveryMessages: [edited],
    });

    await service.start();

    expect(process).toHaveBeenCalledTimes(1);
    expect(cursorStore.advance).toHaveBeenCalledWith(expect.anything(), edited);
  });

  it('loads a persisted cursor on a new runtime instance', async () => {
    const first = setup({ cursors: [durableCursor(100)] });
    await first.service.start();
    await first.emit(message(101));
    const persisted = first.storedCursors.get(`balakovo:${CHAT_ID}`);
    await first.service.shutdown();

    const second = setup({
      cursors: persisted === undefined ? [] : [persisted],
      recoveryMessages: [message(102)],
    });
    await second.service.start();

    expect(second.source.getMessagesAfter).toHaveBeenCalledWith(
      { cityId: 'balakovo', sourceChatId: CHAT_ID },
      expect.objectContaining({ lastMessageId: '101' }),
      200,
    );
    expect(second.storedCursors.get(`balakovo:${CHAT_ID}`)?.lastMessageId).toBe(
      '102',
    );
  });

  it('keeps source cursors independent and reconnects only the requested city', async () => {
    const citySources = [
      { cityId: 'city-a', sourceChatId: CHAT_ID },
      { cityId: 'city-b', sourceChatId: '-1002' },
    ];
    const getMessagesAfter = jest.fn().mockResolvedValue({
      messages: [],
      truncated: false,
    });
    const { service, reconnect } = setup({
      citySources,
      cursors: [
        durableCursor(100, 'city-a'),
        durableCursor(50, 'city-b', '-1002'),
      ],
      getMessagesAfter,
    });
    await service.start();
    getMessagesAfter.mockClear();

    await reconnect(citySources[0]);

    expect(getMessagesAfter).toHaveBeenCalledTimes(1);
    expect(getMessagesAfter).toHaveBeenCalledWith(
      citySources[0],
      expect.objectContaining({ cityId: 'city-a' }),
      200,
    );
  });

  it('marks recovered review-log records with RECOVERY', async () => {
    const recordReviewLog = jest.fn().mockResolvedValue(undefined);
    const { service } = setup({
      cursors: [durableCursor(100)],
      recoveryMessages: [message(101)],
      recordReviewLog,
    });

    await service.start();

    expect(recordReviewLog).toHaveBeenCalledWith(
      expect.objectContaining({ ingestionSource: 'RECOVERY' }),
    );
  });

  it('passes a supported REPORT through pipeline and realtime bridge', async () => {
    const { service, emit, process, apply } = setup();
    await service.start();

    await emit(message(3));

    expect(process).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'CREATE', eventType: 'ACCIDENT' }),
    );
    expect(service.getSnapshot().counters).toMatchObject({
      received: 1,
      matched: 1,
      createCandidates: 1,
      created: 1,
    });
  });

  it('does not call persistence for IGNORE', async () => {
    const ignored = normalizedEvent({ decision: 'IGNORE', reason: 'NOISE' });
    const process = jest.fn().mockResolvedValue(pipelineResult([ignored]));
    const { service, emit, apply } = setup({ process });
    await service.start();

    await emit(message(4));

    expect(apply).not.toHaveBeenCalled();
    expect(service.getSnapshot().counters.ignored).toBe(1);
  });

  it('does not call persistence for REVIEW', async () => {
    const reviewed = normalizedEvent({
      decision: 'REVIEW',
      reason: 'LOCATION_AMBIGUOUS',
    });
    const process = jest.fn().mockResolvedValue(pipelineResult([reviewed]));
    const { service, emit, apply } = setup({ process });
    await service.start();

    await emit(message(5));

    expect(apply).not.toHaveBeenCalled();
    expect(service.getSnapshot().counters.reviewed).toBe(1);
  });

  it('counts a persistence NOOP without emitting directly', async () => {
    const apply = jest.fn().mockResolvedValue({
      status: 'NOOP',
      reason: 'ALREADY_APPLIED',
    });
    const { service, emit } = setup({ apply });
    await service.start();

    await emit(message(6));

    expect(apply).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().counters.noop).toBe(1);
  });

  it('does not advance to a newer live message while a failed version is unrecovered', async () => {
    const process = jest
      .fn()
      .mockRejectedValueOnce(new Error('parser failure'))
      .mockResolvedValueOnce(pipelineResult([normalizedEvent()]));
    const { service, emit, apply } = setup({ process });
    await service.start();

    await emit(message(7));
    await emit(message(8));

    expect(process).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(service.getSnapshot().counters.errors).toBe(1);
  });

  it('does not process the same message version in parallel', async () => {
    let release: ((result: TelegramDryRunIngestionResult) => void) | undefined;
    const process = jest.fn().mockImplementation(
      () =>
        new Promise<TelegramDryRunIngestionResult>((resolve) => {
          release = resolve;
        }),
    );
    const { service } = setup({ process });
    await service.start();
    const incoming = message(9);

    const first = service.handleMessage(incoming);
    const duplicate = service.handleMessage(incoming);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(process).toHaveBeenCalledTimes(1);
    release?.(pipelineResult([normalizedEvent()]));
    await Promise.all([first, duplicate]);
  });

  it('allows a newer edited version through the pipeline', async () => {
    const { service, emit, process } = setup();
    await service.start();
    const original = message(10);

    await emit(original);
    await emit(
      message(10, {
        text: 'авария на комарова разъехались',
        editedAt: '2026-08-31T09:00:00.000Z',
        rawSourceType: 'edited_message',
      }),
    );

    expect(process).toHaveBeenCalledTimes(2);
  });

  it('deduplicates the same edited version', async () => {
    const { service, emit, process } = setup();
    await service.start();
    const edited = message(11, {
      editedAt: '2026-08-31T09:01:00.000Z',
      rawSourceType: 'edited_message',
    });

    await emit(edited);
    await service.handleMessage(edited);

    expect(process).toHaveBeenCalledTimes(1);
  });

  it('uses bounded startup context and reply context for live parsing', async () => {
    const parent = message(12, { text: 'пробка на транспортной' });
    const { service, emit, process } = setup({ history: [parent] });
    await service.start();

    await emit(
      message(13, {
        text: 'чисто',
        replyToExternalId: parent.externalId,
      }),
    );

    const calls = process.mock.calls as unknown[][];
    const input = calls[0]?.[0] as TelegramDryRunIngestionInput | undefined;

    expect(input?.replyMessage).toEqual(parent);
    expect(input?.previousMessages).toContainEqual(parent);
  });

  it('does not register duplicate handlers when start is called again', async () => {
    const { service, source } = setup();

    await Promise.all([service.start(), service.start()]);
    await service.start();

    expect(source.start).toHaveBeenCalledTimes(1);
  });

  it('unregisters handlers and disconnects during graceful shutdown', async () => {
    const { service, source } = setup();
    await service.start();

    await service.shutdown();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().status).toBe('STOPPED');
  });

  it('waits for in-flight processing before disconnecting', async () => {
    let release: ((result: TelegramDryRunIngestionResult) => void) | undefined;
    const process = jest.fn().mockImplementation(
      () =>
        new Promise<TelegramDryRunIngestionResult>((resolve) => {
          release = resolve;
        }),
    );
    const { service, source } = setup({ process });
    await service.start();
    const processing = service.handleMessage(message(14));
    await Promise.resolve();

    const shutdown = service.shutdown();
    await Promise.resolve();
    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).not.toHaveBeenCalled();

    release?.(pipelineResult([normalizedEvent()]));
    await processing;
    await shutdown;
    expect(source.disconnect).toHaveBeenCalledTimes(1);
  });

  it('makes repeated shutdown safe', async () => {
    const { service, source } = setup();
    await service.start();

    await Promise.all([service.shutdown(), service.shutdown()]);

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores a source mismatch before parsing', async () => {
    const { service, process } = setup();
    await service.start();

    await service.handleMessage(message(15, { chatId: '-100-other' }));

    expect(process).not.toHaveBeenCalled();
    expect(service.getSnapshot().counters.ignored).toBe(1);
  });

  it('keeps synthetic city sources isolated by chat and trusted city id', async () => {
    const citySources = [
      { cityId: 'city-a', sourceChatId: CHAT_ID },
      { cityId: 'city-b', sourceChatId: '-1002' },
    ];
    const { service, process } = setup({ citySources });
    await service.start();

    await service.handleMessage(
      message(20, { cityId: 'city-b', chatId: CHAT_ID }),
    );
    await service.handleMessage(
      message(21, { cityId: 'city-b', chatId: '-1002' }),
    );

    expect(process).toHaveBeenCalledTimes(1);
  });

  it('persists DPS candidates through the automatic runtime', async () => {
    const dps = normalizedEvent({ eventType: 'DPS' });
    const process = jest.fn().mockResolvedValue(pipelineResult([dps]));
    const { service, emit, apply } = setup({ process });
    await service.start();

    await emit(message(16));

    expect(apply).toHaveBeenCalledWith(dps);
    expect(service.getSnapshot().counters.created).toBe(1);
  });

  it('tracks active DPS reports that have no resolvable map location', async () => {
    const dps = normalizedEvent({
      eventType: 'DPS',
      decision: 'REVIEW',
      reason: 'LOCATION_NOT_FOUND',
      latitude: null,
      longitude: null,
      geometry: null,
      resolverStatus: 'NOT_FOUND',
    });
    const process = jest.fn().mockResolvedValue(pipelineResult([dps]));
    const { service, emit, recordUnlocated } = setup({ process });
    await service.start();

    await emit(message(160));

    expect(recordUnlocated).toHaveBeenCalledWith({
      cityId: 'balakovo',
      externalId: dps.externalId,
      observedAt: dps.messageVersion,
    });
  });

  it('clears an unlocated observation once a DPS event gets a map decision', async () => {
    const dps = normalizedEvent({ eventType: 'DPS' });
    const process = jest.fn().mockResolvedValue(pipelineResult([dps]));
    const { service, emit, clearDpsObservation } = setup({ process });
    await service.start();

    await emit(message(161));

    expect(clearDpsObservation).toHaveBeenCalledWith(dps.externalId);
  });

  it('writes matched ROAD_STATE RESOLVE with NOOP persistence to matched only', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'roadradar-runtime-review-integration-'),
    );
    const reviewLogger = new TelegramRuntimeReviewLogger({
      get: jest.fn((key: string) => {
        if (key === 'TELEGRAM_REVIEW_LOGS_ENABLED') return 'true';
        if (key === 'TELEGRAM_REVIEW_LOG_DIR') return directory;

        return undefined;
      }),
    });
    const event = normalizedEvent({
      telegramMessageId: `telegram:${CHAT_ID}:18`,
      externalId: `telegram:${CHAT_ID}:18`,
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationInput: 'транспортная',
      canonicalLocationId: 'transportnaya',
      canonicalLocationTitle: 'Улица Транспортная',
      decision: 'RESOLVE',
      reason: 'RESOLVE_CANDIDATE',
    });
    const process = jest.fn().mockResolvedValue(pipelineResult([event]));
    const apply = jest
      .fn()
      .mockResolvedValue({ status: 'NOOP', reason: 'TARGET_NOT_FOUND' });
    const { service, emit } = setup({
      process,
      apply,
      reviewLogger,
    });

    try {
      await service.start();
      await emit(message(18, { text: 'чисто' }));

      const matched = await readFile(
        join(directory, 'telegram-matched.ndjson'),
        'utf8',
      );
      const review = await readFile(
        join(directory, 'telegram-review.ndjson'),
        'utf8',
      );
      const ignored = await readFile(
        join(directory, 'telegram-ignored.ndjson'),
        'utf8',
      );

      expect(matched.trim().split('\n')).toHaveLength(1);
      expect(review).toBe('');
      expect(ignored).toBe('');
    } finally {
      await service.shutdown();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps runtime processing successful when review logging fails', async () => {
    const recordReviewLog = jest
      .fn()
      .mockRejectedValue(new Error('private file error'));
    const { service, emit, apply } = setup({ recordReviewLog });
    await service.start();

    await expect(emit(message(17))).resolves.toBeUndefined();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().counters.created).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith('Telegram review log write failed');
  });

  it('contains startup failures without rejecting backend bootstrap', async () => {
    const { service, source } = setup();
    source.getCitySources.mockRejectedValueOnce(
      new Error('connection unavailable'),
    );

    await expect(service.start()).resolves.toBeUndefined();

    expect(service.getSnapshot().status).toBe('ERROR');
    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
  });
});
