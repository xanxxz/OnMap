import { BALAKOVO_CITY_CONFIG } from '../../cities/balakovo/balakovo.config';

import {
  TOMTOM_TRAFFIC_CACHE_TTL_MS,
  TOMTOM_TRAFFIC_INCIDENTS_ENDPOINT,
} from './tomtom.constants';
import { TomTomClient } from './tomtom.client';
import { TomTomIntegrationError } from './tomtom.errors';
import { TomTomTrafficProvider } from './tomtom-traffic.provider';

const point = [47.8, 52.02];

const createIncident = (
  iconCategory: number,
  geometry: unknown = {
    type: 'Point',
    coordinates: point,
  },
  id = `incident-${iconCategory}`,
) => ({
  type: 'Feature',
  geometry,
  properties: {
    id,
    iconCategory,
    events: [
      {
        description: 'Замедленное движение',
        iconCategory,
      },
    ],
    from: 'Начало участка',
    to: 'Конец участка',
    startTime: '2026-08-25T08:00:00Z',
    endTime: '2026-08-25T09:00:00Z',
    delay: 120,
    length: 640,
    lastReportTime: '2026-08-25T08:15:00Z',
    timeValidity: 'present',
    probabilityOfOccurrence: 'certain',
    numberOfReports: 4,
  },
});

describe('TomTomTrafficProvider', () => {
  let now: number;
  let client: {
    isAvailable: jest.Mock;
    requestJson: jest.Mock;
  };
  let provider: TomTomTrafficProvider;

  beforeEach(() => {
    now = Date.parse('2026-08-25T08:20:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    client = {
      isAvailable: jest.fn().mockReturnValue(true),
      requestJson: jest
        .fn()
        .mockResolvedValue({ incidents: [createIncident(6)] }),
    };

    provider = new TomTomTrafficProvider(client as unknown as TomTomClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps a valid Incident response to the internal external event model', async () => {
    await expect(provider.getIncidents('balakovo')).resolves.toEqual([
      expect.objectContaining({
        externalId: 'incident-6',
        source: 'TOMTOM',
        type: 'TRAFFIC_JAM',
        title: 'Затруднение движения',
        description: 'Замедленное движение',
        from: 'Начало участка',
        to: 'Конец участка',
        startTime: '2026-08-25T08:00:00Z',
        endTime: '2026-08-25T09:00:00Z',
        timeValidity: 'present',
        probabilityOfOccurrence: 'certain',
        numberOfReports: 4,
        delaySeconds: 120,
        lengthMeters: 640,
        updatedAt: '2026-08-25T08:15:00Z',
        fetchedAt: '2026-08-25T08:20:00.000Z',
        rawCategory: 6,
      }),
    ]);
  });

  it.each([
    [6, 'TRAFFIC_JAM'],
    [1, 'ACCIDENT'],
    [9, 'ROADWORKS'],
    [8, 'ROAD_CLOSURE'],
    [3, 'HAZARD'],
    [99, 'OTHER'],
  ] as const)('maps icon category %s to %s', async (category, expectedType) => {
    client.requestJson.mockResolvedValue({
      incidents: [createIncident(category)],
    });

    const [incident] = await provider.getIncidents('balakovo');

    expect(incident?.type).toBe(expectedType);
  });

  it('preserves Point geometry', async () => {
    const [incident] = await provider.getIncidents('balakovo');

    expect(incident?.geometry).toEqual({
      type: 'Point',
      coordinates: point,
    });
  });

  it('preserves the complete LineString geometry', async () => {
    const coordinates = [
      [47.79, 52.01],
      [47.8, 52.02],
      [47.81, 52.03],
    ];

    client.requestJson.mockResolvedValue({
      incidents: [
        createIncident(9, {
          type: 'LineString',
          coordinates,
        }),
      ],
    });

    const [incident] = await provider.getIncidents('balakovo');

    expect(incident?.geometry).toEqual({
      type: 'LineString',
      coordinates,
    });
  });

  it('builds the request bbox from the existing Balakovo city config', async () => {
    await provider.getIncidents('balakovo');

    expect(client.requestJson).toHaveBeenCalledWith(
      'Traffic Incident Details',
      TOMTOM_TRAFFIC_INCIDENTS_ENDPOINT,
      expect.objectContaining({
        bbox: [
          BALAKOVO_CITY_CONFIG.coverageBounds.west,
          BALAKOVO_CITY_CONFIG.coverageBounds.south,
          BALAKOVO_CITY_CONFIG.coverageBounds.east,
          BALAKOVO_CITY_CONFIG.coverageBounds.north,
        ].join(','),
      }),
    );
  });

  it('skips incidents with damaged or out-of-city geometry', async () => {
    client.requestJson.mockResolvedValue({
      incidents: [
        createIncident(1, { type: 'Point', coordinates: ['bad', 52] }),
        createIncident(9, { type: 'Point', coordinates: [40, 55] }),
        createIncident(6),
      ],
    });

    const incidents = await provider.getIncidents('balakovo');

    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.externalId).toBe('incident-6');
  });

  it('rejects an unsupported city before requesting TomTom', async () => {
    await expect(provider.getIncidents('unknown')).rejects.toMatchObject({
      code: 'UNSUPPORTED_CITY',
    });
    expect(client.requestJson).not.toHaveBeenCalled();
  });

  it('serves repeated calls from cache during the TTL', async () => {
    const first = await provider.getIncidents('balakovo');
    now += TOMTOM_TRAFFIC_CACHE_TTL_MS - 1;
    const second = await provider.getIncidents('balakovo');

    expect(second).toBe(first);
    expect(client.requestJson).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests for the same city', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    const deferred = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });

    client.requestJson.mockReturnValue(deferred);

    const first = provider.getIncidents('balakovo');
    const second = provider.getIncidents('balakovo');

    expect(client.requestJson).toHaveBeenCalledTimes(1);

    resolveRequest?.({ incidents: [createIncident(6)] });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('fetches again after the cache TTL expires', async () => {
    await provider.getIncidents('balakovo');
    now += TOMTOM_TRAFFIC_CACHE_TTL_MS;
    await provider.getIncidents('balakovo');

    expect(client.requestJson).toHaveBeenCalledTimes(2);
  });

  it('reports a controlled disabled error without an API key', async () => {
    client.isAvailable.mockReturnValue(false);

    await expect(provider.getIncidents('balakovo')).rejects.toMatchObject({
      code: 'DISABLED',
    });
    expect(client.requestJson).not.toHaveBeenCalled();
  });

  it.each(['HTTP_ERROR', 'TIMEOUT'] as const)(
    'propagates a controlled %s integration error',
    async (code) => {
      client.requestJson.mockRejectedValue(
        new TomTomIntegrationError(code, 'Controlled TomTom failure'),
      );

      await expect(provider.getIncidents('balakovo')).rejects.toMatchObject({
        code,
      });
    },
  );

  it('rejects a malformed top-level response without poisoning the cache', async () => {
    client.requestJson.mockResolvedValueOnce({ incidents: 'invalid' });

    await expect(provider.getIncidents('balakovo')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });

    client.requestJson.mockResolvedValueOnce({
      incidents: [createIncident(6)],
    });

    await expect(provider.getIncidents('balakovo')).resolves.toHaveLength(1);
    expect(client.requestJson).toHaveBeenCalledTimes(2);
  });
});
