jest.mock('../../../database/prisma.service', () => ({
  PrismaService: class {},
}));

jest.mock('../../../road-events/realtime/road-events.gateway', () => ({
  RoadEventsGateway: class {},
}));

import { Logger } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { RoadEventsGateway } from '../../../road-events/realtime/road-events.gateway';
import type { NormalizedTelegramEvent } from '../ingestion/telegram-ingestion.types';

import type { TelegramIngestionPersistenceService } from './telegram-ingestion-persistence.service';
import type { TelegramPersistenceResult } from './telegram-ingestion-persistence.types';
import { TelegramRoadEventRealtimeBridge } from './telegram-road-event-realtime.bridge';

const normalizedEvent = (): NormalizedTelegramEvent => ({
  source: 'TELEGRAM',
  cityId: 'balakovo',
  telegramMessageId: 'telegram:-1001:101',
  externalId: 'telegram:-1001:101',
  sourceChatId: '-1001',
  timestamp: '2026-08-31T08:00:00.000Z',
  eventType: 'ACCIDENT',
  intent: 'REPORT',
  state: 'ACTIVE',
  sourceText: 'авария на комарова',
  locationInput: 'Комарова',
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
});

const committedRow = {
  id: 'event-1',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП',
  description: null,
  longitude: 47.8,
  latitude: 52.02,
  confirmationCount: 0,
  rejectionCount: 0,
  lastConfirmedAt: new Date('2026-08-31T08:00:00.000Z'),
  confidence: 0.9,
  createdAt: new Date('2026-08-31T08:00:00.000Z'),
  expiresAt: new Date('2026-08-31T10:00:00.000Z'),
  resolvedAt: null,
};

const setup = (
  result: TelegramPersistenceResult = {
    status: 'CREATED',
    roadEventId: 'event-1',
  },
) => {
  const applyMock = jest.fn().mockResolvedValue(result);
  const queryRawMock = jest.fn().mockResolvedValue([committedRow]);
  const broadcastCreatedMock = jest.fn();
  const broadcastUpdatedMock = jest.fn();
  const broadcastResolvedMock = jest.fn();
  const persistence = { apply: applyMock };
  const prisma = { $queryRaw: queryRawMock };
  const gateway = {
    broadcastCreated: broadcastCreatedMock,
    broadcastUpdated: broadcastUpdatedMock,
    broadcastResolved: broadcastResolvedMock,
  };
  const bridge = new TelegramRoadEventRealtimeBridge(
    persistence as unknown as TelegramIngestionPersistenceService,
    prisma as unknown as PrismaService,
    gateway as unknown as RoadEventsGateway,
  );

  return {
    bridge,
    applyMock,
    queryRawMock,
    broadcastCreatedMock,
    broadcastUpdatedMock,
    broadcastResolvedMock,
  };
};

describe('TelegramRoadEventRealtimeBridge', () => {
  afterEach(() => jest.restoreAllMocks());

  it('emits one existing road-event:created payload after CREATED', async () => {
    const { bridge, broadcastCreatedMock } = setup();

    await expect(bridge.apply(normalizedEvent())).resolves.toEqual({
      status: 'CREATED',
      roadEventId: 'event-1',
    });
    expect(broadcastCreatedMock).toHaveBeenCalledTimes(1);
  });

  it('emits one existing road-event:updated payload after UPDATED', async () => {
    const { bridge, broadcastUpdatedMock } = setup({
      status: 'UPDATED',
      roadEventId: 'event-1',
    });

    await bridge.apply(normalizedEvent());

    expect(broadcastUpdatedMock).toHaveBeenCalledTimes(1);
  });

  it('emits the existing resolved payload after RESOLVED', async () => {
    const { bridge, queryRawMock, broadcastResolvedMock } = setup({
      status: 'RESOLVED',
      roadEventId: 'event-1',
    });
    queryRawMock.mockResolvedValueOnce([
      {
        ...committedRow,
        status: 'RESOLVED',
        resolvedAt: new Date('2026-08-31T08:10:00.000Z'),
      },
    ]);

    await bridge.apply(normalizedEvent());

    expect(broadcastResolvedMock).toHaveBeenCalledWith({
      id: 'event-1',
      cityId: 'balakovo',
      resolvedAt: '2026-08-31T08:10:00.000Z',
    });
  });

  it('uses the existing RoadEvent DTO and TELEGRAM source', async () => {
    const { bridge, broadcastCreatedMock } = setup();

    await bridge.apply(normalizedEvent());

    expect(broadcastCreatedMock).toHaveBeenCalledWith({
      id: 'event-1',
      source: 'TELEGRAM',
      cityId: 'balakovo',
      type: 'ACCIDENT',
      status: 'ACTIVE',
      title: 'ДТП',
      coordinate: [47.8, 52.02],
      confirmationCount: 0,
      rejectionCount: 0,
      lastConfirmedAt: '2026-08-31T08:00:00.000Z',
      confidence: 0.9,
      createdAt: '2026-08-31T08:00:00.000Z',
      expiresAt: '2026-08-31T10:00:00.000Z',
    });
  });

  it.each([
    {
      status: 'NOOP',
      reason: 'ALREADY_APPLIED',
      roadEventId: 'event-1',
    },
    {
      status: 'NOOP',
      reason: 'DUPLICATE_ACTIVE_EVENT',
      roadEventId: 'event-1',
    },
    { status: 'NOOP', reason: 'TARGET_NOT_FOUND' },
    {
      status: 'NOOP',
      reason: 'ALREADY_RESOLVED',
      roadEventId: 'event-1',
    },
    {
      status: 'REVIEW',
      reason: 'AMBIGUOUS_TARGET',
      candidateCount: 2,
    },
    { status: 'NOOP', reason: 'UNSUPPORTED_DECISION' },
  ] as const)('does not emit for $status/$reason', async (result) => {
    const {
      bridge,
      queryRawMock,
      broadcastCreatedMock,
      broadcastUpdatedMock,
      broadcastResolvedMock,
    } = setup(result);

    await bridge.apply(normalizedEvent());

    expect(queryRawMock).not.toHaveBeenCalled();
    expect(broadcastCreatedMock).not.toHaveBeenCalled();
    expect(broadcastUpdatedMock).not.toHaveBeenCalled();
    expect(broadcastResolvedMock).not.toHaveBeenCalled();
  });

  it('loads and emits only after persistence transaction completes', async () => {
    const order: string[] = [];
    const { bridge, applyMock, queryRawMock, broadcastCreatedMock } = setup();
    applyMock.mockImplementationOnce(() => {
      order.push('transaction-committed');
      return Promise.resolve({ status: 'CREATED', roadEventId: 'event-1' });
    });
    queryRawMock.mockImplementationOnce(() => {
      order.push('snapshot-loaded');
      return Promise.resolve([committedRow]);
    });
    broadcastCreatedMock.mockImplementationOnce(() => {
      order.push('socket-emitted');
    });

    await bridge.apply(normalizedEvent());

    expect(order).toEqual([
      'transaction-committed',
      'snapshot-loaded',
      'socket-emitted',
    ]);
  });

  it('keeps CREATED when Socket.io emit fails', async () => {
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { bridge, broadcastCreatedMock } = setup();
    broadcastCreatedMock.mockImplementationOnce(() => {
      throw new Error('socket unavailable');
    });

    await expect(bridge.apply(normalizedEvent())).resolves.toEqual({
      status: 'CREATED',
      roadEventId: 'event-1',
    });
    expect(logError).toHaveBeenCalledWith(
      'Telegram RoadEvent realtime emit failed eventId=event-1 eventType=ACCIDENT cityId=balakovo eventName=road-event:created',
    );
    expect(logError.mock.calls.flat().join(' ')).not.toContain('-1001');
  });

  it('does not re-emit an ALREADY_APPLIED retry after socket failure', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { bridge, applyMock, broadcastCreatedMock } = setup();
    broadcastCreatedMock.mockImplementationOnce(() => {
      throw new Error('socket unavailable');
    });
    applyMock
      .mockResolvedValueOnce({ status: 'CREATED', roadEventId: 'event-1' })
      .mockResolvedValueOnce({
        status: 'NOOP',
        reason: 'ALREADY_APPLIED',
        roadEventId: 'event-1',
      });

    const first = await bridge.apply(normalizedEvent());
    const second = await bridge.apply(normalizedEvent());

    expect(first.status).toBe('CREATED');
    expect(second).toMatchObject({
      status: 'NOOP',
      reason: 'ALREADY_APPLIED',
    });
    expect(broadcastCreatedMock).toHaveBeenCalledTimes(1);
  });
});
