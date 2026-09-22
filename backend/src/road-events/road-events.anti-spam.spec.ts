jest.mock('../database/prisma.service', () => ({
  PrismaService: class {},
}));

jest.mock('./realtime/road-events.gateway', () => ({
  RoadEventsGateway: class {},
}));

import { ConflictException, HttpException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';

import type { TomTomTrafficProvider } from '../integrations/tomtom/tomtom-traffic.provider';

import { CreateRoadEventDto } from './dto/create-road-event.dto';

import {
  ROAD_EVENT_CREATE_RATE_LIMIT,
  ROAD_EVENT_DEDUPLICATION,
  ROAD_EVENT_FEEDBACK_RATE_LIMIT,
} from './road-events.constants';

import type { RoadEventsGateway } from './realtime/road-events.gateway';

import { RoadEventsService } from './road-events.service';
import { DpsActivityTracker } from './dps-activity-tracker.service';

const IDENTITY_A = '00000000-0000-4000-8000-000000000101';
const IDENTITY_B = '00000000-0000-4000-8000-000000000102';

describe('RoadEventsService anti-spam protection', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const gateway = {
    broadcastCreated: jest.fn(),
    broadcastUpdated: jest.fn(),
    broadcastResolved: jest.fn(),
  };

  const tomTomTrafficProvider = {
    getIncidents: jest.fn().mockResolvedValue([]),
  };

  let service: RoadEventsService;

  const createDto = (
    overrides: Partial<CreateRoadEventDto> = {},
  ): CreateRoadEventDto => ({
    cityId: 'balakovo',
    type: 'ACCIDENT',
    coordinate: [47.8007, 52.0278],
    ...overrides,
  });

  const eventRow = (dto: CreateRoadEventDto, identityId: string) => ({
    id: '00000000-0000-4000-8000-000000000201',
    cityId: dto.cityId,
    type: dto.type,
    status: 'UNCONFIRMED',
    title: dto.title || 'Дорожное событие',
    description: dto.description ?? null,
    longitude: dto.coordinate[0],
    latitude: dto.coordinate[1],
    createdByInstallationId: identityId,
    confirmationCount: 1,
    rejectionCount: 0,
    lastConfirmedAt: new Date(),
    confidence: 2 / 3,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });

  const allowCreates = () => {
    prisma.$queryRaw.mockImplementation(
      (strings: readonly string[], ...values: unknown[]) => {
        const sql = strings.join(' ');

        if (sql.includes('SELECT') && sql.includes('event.id::text')) {
          return Promise.resolve([]);
        }

        const dto = createDto({
          type: values.find((value) => value === 'ROAD_PATROL')
            ? 'ROAD_PATROL'
            : 'ACCIDENT',
        });

        const identityId =
          values.find(
            (value) => value === IDENTITY_A || value === IDENTITY_B,
          ) ?? IDENTITY_A;

        return Promise.resolve([eventRow(dto, String(identityId))]);
      },
    );
  };

  const sqlForQueryCall = (index = 0) => {
    const call = prisma.$queryRaw.mock.calls[index] as unknown[];
    const strings = call[0] as readonly string[];

    return strings.join(' ').replace(/\s+/g, ' ');
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new RoadEventsService(
      prisma as unknown as PrismaService,
      gateway as unknown as RoadEventsGateway,
      tomTomTrafficProvider as unknown as TomTomTrafficProvider,
      new DpsActivityTracker(),
    );
  });

  it('allows ordinary event creation', async () => {
    allowCreates();

    await expect(
      service.create(createDto(), IDENTITY_A),
    ).resolves.toMatchObject({
      cityId: 'balakovo',
      type: 'ACCIDENT',
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('returns 429 when create rate limit is exceeded', async () => {
    allowCreates();

    for (
      let index = 0;
      index < ROAD_EVENT_CREATE_RATE_LIMIT.maxRequests;
      index += 1
    ) {
      await service.create(createDto(), IDENTITY_A);
    }

    const error = await service
      .create(createDto(), IDENTITY_A)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).message).toBe(
      'Road event creation rate limit exceeded',
    );
  });

  it('returns 429 when feedback rate limit is exceeded', async () => {
    prisma.$transaction.mockRejectedValue(new Error('Event lookup stopped'));

    for (
      let index = 0;
      index < ROAD_EVENT_FEEDBACK_RATE_LIMIT.maxRequests;
      index += 1
    ) {
      await service
        .feedback(
          '00000000-0000-4000-8000-000000000301',
          { action: 'CONFIRM' },
          IDENTITY_A,
        )
        .catch(() => undefined);
    }

    const error = await service
      .feedback(
        '00000000-0000-4000-8000-000000000301',
        { action: 'CONFIRM' },
        IDENTITY_A,
      )
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).message).toBe(
      'Road event feedback rate limit exceeded',
    );
  });

  it('keeps rate limits independent between identities', async () => {
    allowCreates();

    for (
      let index = 0;
      index < ROAD_EVENT_CREATE_RATE_LIMIT.maxRequests;
      index += 1
    ) {
      await service.create(createDto(), IDENTITY_A);
    }

    await expect(
      service.create(createDto(), IDENTITY_B),
    ).resolves.toMatchObject({
      cityId: 'balakovo',
    });
  });

  it('blocks a similar active event of the same type nearby', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: '00000000-0000-4000-8000-000000000401' },
    ]);

    const error = await service
      .create(createDto(), IDENTITY_A)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).message).toBe(
      'Similar active event already exists nearby',
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('allows a nearby event of another type', async () => {
    allowCreates();

    await expect(
      service.create(createDto({ type: 'ROAD_PATROL' }), IDENTITY_A),
    ).resolves.toMatchObject({ type: 'ROAD_PATROL' });

    const dedupCall = prisma.$queryRaw.mock.calls[0] as unknown[];

    expect(dedupCall).toContain('ROAD_PATROL');
  });

  it('treats a nearby DPS create attempt as a confirmation of the active marker', async () => {
    const existingId = '00000000-0000-4000-8000-000000000450';
    const createdAt = new Date(Date.now() - 5 * 60_000);
    const current = {
      ...eventRow(createDto({ type: 'ROAD_PATROL' }), IDENTITY_B),
      id: existingId,
      source: 'TELEGRAM',
      status: 'STALE',
      createdByInstallationId: null,
      createdAt,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    };
    const updated = {
      ...current,
      status: 'ACTIVE',
      confirmationCount: 2,
      expiresAt: new Date(Date.now() + 20 * 60_000),
    };
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([current])
        .mockResolvedValueOnce([{ action: 'CONFIRM' }])
        .mockResolvedValueOnce([updated]),
    };

    prisma.$queryRaw.mockResolvedValueOnce([{ id: existingId }]);
    prisma.$transaction.mockImplementationOnce(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    await expect(
      service.create(createDto({ type: 'ROAD_PATROL' }), IDENTITY_A),
    ).resolves.toMatchObject({
      id: existingId,
      source: 'TELEGRAM',
      status: 'ACTIVE',
      confirmationCount: 2,
      viewerRelation: 'CONFIRM',
    });

    expect(gateway.broadcastUpdated).toHaveBeenCalledTimes(1);

    const dedupSql = sqlForQueryCall();
    expect(dedupSql).toContain(`event.status = 'STALE'::"RoadEventStatus"`);
  });

  it('does not let a resolved event block a new event', async () => {
    allowCreates();

    await expect(
      service.create(createDto(), IDENTITY_A),
    ).resolves.toBeDefined();

    expect(sqlForQueryCall()).toContain(
      `event.status IN ( 'ACTIVE'::"RoadEventStatus", 'UNCONFIRMED'::"RoadEventStatus" )`,
    );
    expect(sqlForQueryCall()).not.toContain(`'RESOLVED'::"RoadEventStatus"`);
  });

  it('allows the same type outside the dedup radius', async () => {
    allowCreates();

    await expect(
      service.create(createDto(), IDENTITY_A),
    ).resolves.toBeDefined();

    const dedupCall = prisma.$queryRaw.mock.calls[0] as unknown[];

    expect(sqlForQueryCall()).toContain('ST_DWithin');
    expect(dedupCall).toContain(ROAD_EVENT_DEDUPLICATION.radiusMeters);
  });
});
