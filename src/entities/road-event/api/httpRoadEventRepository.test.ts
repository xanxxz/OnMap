const mockHttpRequest = jest.fn();

jest.mock('../../../shared/api/httpClient', () => ({
  httpRequest: (...args: unknown[]) => mockHttpRequest(...args),
}));

import { roadEventRepository } from './httpRoadEventRepository';

const roadEvent = {
  id: 'event-1',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'UNCONFIRMED',
  title: 'ДТП',
  coordinate: [47.8007, 52.0278],
  confirmationCount: 1,
  rejectionCount: 0,
  confidence: 2 / 3,
  createdAt: '2026-08-20T12:00:00.000Z',
  expiresAt: '2026-08-20T14:00:00.000Z',
};

const userListEvent = {
  ...roadEvent,
  source: 'USER',
  geometry: {
    type: 'Point',
    coordinates: [47.8007, 52.0278],
  },
};

const tomTomPointEvent = {
  id: 'tomtom:point-1',
  source: 'TOMTOM',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  geometry: {
    type: 'Point',
    coordinates: [47.801, 52.028],
  },
  title: 'ДТП',
  description: 'Дорожное происшествие',
  fetchedAt: '2026-08-25T08:20:00.000Z',
};

const tomTomLineEvent = {
  id: 'tomtom:line-1',
  source: 'TOMTOM',
  cityId: 'balakovo',
  type: 'TRAFFIC_JAM',
  geometry: {
    type: 'LineString',
    coordinates: [
      [47.79, 52.02],
      [47.81, 52.03],
    ],
  },
  title: 'Затруднение движения',
  fetchedAt: '2026-08-25T08:20:00.000Z',
};

const telegramEvent = {
  id: 'telegram:event-1',
  source: 'TELEGRAM',
  cityId: 'balakovo',
  type: 'ROAD_HAZARD',
  status: 'ACTIVE',
  title: 'Опасность на дороге',
  description: 'Препятствие возле вокзала',
  coordinate: [47.802, 52.029],
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2026-08-25T10:00:00.000Z',
};

describe('HTTP RoadEvent API contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not send installationId in list query', async () => {
    mockHttpRequest.mockResolvedValueOnce([]);

    await roadEventRepository.list({
      cityId: 'balakovo',
      bounds: [47.64, 51.9, 48.04, 52.16],
    });

    const path = mockHttpRequest.mock.calls[0]?.[0] as string;

    expect(path).not.toContain('installationId');
  });

  it('parses a unified USER event without changing user fields', async () => {
    mockHttpRequest.mockResolvedValueOnce([userListEvent]);

    const [event] = await roadEventRepository.list({
      cityId: 'balakovo',
      bounds: [47.64, 51.9, 48.04, 52.16],
    });

    expect(event).toMatchObject({
      source: 'USER',
      type: 'ACCIDENT',
      confirmationCount: 1,
      geometry: userListEvent.geometry,
    });
  });

  it('parses a TOMTOM Point event without user voting fields', async () => {
    mockHttpRequest.mockResolvedValueOnce([tomTomPointEvent]);

    const [event] = await roadEventRepository.list({
      cityId: 'balakovo',
      bounds: [47.64, 51.9, 48.04, 52.16],
    });

    expect(event).toMatchObject({
      id: 'tomtom:point-1',
      source: 'TOMTOM',
      geometry: tomTomPointEvent.geometry,
    });
    expect(event).not.toHaveProperty('confidence');
  });

  it('parses and preserves a TOMTOM LineString', async () => {
    mockHttpRequest.mockResolvedValueOnce([tomTomLineEvent]);

    const [event] = await roadEventRepository.list({
      cityId: 'balakovo',
      bounds: [47.64, 51.9, 48.04, 52.16],
    });

    expect(event).toMatchObject({
      id: 'tomtom:line-1',
      source: 'TOMTOM',
      geometry: tomTomLineEvent.geometry,
    });
  });

  it('parses a TELEGRAM point event without USER voting fields', async () => {
    mockHttpRequest.mockResolvedValueOnce([telegramEvent]);

    const [event] = await roadEventRepository.list({
      cityId: 'balakovo',
      bounds: [47.64, 51.9, 48.04, 52.16],
    });

    expect(event).toMatchObject({
      id: 'telegram:event-1',
      source: 'TELEGRAM',
      type: 'ROAD_HAZARD',
      geometry: {
        type: 'Point',
        coordinates: telegramEvent.coordinate,
      },
    });
    expect(event).not.toHaveProperty('confidence');
    expect(event).not.toHaveProperty('confirmationCount');
  });

  it('safely ignores a future unknown source in a mixed list', async () => {
    mockHttpRequest.mockResolvedValueOnce([
      telegramEvent,
      {
        ...telegramEvent,
        id: 'future-1',
        source: 'FUTURE_PROVIDER',
      },
    ]);

    await expect(
      roadEventRepository.list({
        cityId: 'balakovo',
        bounds: [47.64, 51.9, 48.04, 52.16],
      }),
    ).resolves.toHaveLength(1);
  });

  it('does not send installationId in create body', async () => {
    mockHttpRequest.mockResolvedValueOnce(roadEvent);

    await roadEventRepository.create({
      cityId: 'balakovo',
      type: 'ACCIDENT',
      title: 'ДТП',
      coordinate: [47.8007, 52.0278],
    });

    const options = mockHttpRequest.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;

    expect(body).not.toHaveProperty('installationId');
  });

  it('accepts an existing Telegram DPS marker when nearby create confirms it', async () => {
    mockHttpRequest.mockResolvedValueOnce({
      ...telegramEvent,
      type: 'ROAD_PATROL',
      confirmationCount: 2,
      rejectionCount: 0,
      confidence: 0.75,
    });

    await expect(
      roadEventRepository.create({
        cityId: 'balakovo',
        type: 'ROAD_PATROL',
        title: 'ДПС',
        coordinate: [47.802, 52.029],
      }),
    ).resolves.toMatchObject({
      source: 'TELEGRAM',
      type: 'ROAD_PATROL',
      confirmationCount: 2,
    });
  });

  it('loads the citywide DPS summary including unlocated reports', async () => {
    mockHttpRequest.mockResolvedValueOnce({
      cityId: 'balakovo',
      onMap: 3,
      unlocated: 2,
      total: 5,
    });

    await expect(
      roadEventRepository.getDpsActivitySummary('balakovo'),
    ).resolves.toEqual({
      cityId: 'balakovo',
      onMap: 3,
      unlocated: 2,
      total: 5,
    });

    expect(mockHttpRequest).toHaveBeenCalledWith(
      '/road-events/dps-summary?cityId=balakovo',
    );
  });

  it('does not send installationId in feedback body', async () => {
    mockHttpRequest.mockResolvedValueOnce(roadEvent);

    await roadEventRepository.feedback({
      cityId: 'balakovo',
      eventId: 'event-1',
      action: 'CONFIRM',
    });

    const options = mockHttpRequest.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;

    expect(body).toEqual({ action: 'CONFIRM' });
  });
});
