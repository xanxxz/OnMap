import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CityGeoImportCache } from './city-geo-import.cache';
import {
  parseGeocoderResponse,
  parseSuggestResponse,
  parseYandexBounds,
  parseYandexPoint,
  YandexCityGeoProvider,
} from './yandex-city-geo.provider';

const BOUNDS = { west: 47.5, south: 51.82, east: 48.2, north: 52.25 };

const suggestPayload = {
  results: [
    {
      title: { text: 'улица Комарова' },
      subtitle: { text: 'Балаково' },
      tags: ['street'],
      uri: 'ymapsbm1://geo?data=test',
      address: {
        formatted_address: 'Балаково, улица Комарова',
        component: [
          { name: 'Балаково', kind: ['LOCALITY'] },
          { name: 'улица Комарова', kind: ['STREET'] },
        ],
      },
    },
  ],
};

const geocoderPayload = {
  response: {
    GeoObjectCollection: {
      featureMember: [
        {
          GeoObject: {
            name: 'улица Комарова',
            uri: 'ymapsbm1://geo?data=test',
            Point: { pos: '47.80295 52.010021' },
            boundedBy: {
              Envelope: {
                lowerCorner: '47.790697 52.003562',
                upperCorner: '47.815221 52.016456',
              },
            },
            metaDataProperty: {
              GeocoderMetaData: {
                kind: 'street',
                precision: 'street',
                text: 'Россия, Балаково, улица Комарова',
                Address: {
                  formatted: 'Балаково, улица Комарова',
                  Components: [
                    { name: 'Балаково', kind: 'locality' },
                    { name: 'улица Комарова', kind: 'street' },
                  ],
                },
              },
            },
          },
        },
      ],
    },
  },
};

describe('Yandex city geo providers', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'city-geo-yandex-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('requires both Suggest and Geocoder credentials', () => {
    expect(
      () =>
        new YandexCityGeoProvider({
          suggestApiKey: '',
          geocoderApiKey: 'geocoder-secret',
          cache: new CityGeoImportCache(directory, false),
          requestDelayMs: 0,
        }),
    ).toThrow('YANDEX_CITY_IMPORT_CONFIG_MISSING');
  });

  it('normalizes Suggest title, URI, tags and structured components', () => {
    expect(parseSuggestResponse(suggestPayload)).toEqual([
      expect.objectContaining({
        title: 'улица Комарова',
        tags: ['street'],
        uri: 'ymapsbm1://geo?data=test',
        components: [
          { name: 'Балаково', kinds: ['LOCALITY'] },
          { name: 'улица Комарова', kinds: ['STREET'] },
        ],
      }),
    ]);
  });

  it('converts Yandex longitude-latitude order correctly', () => {
    expect(parseYandexPoint('47.80295 52.010021')).toEqual({
      latitude: 52.010021,
      longitude: 47.80295,
    });
  });

  it('parses boundedBy as bounds without inventing geometry', () => {
    expect(
      parseYandexBounds('47.790697 52.003562', '47.815221 52.016456'),
    ).toEqual({
      west: 47.790697,
      south: 52.003562,
      east: 47.815221,
      north: 52.016456,
    });
    const parsed = parseGeocoderResponse(geocoderPayload);
    expect(parsed?.bounds).not.toBeNull();
    expect(parsed?.actualGeometry).toBeNull();
  });

  it('parses Geocoder Point, kind, bounds and URI', () => {
    expect(parseGeocoderResponse(geocoderPayload)).toMatchObject({
      canonicalName: 'улица Комарова',
      kind: 'street',
      precision: 'street',
      uri: 'ymapsbm1://geo?data=test',
      point: { latitude: 52.010021, longitude: 47.80295 },
    });
  });

  it('supports Suggest URI to Geocoder flow and persistent cache', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(suggestPayload))
      .mockResolvedValueOnce(jsonResponse(geocoderPayload));
    const provider = providerFor(directory, fetchFn);
    const [candidate] = await provider.suggest({
      text: 'Комарова, Балаково',
      types: ['street'],
      bounds: BOUNDS,
    });
    const geocoded = await provider.geocodeUri(candidate?.uri ?? '');

    expect(geocoded?.kind).toBe('street');
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const cachedFetch = jest.fn();
    const cachedProvider = providerFor(directory, cachedFetch);
    await cachedProvider.suggest({
      text: 'Комарова, Балаково',
      types: ['street'],
      bounds: BOUNDS,
    });
    await cachedProvider.geocodeUri(candidate?.uri ?? '');
    expect(cachedFetch).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent identical requests', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(suggestPayload));
    const provider = providerFor(directory, fetchFn);
    await Promise.all([
      provider.suggest({ text: 'Комарова', types: ['street'], bounds: BOUNDS }),
      provider.suggest({ text: 'Комарова', types: ['street'], bounds: BOUNDS }),
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 429 response', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(
        new Response('{"message":"slow down"}', { status: 429 }),
      )
      .mockResolvedValueOnce(jsonResponse(suggestPayload));
    const provider = new YandexCityGeoProvider({
      suggestApiKey: 'suggest-secret',
      geocoderApiKey: 'geocoder-secret',
      cache: new CityGeoImportCache(directory, false),
      requestDelayMs: 0,
      maxRetries: 1,
      fetchFn,
    });
    await expect(
      provider.suggest({ text: 'Комарова', types: ['street'], bounds: BOUNDS }),
    ).resolves.toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('never includes credentials in controlled errors', async () => {
    const provider = providerFor(
      directory,
      jest
        .fn()
        .mockResolvedValue(
          new Response('{"message":"forbidden"}', { status: 403 }),
        ),
    );
    const error = await provider
      .suggest({ text: 'Комарова', types: ['street'], bounds: BOUNDS })
      .catch((caught: unknown) => caught);
    expect(String(error)).not.toContain('suggest-secret');
    expect(String(error)).not.toContain('geocoder-secret');
  });
});

const providerFor = (
  directory: string,
  fetchFn: jest.Mock,
): YandexCityGeoProvider =>
  new YandexCityGeoProvider({
    suggestApiKey: 'suggest-secret',
    geocoderApiKey: 'geocoder-secret',
    cache: new CityGeoImportCache(directory, false),
    requestDelayMs: 0,
    fetchFn: fetchFn as typeof fetch,
  });

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
