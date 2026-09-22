import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { BALAKOVO_CITY_CONFIG } from '../../../cities/balakovo/balakovo.config';

import {
  buildOverpassQuery,
  buildOsmStreetCacheKey,
  mapOverpassStreetGeometry,
  OsmStreetGeometryProvider,
} from './osm-street-geometry.provider';

const bounds = BALAKOVO_CITY_CONFIG.coverageBounds;
const primaryEndpoint = 'https://primary.overpass.test/api';
const fallbackEndpoint = 'https://fallback.overpass.test/api';

const way = (
  id: number,
  name = 'улица Комарова',
  geometry: unknown = [
    { lat: 52.01, lon: 47.79 },
    { lat: 52.011, lon: 47.8 },
  ],
) => ({
  type: 'way',
  id,
  tags: { highway: 'residential', name },
  geometry,
});

const response = (elements: readonly unknown[]): Response =>
  new Response(JSON.stringify({ elements }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('OsmStreetGeometryProvider', () => {
  let directory: string;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'roadradar-osm-streets-'));
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    await rm(directory, { recursive: true, force: true });
  });

  const setup = (
    fetchFn: jest.Mock = jest.fn().mockResolvedValue(response([])),
    now?: () => number,
  ) => {
    const config = new ConfigService({
      OSM_STREET_GEOMETRY_ENABLED: 'true',
      OSM_STREET_GEOMETRY_CACHE_DIR: directory,
      OSM_OVERPASS_URLS: `${primaryEndpoint},${fallbackEndpoint}`,
    });

    return {
      provider: OsmStreetGeometryProvider.createForTesting(config, {
        fetchFn,
        ...(now === undefined ? {} : { now }),
      }),
      fetchFn,
    };
  };

  const resolveKomarova = (provider: OsmStreetGeometryProvider) =>
    provider.resolve({
      cityId: 'balakovo',
      canonicalLocation: 'komarova',
      displayName: 'Улица Комарова',
    });

  const resolveMira = (provider: OsmStreetGeometryProvider) =>
    provider.resolve({
      cityId: 'balakovo',
      canonicalLocation: 'mira',
      displayName: 'Улица Мира',
    });

  it('maps one OSM way to a LineString', async () => {
    const { provider, fetchFn } = setup(
      jest.fn().mockResolvedValue(response([way(1)])),
    );

    await expect(resolveKomarova(provider)).resolves.toMatchObject({
      status: 'RESOLVED',
      provider: 'OSM',
      geometry: { type: 'LineString' },
      endpointIndex: 0,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(primaryEndpoint, expect.any(Object));
  });

  it('builds a POSIX-compatible bounded Overpass query', () => {
    const query = buildOverpassQuery(['Улица Комарова', 'Комарова'], bounds);

    expect(query).toContain('(51.82,47.5,52.25,48.2)');
    expect(query).toContain('^(Улица Комарова|Комарова)$');
    expect(query).not.toContain('(?:');
  });

  it('keeps disconnected OSM ways as one MultiLineString event geometry', async () => {
    const { provider } = setup(
      jest.fn().mockResolvedValue(
        response([
          way(1),
          way(2, 'Комарова', [
            { lat: 52.02, lon: 47.81 },
            { lat: 52.021, lon: 47.82 },
          ]),
        ]),
      ),
    );

    await expect(resolveKomarova(provider)).resolves.toMatchObject({
      status: 'RESOLVED',
      geometry: { type: 'MultiLineString' },
    });
  });

  it('merges ways only when their endpoints are actually connected', () => {
    const result = mapOverpassStreetGeometry(
      {
        elements: [
          way(1),
          way(2, 'Комарова', [
            { lat: 52.011, lon: 47.8 },
            { lat: 52.012, lon: 47.81 },
          ]),
        ],
      },
      ['Улица Комарова', 'Комарова'],
      bounds,
    );

    expect(result).toMatchObject({
      status: 'RESOLVED',
      geometry: { type: 'LineString' },
    });
  });

  it('rejects an unrelated same-name way outside city coverage', () => {
    expect(
      mapOverpassStreetGeometry(
        {
          elements: [
            way(1, 'Комарова', [
              { lat: 55.7, lon: 37.6 },
              { lat: 55.71, lon: 37.61 },
            ]),
          ],
        },
        ['Комарова'],
        bounds,
      ),
    ).toEqual({ status: 'NOT_FOUND', provider: 'OSM' });
  });

  it('returns NOT_FOUND when Overpass has no matching ways', async () => {
    const { provider, fetchFn } = setup();

    await expect(resolveKomarova(provider)).resolves.toMatchObject({
      status: 'NOT_FOUND',
      provider: 'OSM',
      endpointIndex: 0,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns AMBIGUOUS for multiple accepted but different street identities', () => {
    expect(
      mapOverpassStreetGeometry(
        { elements: [way(1), way(2, 'Комарова проезд')] },
        ['Комарова', 'Комарова проезд'],
        bounds,
      ),
    ).toEqual({ status: 'AMBIGUOUS', provider: 'OSM' });
  });

  it('rejects invalid way geometry', () => {
    expect(
      mapOverpassStreetGeometry(
        { elements: [way(1, 'Комарова', [{ lat: 'bad', lon: 47.8 }])] },
        ['Комарова'],
        bounds,
      ),
    ).toEqual({ status: 'NOT_FOUND', provider: 'OSM' });
  });

  it('uses fallback after a primary timeout', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('timeout'), { name: 'AbortError' }),
      )
      .mockResolvedValueOnce(response([way(1)]));
    const { provider } = setup(fetchFn);

    await expect(resolveKomarova(provider)).resolves.toMatchObject({
      status: 'RESOLVED',
      endpointIndex: 1,
    });
    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      primaryEndpoint,
      expect.any(Object),
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      fallbackEndpoint,
      expect.any(Object),
    );
  });

  it('uses fallback after a primary HTTP 500', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(response([way(1)]));
    const { provider } = setup(fetchFn);

    await expect(resolveKomarova(provider)).resolves.toMatchObject({
      status: 'RESOLVED',
      endpointIndex: 1,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not use fallback after a primary HTTP 4xx', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    const { provider } = setup(fetchFn);

    await expect(resolveKomarova(provider)).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      provider: 'OSM',
      endpointIndex: 0,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('uses fallback for an explicitly transient HTTP 429', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(response([way(1)]));
    const { provider } = setup(fetchFn);

    await expect(resolveKomarova(provider)).resolves.toMatchObject({
      status: 'RESOLVED',
      endpointIndex: 1,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns UNAVAILABLE after both endpoints time out', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('timeout'), { name: 'AbortError' }),
      );
    const { provider } = setup(fetchFn);

    await expect(resolveKomarova(provider)).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      provider: 'OSM',
      endpointIndex: 1,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('uses fallback once for an invalid primary response', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(new Response('{broken json', { status: 200 }))
      .mockResolvedValueOnce(response([way(1)]));
    const { provider } = setup(fetchFn);

    await expect(resolveKomarova(provider)).resolves.toMatchObject({
      status: 'RESOLVED',
      endpointIndex: 1,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('temporarily prefers a successful fallback endpoint', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(response([way(1)]))
      .mockResolvedValueOnce(response([way(2, 'Улица Мира')]));
    const { provider } = setup(fetchFn);

    await resolveKomarova(provider);
    await resolveMira(provider);

    expect(fetchFn).toHaveBeenNthCalledWith(
      3,
      fallbackEndpoint,
      expect.any(Object),
    );
  });

  it('returns to the primary endpoint after preference TTL', async () => {
    let timestamp = Date.parse('2026-09-14T08:00:00.000Z');
    const fetchFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(response([way(1)]))
      .mockResolvedValueOnce(response([way(2, 'Улица Мира')]));
    const { provider } = setup(fetchFn, () => timestamp);

    await resolveKomarova(provider);
    timestamp += 20 * 60_000 + 1;
    await resolveMira(provider);

    expect(fetchFn).toHaveBeenNthCalledWith(
      3,
      primaryEndpoint,
      expect.any(Object),
    );
  });

  it('serves a successful lookup from cache without another HTTP call', async () => {
    const { provider, fetchFn } = setup(
      jest.fn().mockResolvedValue(response([way(1)])),
    );

    await resolveKomarova(provider);
    await resolveKomarova(provider);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('negative-caches NOT_FOUND', async () => {
    const { provider, fetchFn } = setup();

    await resolveKomarova(provider);
    await resolveKomarova(provider);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not negative-cache UNAVAILABLE', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('network'));
    const { provider } = setup(fetchFn);

    await resolveKomarova(provider);
    await resolveKomarova(provider);

    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('allows tests to advance time and expire the successful cache', async () => {
    let timestamp = Date.parse('2026-09-14T08:00:00.000Z');
    const fetchFn = jest.fn().mockImplementation(() => response([way(1)]));
    const { provider } = setup(fetchFn, () => timestamp);

    await resolveKomarova(provider);
    timestamp += 24 * 60 * 60_000 + 1;
    await resolveKomarova(provider);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent lookups for the same canonical street', async () => {
    let release: ((value: Response) => void) | undefined;
    const fetchFn = jest.fn(
      () =>
        new Promise<Response>((resolvePromise) => {
          release = resolvePromise;
        }),
    );
    const { provider } = setup(fetchFn);
    const first = resolveKomarova(provider);
    const second = resolveKomarova(provider);

    await Promise.resolve();
    release?.(response([way(1)]));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('uses cityId in cache keys', () => {
    expect(buildOsmStreetCacheKey('balakovo', 'komarova')).not.toBe(
      buildOsmStreetCacheKey('saratov', 'komarova'),
    );
  });

  it('persists resolved geometry without logging coordinate arrays', async () => {
    const { provider } = setup(jest.fn().mockResolvedValue(response([way(1)])));

    await resolveKomarova(provider);
    const cache = JSON.parse(
      await readFile(join(directory, 'balakovo.json'), 'utf8'),
    ) as { cityId: string; streets: Record<string, unknown> };

    expect(cache.cityId).toBe('balakovo');
    expect(cache.streets.komarova).toBeDefined();
  });

  it('serves a persistent cache hit without calling any endpoint', async () => {
    const first = setup(jest.fn().mockResolvedValue(response([way(1)])));

    await resolveKomarova(first.provider);

    const fetchFn = jest.fn().mockRejectedValue(new Error('must not fetch'));
    const second = setup(fetchFn);

    await expect(resolveKomarova(second.provider)).resolves.toMatchObject({
      status: 'RESOLVED',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('logs only safe endpoint position and failure classification', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('secret-looking network detail'))
      .mockResolvedValueOnce(response([way(1)]));
    const { provider } = setup(fetchFn);

    await resolveKomarova(provider);

    expect(warnSpy).toHaveBeenCalledWith(
      'OSM street geometry endpoint failed endpoint=primary reason=NETWORK fallback=true',
    );
    expect(logSpy).toHaveBeenCalledWith(
      'OSM street geometry resolved endpoint=fallback geometry=LineString segments=1',
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(
      'secret-looking network detail',
    );
  });

  it('returns UNAVAILABLE without HTTP when feature flag is disabled', async () => {
    const fetchFn = jest.fn();
    const provider = OsmStreetGeometryProvider.createForTesting(
      new ConfigService({ OSM_STREET_GEOMETRY_ENABLED: 'false' }),
      { fetchFn },
    );

    await expect(resolveKomarova(provider)).resolves.toEqual({
      status: 'UNAVAILABLE',
      provider: 'OSM',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('compiles in a real Nest container with ConfigService as its only dependency', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ConfigService, OsmStreetGeometryProvider],
    }).compile();

    expect(moduleRef.get(OsmStreetGeometryProvider)).toBeInstanceOf(
      OsmStreetGeometryProvider,
    );

    await moduleRef.close();
  });
});
