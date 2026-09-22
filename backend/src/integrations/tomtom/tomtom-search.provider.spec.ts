import { BALAKOVO_CITY_CONFIG } from '../../cities/balakovo/balakovo.config';

import {
  TOMTOM_SEARCH_CACHE_TTL_MS,
  TOMTOM_SEARCH_RESULT_LIMIT,
} from './tomtom.constants';
import { TomTomClient } from './tomtom.client';
import { TomTomIntegrationError } from './tomtom.errors';
import { TomTomSearchProvider } from './tomtom-search.provider';

const createResult = (id: string, latitude = 52.02, longitude = 47.8) => ({
  id,
  type: 'POI',
  score: 4.7,
  dist: 320,
  poi: {
    name: 'ТЦ Оранж',
  },
  address: {
    freeformAddress: 'ул. Степная, Балаково',
  },
  position: {
    lat: latitude,
    lon: longitude,
  },
});

describe('TomTomSearchProvider', () => {
  let now: number;
  let client: {
    isAvailable: jest.Mock;
    requestJson: jest.Mock;
  };
  let provider: TomTomSearchProvider;

  beforeEach(() => {
    now = Date.parse('2026-08-25T08:20:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    client = {
      isAvailable: jest.fn().mockReturnValue(true),
      requestJson: jest.fn().mockResolvedValue({
        results: [createResult('search-1')],
      }),
    };

    provider = new TomTomSearchProvider(client as unknown as TomTomClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes a valid Search response', async () => {
    await expect(provider.search('ТЦ Оранж', 'balakovo')).resolves.toEqual([
      {
        externalId: 'search-1',
        source: 'TOMTOM',
        name: 'ТЦ Оранж',
        address: 'ул. Степная, Балаково',
        position: {
          latitude: 52.02,
          longitude: 47.8,
        },
        type: 'POI',
        score: 4.7,
        distanceMeters: 320,
      },
    ]);
  });

  it('filters candidates outside the backend Balakovo bounds', async () => {
    client.requestJson.mockResolvedValue({
      results: [createResult('outside', 55, 40), createResult('inside')],
    });

    const candidates = await provider.search('вокзал', 'balakovo');

    expect(candidates.map(({ externalId }) => externalId)).toEqual(['inside']);
  });

  it('preserves coordinates, name and address for the top result', async () => {
    const [candidate] = await provider.search('Оранж', 'balakovo');

    expect(candidate).toEqual(
      expect.objectContaining({
        name: 'ТЦ Оранж',
        address: 'ул. Степная, Балаково',
        position: {
          latitude: 52.02,
          longitude: 47.8,
        },
      }),
    );
  });

  it('limits the normalized result set to five candidates', async () => {
    client.requestJson.mockResolvedValue({
      results: Array.from({ length: 8 }, (_, index) =>
        createResult(`result-${index}`),
      ),
    });

    const candidates = await provider.search('мост', 'balakovo');

    expect(candidates).toHaveLength(TOMTOM_SEARCH_RESULT_LIMIT);
  });

  it('uses the existing city bbox in Search API constraints', async () => {
    await provider.search('Менделеева', 'balakovo');

    expect(client.requestJson).toHaveBeenCalledWith(
      'Fuzzy Search',
      expect.stringContaining('/search/2/search/'),
      expect.objectContaining({
        topLeft: `${BALAKOVO_CITY_CONFIG.coverageBounds.north},${BALAKOVO_CITY_CONFIG.coverageBounds.west}`,
        btmRight: `${BALAKOVO_CITY_CONFIG.coverageBounds.south},${BALAKOVO_CITY_CONFIG.coverageBounds.east}`,
        geobias: `point:${BALAKOVO_CITY_CONFIG.center.latitude},${BALAKOVO_CITY_CONFIG.center.longitude}`,
        countrySet: 'RU',
        limit: String(TOMTOM_SEARCH_RESULT_LIMIT),
      }),
    );
  });

  it('uses cache for equivalent normalized queries', async () => {
    await provider.search('  Менделеева   Комарова ', 'balakovo');
    await provider.search('менделеева комарова', 'balakovo');

    expect(client.requestJson).toHaveBeenCalledTimes(1);
  });

  it('keeps cache entries independent for different queries', async () => {
    await provider.search('Менделеева', 'balakovo');
    await provider.search('Комарова', 'balakovo');

    expect(client.requestJson).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent equivalent searches', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    const deferred = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });

    client.requestJson.mockReturnValue(deferred);

    const first = provider.search('Менделеева', 'balakovo');
    const second = provider.search(' менделеева ', 'balakovo');

    expect(client.requestJson).toHaveBeenCalledTimes(1);

    resolveRequest?.({ results: [createResult('search-1')] });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('fetches a normalized query again after the Search cache TTL', async () => {
    await provider.search('Менделеева', 'balakovo');
    now += TOMTOM_SEARCH_CACHE_TTL_MS;
    await provider.search('менделеева', 'balakovo');

    expect(client.requestJson).toHaveBeenCalledTimes(2);
  });

  it('reports a controlled disabled error without an API key', async () => {
    client.isAvailable.mockReturnValue(false);

    await expect(provider.search('вокзал', 'balakovo')).rejects.toMatchObject({
      code: 'DISABLED',
    });
    expect(client.requestJson).not.toHaveBeenCalled();
  });

  it('propagates a controlled TomTom HTTP error', async () => {
    client.requestJson.mockRejectedValue(
      new TomTomIntegrationError('HTTP_ERROR', 'Controlled failure', 503),
    );

    await expect(provider.search('вокзал', 'balakovo')).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      httpStatus: 503,
    });
  });

  it('rejects malformed responses without caching fake results', async () => {
    client.requestJson.mockResolvedValueOnce({ results: null });

    await expect(provider.search('вокзал', 'balakovo')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });

    client.requestJson.mockResolvedValueOnce({
      results: [createResult('valid')],
    });

    await expect(provider.search('вокзал', 'balakovo')).resolves.toHaveLength(
      1,
    );
    expect(client.requestJson).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty query without requesting TomTom', async () => {
    await expect(provider.search('   ', 'balakovo')).rejects.toMatchObject({
      code: 'INVALID_QUERY',
    });
    expect(client.requestJson).not.toHaveBeenCalled();
  });
});
