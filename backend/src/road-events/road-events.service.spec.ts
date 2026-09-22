jest.mock('../database/prisma.service', () => ({
  PrismaService: class {},
}));

jest.mock('./realtime/road-events.gateway', () => ({
  RoadEventsGateway: class {},
}));

import { BadRequestException, ConflictException, Logger } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';

import type { TomTomTrafficProvider } from '../integrations/tomtom/tomtom-traffic.provider';

import { CreateRoadEventDto } from './dto/create-road-event.dto';
import { FeedbackRoadEventDto } from './dto/feedback-road-event.dto';
import { ListRoadEventsQueryDto } from './dto/list-road-events-query.dto';

import {
  ROAD_EVENT_LIFECYCLE_INTERVAL_MS,
  ROAD_PATROL_LIFECYCLE,
  ROAD_EVENT_TTL_MINUTES,
  TELEGRAM_EVENT_TTL_MS,
} from './road-events.constants';

import type { RoadEventsGateway } from './realtime/road-events.gateway';

import { RoadEventsService } from './road-events.service';
import { DpsActivityTracker } from './dps-activity-tracker.service';

const TRUSTED_IDENTITY_ID = '00000000-0000-4000-8000-000000000010';
const OTHER_IDENTITY_ID = '00000000-0000-4000-8000-000000000011';
const SPOOFED_IDENTITY_ID = '00000000-0000-4000-8000-000000000012';

describe('RoadEventsService create city bounds', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const gateway = {
    broadcastCreated: jest.fn(),
    broadcastResolved: jest.fn(),
    broadcastUpdated: jest.fn(),
  };

  const tomTomTrafficProvider = {
    getIncidents: jest.fn().mockResolvedValue([]),
  };

  const service = new RoadEventsService(
    prisma as unknown as PrismaService,
    gateway as unknown as RoadEventsGateway,
    tomTomTrafficProvider as unknown as TomTomTrafficProvider,
    new DpsActivityTracker(),
  );

  const createDto = (
    overrides: Partial<CreateRoadEventDto> = {},
  ): CreateRoadEventDto => ({
    cityId: 'balakovo',
    type: 'ACCIDENT',
    coordinate: [47.8007, 52.0278],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a coordinate inside Balakovo', async () => {
    const createdAt = new Date('2026-08-20T12:00:00.000Z');
    const dtoWithSpoofedIdentity = {
      ...createDto(),
      installationId: SPOOFED_IDENTITY_ID,
    } as CreateRoadEventDto;

    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000001',
        cityId: 'balakovo',
        type: 'ACCIDENT',
        status: 'UNCONFIRMED',
        title: 'ДТП',
        description: null,
        longitude: 47.8007,
        latitude: 52.0278,
        createdByInstallationId: TRUSTED_IDENTITY_ID,
        confirmationCount: 1,
        rejectionCount: 0,
        lastConfirmedAt: createdAt,
        confidence: 2 / 3,
        createdAt,
        expiresAt: new Date('2026-08-20T14:00:00.000Z'),
      },
    ]);

    await expect(
      service.create(dtoWithSpoofedIdentity, TRUSTED_IDENTITY_ID),
    ).resolves.toMatchObject({
      cityId: 'balakovo',
      coordinate: [47.8007, 52.0278],
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

    const createQueryCall = prisma.$queryRaw.mock.calls[1] as unknown[];

    expect(createQueryCall).toContain(TRUSTED_IDENTITY_ID);
    expect(createQueryCall).not.toContain(SPOOFED_IDENTITY_ID);
  });

  it('rejects a coordinate outside Balakovo', async () => {
    const error = await service
      .create(
        createDto({
          coordinate: [48.3, 52.0278],
        }),
        TRUSTED_IDENTITY_ID,
      )
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);

    expect((error as BadRequestException).getStatus()).toBe(400);

    expect((error as BadRequestException).message).toBe(
      'Coordinate is outside city bounds',
    );

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects an unsupported cityId', async () => {
    const error = await service
      .create(
        createDto({
          cityId: 'unknown-city',
        }),
        TRUSTED_IDENTITY_ID,
      )
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);

    expect((error as BadRequestException).getStatus()).toBe(400);

    expect((error as BadRequestException).message).toBe('Unsupported cityId');

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  describe('trusted identity', () => {
    const currentEvent = () => ({
      id: '00000000-0000-4000-8000-000000000020',
      cityId: 'balakovo',
      type: 'ACCIDENT',
      status: 'UNCONFIRMED',
      title: 'ДТП',
      description: null,
      longitude: 47.8007,
      latitude: 52.0278,
      createdByInstallationId: OTHER_IDENTITY_ID,
      confirmationCount: 1,
      rejectionCount: 0,
      lastConfirmedAt: new Date(),
      confidence: 2 / 3,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const feedbackDtoWithSpoofedIdentity = (): FeedbackRoadEventDto =>
      ({
        action: 'CONFIRM',
        installationId: SPOOFED_IDENTITY_ID,
      }) as FeedbackRoadEventDto;

    it('uses the trusted identity when listing viewer relations', async () => {
      const queryWithSpoofedIdentity = {
        cityId: 'balakovo',
        west: 47.64,
        south: 51.9,
        east: 48.04,
        north: 52.16,
        installationId: SPOOFED_IDENTITY_ID,
      } as ListRoadEventsQueryDto;

      prisma.$executeRaw.mockResolvedValueOnce(0);
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.list(queryWithSpoofedIdentity, TRUSTED_IDENTITY_ID);

      const listQueryCall = prisma.$queryRaw.mock.calls[1] as unknown[];

      expect(listQueryCall).toContain(TRUSTED_IDENTITY_ID);
      expect(listQueryCall).not.toContain(SPOOFED_IDENTITY_ID);
    });

    it('uses the trusted identity for feedback', async () => {
      const event = currentEvent();
      const transaction = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([event])
          .mockResolvedValueOnce([{ action: 'CONFIRM' }])
          .mockResolvedValueOnce([
            {
              ...event,
              status: 'ACTIVE',
              confirmationCount: 2,
              lastConfirmedAt: new Date(),
            },
          ]),
      };

      prisma.$transaction.mockImplementationOnce(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      );

      await service.feedback(
        event.id,
        feedbackDtoWithSpoofedIdentity(),
        TRUSTED_IDENTITY_ID,
      );

      const feedbackQueryCall = transaction.$queryRaw.mock
        .calls[1] as unknown[];

      expect(feedbackQueryCall).toContain(TRUSTED_IDENTITY_ID);
      expect(feedbackQueryCall).not.toContain(SPOOFED_IDENTITY_ID);
    });

    it('cannot bypass self-vote protection with a body installationId', async () => {
      const event = {
        ...currentEvent(),
        createdByInstallationId: TRUSTED_IDENTITY_ID,
      };
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValueOnce([event]),
      };

      prisma.$transaction.mockImplementationOnce(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      );

      const error = await service
        .feedback(
          event.id,
          feedbackDtoWithSpoofedIdentity(),
          TRUSTED_IDENTITY_ID,
        )
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'Creator cannot vote for own event',
      );
      expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('lifecycle', () => {
    const resolvedEvent = {
      kind: 'RESOLVED',
      id: '00000000-0000-4000-8000-000000000002',
      cityId: 'balakovo',
      resolvedAt: new Date('2026-08-20T15:00:00.000Z'),
      unsupportedType: null,
    };

    const lifecycleSql = () => {
      const calls = prisma.$queryRaw.mock.calls as unknown[][];

      const strings = calls[0]?.[0] as readonly string[] | undefined;

      return (strings ?? []).join(' ').replace(/\s+/g, ' ');
    };

    const lifecycleValues = () => {
      const calls = prisma.$queryRaw.mock.calls as unknown[][];

      return calls[0]?.slice(1) ?? [];
    };

    it('keeps the existing USER expiration policy unchanged', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([resolvedEvent]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(lifecycleSql()).toContain(
        `event.source = 'USER'::"RoadEventSource" AND event.expires_at <= NOW()`,
      );
      expect(ROAD_EVENT_TTL_MINUTES.ACCIDENT).toBe(120);
    });

    it('resolves an expired active Telegram ACCIDENT atomically', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([resolvedEvent]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(lifecycleSql()).toContain(
        `event.source = 'TELEGRAM'::"RoadEventSource"`,
      );
      expect(lifecycleSql()).toContain(
        `event.status = 'ACTIVE'::"RoadEventStatus"`,
      );
      expect(lifecycleSql()).toContain(`WHEN 'ACCIDENT'::"RoadEventType"`);
      expect(lifecycleValues()).toContain(TELEGRAM_EVENT_TTL_MS.ACCIDENT);
    });

    it('keeps a non-expired Telegram ACCIDENT active', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(gateway.broadcastResolved).not.toHaveBeenCalled();
    });

    it('uses a shorter TTL for Telegram TRAFFIC than ACCIDENT', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(TELEGRAM_EVENT_TTL_MS.TRAFFIC).toBe(60 * 60_000);
      expect(TELEGRAM_EVENT_TTL_MS.TRAFFIC).toBeLessThan(
        TELEGRAM_EVENT_TTL_MS.ACCIDENT!,
      );
      expect(lifecycleValues()).toContain(TELEGRAM_EVENT_TTL_MS.TRAFFIC);
    });

    it('uses a longer TTL for Telegram ROADWORKS than ACCIDENT', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(TELEGRAM_EVENT_TTL_MS.ROADWORKS).toBe(12 * 60 * 60_000);
      expect(TELEGRAM_EVENT_TTL_MS.ROADWORKS).toBeGreaterThan(
        TELEGRAM_EVENT_TTL_MS.ACCIDENT!,
      );
      expect(lifecycleValues()).toContain(TELEGRAM_EVENT_TTL_MS.ROADWORKS);
    });

    it('applies the Telegram lifecycle TTL to DPS RoadEvents', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(lifecycleSql()).toContain(
        `event.type = 'ROAD_PATROL'::"RoadEventType" AND event.expires_at <= NOW()`,
      );
      expect(TELEGRAM_EVENT_TTL_MS.ROAD_PATROL).toBe(20 * 60_000);
      expect(ROAD_PATROL_LIFECYCLE.maxLifetimeMs).toBe(75 * 60_000);
    });

    it('uses the latest applied Telegram source timestamp for expiration', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(lifecycleSql()).toContain('SELECT MAX(mapping.source_timestamp)');
      expect(lifecycleSql()).toContain(
        `mapping.outcome IN ('CREATED', 'UPDATED')`,
      );
    });

    it('sets resolvedAt only for Telegram TTL resolution', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([resolvedEvent]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(lifecycleSql()).toContain(
        `resolved_at = CASE WHEN event.source = 'TELEGRAM'::"RoadEventSource" THEN NOW() ELSE event.resolved_at END`,
      );
    });

    it('broadcasts an automatically resolved event', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([resolvedEvent]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(gateway.broadcastResolved).toHaveBeenCalledWith({
        id: resolvedEvent.id,
        cityId: 'balakovo',
        resolvedAt: '2026-08-20T15:00:00.000Z',
      });
    });

    it('does not broadcast an already resolved event again', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(lifecycleSql()).toContain(
        `event.status <> 'RESOLVED'::"RoadEventStatus"`,
      );
      expect(gateway.broadcastResolved).not.toHaveBeenCalled();
    });

    it('does not broadcast a Telegram TTL resolution twice', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([resolvedEvent])
        .mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValue(0);

      await service.runLifecycleTick();
      await service.runLifecycleTick();

      expect(gateway.broadcastResolved).toHaveBeenCalledTimes(1);
    });

    it('keeps USER and Telegram lifecycle predicates isolated', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(lifecycleSql()).toContain(
        `event.source = 'USER'::"RoadEventSource" AND event.expires_at <= NOW()`,
      );
      expect(lifecycleSql()).toContain(
        `event.source = 'TELEGRAM'::"RoadEventSource" AND event.status = 'ACTIVE'::"RoadEventStatus"`,
      );
    });

    it('skips and reports unsupported Telegram event types once', async () => {
      const loggerWarn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const unsupportedRow = {
        kind: 'UNSUPPORTED_TELEGRAM_TYPE',
        id: null,
        cityId: null,
        resolvedAt: null,
        unsupportedType: 'ROAD_PATROL',
      };
      prisma.$queryRaw.mockResolvedValue([unsupportedRow]);
      prisma.$executeRaw.mockResolvedValue(0);

      try {
        await service.runLifecycleTick();
        await service.runLifecycleTick();

        expect(gateway.broadcastResolved).not.toHaveBeenCalled();
        expect(loggerWarn).toHaveBeenCalledTimes(1);
      } finally {
        loggerWarn.mockRestore();
      }
    });

    it('does not include TOMTOM in the persisted lifecycle mutation', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await service.runLifecycleTick();

      expect(lifecycleSql()).not.toContain('TOMTOM');
    });

    it('completes an empty lifecycle tick without an error', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$executeRaw.mockResolvedValueOnce(0);

      await expect(service.runLifecycleTick()).resolves.toBeUndefined();

      expect(gateway.broadcastResolved).not.toHaveBeenCalled();
    });

    it('continues scheduled ticks after a lifecycle error', async () => {
      jest.useFakeTimers();

      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const lifecycleTick = jest
        .spyOn(service, 'runLifecycleTick')
        .mockRejectedValueOnce(new Error('Database unavailable'))
        .mockResolvedValue(undefined);

      try {
        service.onApplicationBootstrap();

        await jest.advanceTimersByTimeAsync(0);
        await jest.advanceTimersByTimeAsync(ROAD_EVENT_LIFECYCLE_INTERVAL_MS);

        expect(lifecycleTick).toHaveBeenCalledTimes(2);
        expect(loggerError).toHaveBeenCalledTimes(1);
      } finally {
        service.onModuleDestroy();
        lifecycleTick.mockRestore();
        loggerError.mockRestore();
        jest.useRealTimers();
      }
    });
  });
});
