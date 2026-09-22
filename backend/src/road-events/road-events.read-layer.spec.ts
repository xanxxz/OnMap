jest.mock('../database/prisma.service', () => ({
  PrismaService: class {},
}));

jest.mock('./realtime/road-events.gateway', () => ({
  RoadEventsGateway: class {},
}));

import { Logger } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { TomTomIntegrationError } from '../integrations/tomtom/tomtom.errors';
import type { TomTomTrafficProvider } from '../integrations/tomtom/tomtom-traffic.provider';
import type { ExternalRoadEvent } from '../integrations/tomtom/tomtom.types';

import type { ListRoadEventsQueryDto } from './dto/list-road-events-query.dto';
import type { RoadEventsGateway } from './realtime/road-events.gateway';
import { RoadEventsService } from './road-events.service';
import { DpsActivityTracker } from './dps-activity-tracker.service';

const IDENTITY_ID = '00000000-0000-4000-8000-000000000501';
const USER_EVENT_ID = '00000000-0000-4000-8000-000000000502';

const query: ListRoadEventsQueryDto = {
  cityId: 'balakovo',
  west: 47.79,
  south: 52.01,
  east: 47.81,
  north: 52.03,
};

const userEventRow = () => ({
  id: USER_EVENT_ID,
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП',
  description: 'Пользовательское событие',
  longitude: 47.8,
  latitude: 52.02,
  createdByInstallationId: '00000000-0000-4000-8000-000000000503',
  confirmationCount: 2,
  rejectionCount: 0,
  lastConfirmedAt: new Date('2026-08-25T08:15:00.000Z'),
  confidence: 0.75,
  createdAt: new Date('2026-08-25T08:00:00.000Z'),
  expiresAt: new Date('2026-08-25T10:00:00.000Z'),
  viewerRelation: null,
});

const tomTomIncident = (
  overrides: Partial<ExternalRoadEvent> = {},
): ExternalRoadEvent => ({
  externalId: 'incident-1',
  source: 'TOMTOM',
  type: 'TRAFFIC_JAM',
  geometry: {
    type: 'LineString',
    coordinates: [
      [47.78, 52.02],
      [47.82, 52.02],
    ],
  },
  title: 'Затруднение движения',
  description: 'Замедленное движение',
  from: 'Начало участка',
  to: 'Конец участка',
  startTime: '2026-08-25T08:00:00Z',
  endTime: '2026-08-25T09:00:00Z',
  timeValidity: 'present',
  probabilityOfOccurrence: 'certain',
  numberOfReports: 2,
  delaySeconds: 120,
  lengthMeters: 640,
  updatedAt: '2026-08-25T08:15:00Z',
  fetchedAt: '2026-08-25T08:20:00Z',
  rawCategory: 6,
  ...overrides,
});

describe('RoadEventsService unified read layer', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const gateway = {
    broadcastUpdated: jest.fn(),
    broadcastResolved: jest.fn(),
  };
  const tomTomTrafficProvider = {
    getIncidents: jest.fn(),
  };

  let service: RoadEventsService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.$queryRaw.mockResolvedValue([userEventRow()]);
    tomTomTrafficProvider.getIncidents.mockResolvedValue([tomTomIncident()]);

    service = new RoadEventsService(
      prisma as unknown as PrismaService,
      gateway as unknown as RoadEventsGateway,
      tomTomTrafficProvider as unknown as TomTomTrafficProvider,
      new DpsActivityTracker(),
    );

    jest.spyOn(service, 'runLifecycleTick').mockResolvedValue(undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns USER and TOMTOM items together with stable source-specific shapes', async () => {
    const result = await service.list(query, IDENTITY_ID);
    const userEvent = result.find(({ source }) => source === 'USER');
    const externalEvent = result.find(({ source }) => source === 'TOMTOM');

    expect(result.map(({ source }) => source)).toEqual(['USER', 'TOMTOM']);
    expect(userEvent).toMatchObject({
      id: USER_EVENT_ID,
      source: 'USER',
      geometry: {
        type: 'Point',
        coordinates: [47.8, 52.02],
      },
    });
    expect(externalEvent).toMatchObject({
      id: 'tomtom:incident-1',
      source: 'TOMTOM',
      geometry: {
        type: 'LineString',
        coordinates: [
          [47.78, 52.02],
          [47.82, 52.02],
        ],
      },
    });
    expect(externalEvent?.id).not.toBe(USER_EVENT_ID);
    expect(externalEvent).not.toHaveProperty('confirmationCount');
    expect(externalEvent).not.toHaveProperty('rejectionCount');
    expect(externalEvent).not.toHaveProperty('confidence');
    expect(externalEvent).not.toHaveProperty('viewerRelation');
    expect(tomTomTrafficProvider.getIncidents).toHaveBeenCalledWith('balakovo');
  });

  it('returns USER events when TomTom is disabled', async () => {
    tomTomTrafficProvider.getIncidents.mockRejectedValue(
      new TomTomIntegrationError('DISABLED', 'TomTom is disabled'),
    );

    await expect(service.list(query, IDENTITY_ID)).resolves.toEqual([
      expect.objectContaining({
        id: USER_EVENT_ID,
        source: 'USER',
      }),
    ]);
  });

  it('returns persisted TELEGRAM events with their real source', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      userEventRow(),
      {
        ...userEventRow(),
        id: '00000000-0000-4000-8000-000000000504',
        source: 'TELEGRAM',
        createdByInstallationId: null,
      },
    ]);
    tomTomTrafficProvider.getIncidents.mockResolvedValueOnce([]);

    const result = await service.list(query, IDENTITY_ID);

    expect(result.map(({ source }) => source)).toEqual(['USER', 'TELEGRAM']);
    expect(result[1]).toMatchObject({
      source: 'TELEGRAM',
      geometry: {
        type: 'Point',
        coordinates: [47.8, 52.02],
      },
    });
  });

  it('serializes persisted TELEGRAM MultiLineString geometry and approximate metadata', async () => {
    const geometry = {
      type: 'MultiLineString' as const,
      coordinates: [
        [
          [47.79, 52.01],
          [47.8, 52.02],
        ],
        [
          [47.81, 52.03],
          [47.82, 52.04],
        ],
      ],
    };
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        ...userEventRow(),
        id: '00000000-0000-4000-8000-000000000505',
        source: 'TELEGRAM',
        createdByInstallationId: null,
        geometry,
        sourceText: 'Комарова притерлись',
        locationPrecision: 'STREET',
        locationLabel: 'Улица Комарова',
      },
    ]);
    tomTomTrafficProvider.getIncidents.mockResolvedValueOnce([]);

    await expect(service.list(query, IDENTITY_ID)).resolves.toEqual([
      expect.objectContaining({
        source: 'TELEGRAM',
        geometry,
        sourceText: 'Комарова притерлись',
        locationPrecision: 'STREET',
        locationLabel: 'Улица Комарова',
      }),
    ]);
  });

  it.each(['TIMEOUT', 'HTTP_ERROR'] as const)(
    'returns USER events after a controlled TomTom %s',
    async (code) => {
      tomTomTrafficProvider.getIncidents.mockRejectedValue(
        new TomTomIntegrationError(code, 'Controlled TomTom failure'),
      );

      const result = await service.list(query, IDENTITY_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: USER_EVENT_ID,
        source: 'USER',
      });
    },
  );

  it('filters TomTom geometry outside the requested viewport', async () => {
    tomTomTrafficProvider.getIncidents.mockResolvedValue([
      tomTomIncident({
        externalId: 'outside-point',
        geometry: {
          type: 'Point',
          coordinates: [47.9, 52.05],
        },
      }),
      tomTomIncident({
        externalId: 'outside-line',
        geometry: {
          type: 'LineString',
          coordinates: [
            [47.82, 52.04],
            [47.83, 52.05],
          ],
        },
      }),
    ]);

    const result = await service.list(query, IDENTITY_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('USER');
  });

  it('keeps a LineString that crosses the viewport without an inside vertex', async () => {
    const result = await service.list(query, IDENTITY_ID);

    expect(result).toContainEqual(
      expect.objectContaining({
        id: 'tomtom:incident-1',
        source: 'TOMTOM',
      }),
    );
  });

  it('keeps existing USER feedback behavior unchanged', async () => {
    const current = {
      ...userEventRow(),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([current])
        .mockResolvedValueOnce([{ action: 'CONFIRM' }])
        .mockResolvedValueOnce([
          {
            ...current,
            status: 'ACTIVE',
            confirmationCount: 3,
            lastConfirmedAt: new Date('2026-08-25T08:30:00.000Z'),
          },
        ]),
    };

    prisma.$transaction.mockImplementationOnce(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    await expect(
      service.feedback(USER_EVENT_ID, { action: 'CONFIRM' }, IDENTITY_ID),
    ).resolves.toMatchObject({
      id: USER_EVENT_ID,
      confirmationCount: 3,
      viewerRelation: 'CONFIRM',
    });
    expect(gateway.broadcastUpdated).toHaveBeenCalledTimes(1);
  });
});
