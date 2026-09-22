import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getCityConfig } from '../../../cities/city.registry';
import type { CityBounds } from '../../../cities/city.types';
import type {
  ExternalLineStringGeometry,
  ExternalMultiLineStringGeometry,
} from '../../tomtom/tomtom.types';

import type {
  TelegramStreetGeometryInput,
  TelegramStreetGeometryProvider,
  TelegramStreetGeometryResult,
} from './telegram-street-geometry.provider';

export const OSM_STREET_GEOMETRY_ENABLED_ENV = 'OSM_STREET_GEOMETRY_ENABLED';
export const OSM_OVERPASS_URL_ENV = 'OSM_OVERPASS_URL';
export const OSM_OVERPASS_URLS_ENV = 'OSM_OVERPASS_URLS';
export const OSM_STREET_GEOMETRY_CACHE_DIR_ENV =
  'OSM_STREET_GEOMETRY_CACHE_DIR';

const DEFAULT_OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const;
const DEFAULT_CACHE_DIRECTORY = 'runtime-data/osm-streets';
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_ENDPOINT_ATTEMPTS = 2;
const PREFERRED_ENDPOINT_TTL_MS = 20 * 60_000;
const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60_000;
const NEGATIVE_CACHE_TTL_MS = 60 * 60_000;
const CACHE_MAX_ENTRIES = 500;
const PROVIDER_CONFIDENCE = 0.95;

type FetchLike = typeof fetch;
type EndpointFailureReason =
  'TIMEOUT' | 'NETWORK' | 'HTTP_5XX' | 'HTTP_4XX' | 'INVALID_RESPONSE';
type ResolvedStreetGeometry =
  ExternalLineStringGeometry | ExternalMultiLineStringGeometry;

interface CacheEntry {
  readonly fetchedAt: string;
  readonly result: TelegramStreetGeometryResult;
}

interface PersistentCityCache {
  readonly version: 1;
  readonly cityId: string;
  readonly streets: Readonly<Record<string, CacheEntry>>;
}

interface OverpassWay {
  readonly type?: unknown;
  readonly tags?: unknown;
  readonly geometry?: unknown;
}

@Injectable()
export class OsmStreetGeometryProvider implements TelegramStreetGeometryProvider {
  private readonly logger = new Logger(OsmStreetGeometryProvider.name);
  private readonly enabled: boolean;
  private readonly endpoints: readonly string[];
  private readonly cacheDirectory: string;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly loadedCities = new Set<string>();
  private readonly inFlight = new Map<
    string,
    Promise<TelegramStreetGeometryResult>
  >();
  private fetchFn: FetchLike = globalThis.fetch.bind(globalThis);
  private now: () => number = () => Date.now();
  private writeQueue = Promise.resolve();
  private preferredEndpoint: {
    readonly index: number;
    readonly until: number;
  } | null = null;

  constructor(configService: ConfigService) {
    const enabled = configService.get<unknown>(OSM_STREET_GEOMETRY_ENABLED_ENV);

    this.enabled =
      enabled === true ||
      (typeof enabled === 'string' && enabled.trim().toLowerCase() === 'true');
    this.endpoints = configuredOverpassEndpoints(configService);
    this.cacheDirectory = resolve(
      process.cwd(),
      configurationString(
        configService.get(OSM_STREET_GEOMETRY_CACHE_DIR_ENV),
      ) || DEFAULT_CACHE_DIRECTORY,
    );
  }

  static createForTesting(
    configService: ConfigService,
    overrides: {
      readonly fetchFn?: FetchLike;
      readonly now?: () => number;
    } = {},
  ): OsmStreetGeometryProvider {
    const provider = new OsmStreetGeometryProvider(configService);

    provider.fetchFn = overrides.fetchFn ?? globalThis.fetch.bind(globalThis);
    provider.now = overrides.now ?? (() => Date.now());

    return provider;
  }

  async resolve(
    input: TelegramStreetGeometryInput,
  ): Promise<TelegramStreetGeometryResult> {
    if (!this.enabled) {
      return { status: 'UNAVAILABLE', provider: 'OSM' };
    }

    const city = getCityConfig(input.cityId);
    const location = city?.locations.find(
      (candidate) => candidate.id === input.canonicalLocation,
    );

    if (city === undefined || location?.kind !== 'STREET') {
      return { status: 'NOT_FOUND', provider: 'OSM' };
    }

    await this.loadCityCache(city.id);
    const key = buildOsmStreetCacheKey(city.id, location.id);
    const cached = this.getCached(key);

    if (cached !== null) {
      return cached;
    }

    const pending = this.inFlight.get(key);

    if (pending !== undefined) {
      return pending;
    }

    const lookup = this.lookup({
      cityId: city.id,
      locationId: location.id,
      names: uniqueStreetNames(location.title, location.aliases),
      bounds: city.coverageBounds,
    }).finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, lookup);

    return lookup;
  }

  private async lookup(input: {
    cityId: string;
    locationId: string;
    names: readonly string[];
    bounds: CityBounds;
  }): Promise<TelegramStreetGeometryResult> {
    const query = buildOverpassQuery(input.names, input.bounds);
    const endpointOrder = this.endpointOrder();

    for (let attempt = 0; attempt < endpointOrder.length; attempt += 1) {
      const endpointIndex = endpointOrder[attempt];

      if (endpointIndex === undefined) continue;

      const endpoint = this.endpoints[endpointIndex];

      if (endpoint === undefined) continue;

      const hasNextEndpoint = attempt + 1 < endpointOrder.length;
      let response: Response;

      try {
        response = await this.fetchOverpass(endpoint, query);
      } catch (error) {
        const reason = isAbortError(error) ? 'TIMEOUT' : 'NETWORK';

        this.logEndpointFailure(endpointIndex, reason, hasNextEndpoint);
        if (hasNextEndpoint) continue;

        return unavailableResult(endpointIndex);
      }

      if (!response.ok) {
        const reason: EndpointFailureReason =
          response.status >= 500 ? 'HTTP_5XX' : 'HTTP_4XX';
        const shouldFallback =
          (reason === 'HTTP_5XX' || isTransientHttpStatus(response.status)) &&
          hasNextEndpoint;

        this.logEndpointFailure(endpointIndex, reason, shouldFallback);
        if (shouldFallback) continue;

        return unavailableResult(endpointIndex);
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        this.logEndpointFailure(
          endpointIndex,
          'INVALID_RESPONSE',
          hasNextEndpoint,
        );
        if (hasNextEndpoint) continue;

        return unavailableResult(endpointIndex);
      }

      if (!isOverpassPayload(payload)) {
        this.logEndpointFailure(
          endpointIndex,
          'INVALID_RESPONSE',
          hasNextEndpoint,
        );
        if (hasNextEndpoint) continue;

        return unavailableResult(endpointIndex);
      }

      this.rememberHealthyEndpoint(endpointIndex);

      const result: TelegramStreetGeometryResult = {
        ...mapOverpassStreetGeometry(payload, input.names, input.bounds),
        endpointIndex,
      };

      await this.remember(input.cityId, input.locationId, result);
      this.logResolvedGeometry(endpointIndex, result);

      return result;
    }

    return unavailableResult();
  }

  private async fetchOverpass(
    endpoint: string,
    query: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'RoadRadar/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private endpointOrder(): readonly number[] {
    const available = this.endpoints
      .map((_, index) => index)
      .slice(0, MAX_ENDPOINT_ATTEMPTS);
    const preferred = this.preferredEndpoint;

    if (preferred === null) return available;

    if (preferred.until <= this.now()) {
      this.preferredEndpoint = null;
      return available;
    }

    return [
      preferred.index,
      ...available.filter((index) => index !== preferred.index),
    ];
  }

  private rememberHealthyEndpoint(endpointIndex: number): void {
    if (endpointIndex === 0) {
      this.preferredEndpoint = null;
      return;
    }

    this.preferredEndpoint = {
      index: endpointIndex,
      until: this.now() + PREFERRED_ENDPOINT_TTL_MS,
    };
  }

  private logEndpointFailure(
    endpointIndex: number,
    reason: EndpointFailureReason,
    fallback: boolean,
  ): void {
    this.logger.warn(
      `OSM street geometry endpoint failed endpoint=${endpointPosition(endpointIndex)} reason=${reason} fallback=${fallback}`,
    );
  }

  private logResolvedGeometry(
    endpointIndex: number,
    result: TelegramStreetGeometryResult,
  ): void {
    if (result.status !== 'RESOLVED') return;

    const segments =
      result.geometry.type === 'LineString'
        ? 1
        : result.geometry.coordinates.length;

    this.logger.log(
      `OSM street geometry resolved endpoint=${endpointPosition(endpointIndex)} geometry=${result.geometry.type} segments=${segments}`,
    );
  }

  private getCached(key: string): TelegramStreetGeometryResult | null {
    const entry = this.cache.get(key);

    if (entry === undefined) return null;

    const age = this.now() - Date.parse(entry.fetchedAt);
    const ttl =
      entry.result.status === 'RESOLVED'
        ? SUCCESS_CACHE_TTL_MS
        : NEGATIVE_CACHE_TTL_MS;

    if (!Number.isFinite(age) || age < 0 || age >= ttl) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);

    return cloneResult(entry.result);
  }

  private async remember(
    cityId: string,
    locationId: string,
    result: TelegramStreetGeometryResult,
  ): Promise<void> {
    if (result.status === 'UNAVAILABLE') return;

    const key = buildOsmStreetCacheKey(cityId, locationId);

    this.cache.delete(key);
    this.cache.set(key, {
      fetchedAt: new Date(this.now()).toISOString(),
      result: cloneResult(result),
    });

    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value as string | undefined;

      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }

    await this.persistCityCache(cityId);
  }

  private async loadCityCache(cityId: string): Promise<void> {
    if (this.loadedCities.has(cityId)) return;
    this.loadedCities.add(cityId);

    try {
      const parsed: unknown = JSON.parse(
        await readFile(this.cacheFile(cityId), 'utf8'),
      );

      if (!isPersistentCityCache(parsed, cityId)) return;

      for (const [locationId, entry] of Object.entries(parsed.streets)) {
        this.cache.set(buildOsmStreetCacheKey(cityId, locationId), entry);
      }
    } catch {
      // Missing or damaged local cache must never block Telegram ingestion.
    }
  }

  private async persistCityCache(cityId: string): Promise<void> {
    const streets = Object.fromEntries(
      [...this.cache.entries()]
        .filter(([key]) => key.startsWith(`${cityId}:`))
        .map(([key, entry]) => [key.slice(cityId.length + 1), entry]),
    );
    const payload: PersistentCityCache = {
      version: 1,
      cityId,
      streets,
    };
    const filePath = this.cacheFile(cityId);
    const temporaryPath = `${filePath}.tmp`;
    const queued = this.writeQueue.then(async () => {
      await mkdir(this.cacheDirectory, { recursive: true });
      await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
      await rename(temporaryPath, filePath);
    });

    this.writeQueue = queued.catch(() => undefined);
    await queued.catch(() => undefined);
  }

  private cacheFile(cityId: string): string {
    return resolve(this.cacheDirectory, `${cityId}.json`);
  }
}

export const mapOverpassStreetGeometry = (
  payload: unknown,
  acceptedNames: readonly string[],
  bounds: CityBounds,
): TelegramStreetGeometryResult => {
  if (!isRecord(payload) || !Array.isArray(payload.elements)) {
    return unavailableResult();
  }

  const accepted = new Set(acceptedNames.map(normalizeStreetName));
  const segments: Array<readonly [number, number][]> = [];
  const identities = new Set<string>();

  for (const rawElement of payload.elements as OverpassWay[]) {
    if (rawElement.type !== 'way' || !isRecord(rawElement.tags)) continue;

    const name = stringValue(rawElement.tags.name);
    const highway = stringValue(rawElement.tags.highway);
    const identity = normalizeStreetName(name);

    if (highway.length === 0 || !accepted.has(identity)) continue;

    const coordinates = readWayCoordinates(rawElement.geometry);

    if (coordinates === null || !lineIntersectsBounds(coordinates, bounds)) {
      continue;
    }

    identities.add(identity);
    segments.push(coordinates);
  }

  if (segments.length === 0) {
    return { status: 'NOT_FOUND', provider: 'OSM' };
  }

  if (identities.size > 1) {
    return { status: 'AMBIGUOUS', provider: 'OSM' };
  }

  const merged = mergeConnectedSegments(segments);
  const geometry: ResolvedStreetGeometry =
    merged.length === 1
      ? { type: 'LineString', coordinates: [...merged[0]] }
      : {
          type: 'MultiLineString',
          coordinates: merged.map((segment) => [...segment]),
        };

  return {
    status: 'RESOLVED',
    geometry,
    confidence: PROVIDER_CONFIDENCE,
    provider: 'OSM',
  };
};

export const buildOverpassQuery = (
  names: readonly string[],
  bounds: CityBounds,
): string => {
  // Overpass uses POSIX regular expressions and does not support JS-style
  // non-capturing groups.
  const expression = `^(${names.map(escapeRegex).join('|')})$`;
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;

  return `[out:json][timeout:7];way["highway"]["name"~${JSON.stringify(expression)},i](${bbox});out geom;`;
};

const uniqueStreetNames = (
  title: string,
  aliases: readonly string[],
): readonly string[] =>
  [
    ...new Set(
      [title, ...aliases].map((value) => value.trim()).filter(Boolean),
    ),
  ].slice(0, 8);

const readWayCoordinates = (
  value: unknown,
): readonly [number, number][] | null => {
  if (!Array.isArray(value)) return null;

  const coordinates: Array<[number, number]> = [];

  for (const node of value) {
    if (!isRecord(node)) return null;

    const latitude = numberValue(node.lat);
    const longitude = numberValue(node.lon);

    if (
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    coordinates.push([longitude, latitude]);
  }

  return coordinates.length >= 2 ? coordinates : null;
};

const lineIntersectsBounds = (
  coordinates: readonly [number, number][],
  bounds: CityBounds,
): boolean =>
  coordinates.some(([longitude, latitude]) =>
    isInsideBounds(longitude, latitude, bounds),
  ) ||
  coordinates.slice(1).some(([longitude, latitude], index) => {
    const start = coordinates[index];

    if (start === undefined) return false;

    const west = Math.min(start[0], longitude);
    const east = Math.max(start[0], longitude);
    const south = Math.min(start[1], latitude);
    const north = Math.max(start[1], latitude);

    return !(
      east < bounds.west ||
      west > bounds.east ||
      north < bounds.south ||
      south > bounds.north
    );
  });

const mergeConnectedSegments = (
  source: readonly (readonly [number, number][])[],
): Array<Array<[number, number]>> => {
  const remaining = source.map((segment) =>
    segment.map(
      ([longitude, latitude]) => [longitude, latitude] as [number, number],
    ),
  );
  const merged: Array<Array<[number, number]>> = [];

  while (remaining.length > 0) {
    const current = remaining.shift();

    if (current === undefined) break;

    let joined = true;

    while (joined) {
      joined = false;

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];

        if (candidate === undefined) continue;
        if (appendConnected(current, candidate)) {
          remaining.splice(index, 1);
          joined = true;
          break;
        }
      }
    }

    merged.push(current);
  }

  return merged;
};

const appendConnected = (
  target: Array<[number, number]>,
  candidate: Array<[number, number]>,
): boolean => {
  const targetStart = target[0];
  const targetEnd = target[target.length - 1];
  const candidateStart = candidate[0];
  const candidateEnd = candidate[candidate.length - 1];

  if (!targetStart || !targetEnd || !candidateStart || !candidateEnd) {
    return false;
  }

  if (sameCoordinate(targetEnd, candidateStart)) {
    target.push(...candidate.slice(1));
    return true;
  }

  if (sameCoordinate(targetEnd, candidateEnd)) {
    target.push(...candidate.slice(0, -1).reverse());
    return true;
  }

  if (sameCoordinate(targetStart, candidateEnd)) {
    target.unshift(...candidate.slice(0, -1));
    return true;
  }

  if (sameCoordinate(targetStart, candidateStart)) {
    target.unshift(...candidate.slice(1).reverse());
    return true;
  }

  return false;
};

const sameCoordinate = (
  left: readonly [number, number],
  right: readonly [number, number],
): boolean => left[0] === right[0] && left[1] === right[1];

const normalizeStreetName = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/^(?:улица|ул\.?)\s+/u, '')
    .replace(/\s+/gu, ' ');

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const isInsideBounds = (
  longitude: number,
  latitude: number,
  bounds: CityBounds,
): boolean =>
  longitude >= bounds.west &&
  longitude <= bounds.east &&
  latitude >= bounds.south &&
  latitude <= bounds.north;

export const buildOsmStreetCacheKey = (
  cityId: string,
  locationId: string,
): string => `${cityId}:${locationId}`;

const cloneResult = (
  result: TelegramStreetGeometryResult,
): TelegramStreetGeometryResult =>
  JSON.parse(JSON.stringify(result)) as TelegramStreetGeometryResult;

const unavailableResult = (
  endpointIndex?: number,
): TelegramStreetGeometryResult => ({
  status: 'UNAVAILABLE',
  provider: 'OSM',
  ...(endpointIndex === undefined ? {} : { endpointIndex }),
});

const configuredOverpassEndpoints = (
  configService: ConfigService,
): readonly string[] => {
  const configuredList = configurationString(
    configService.get(OSM_OVERPASS_URLS_ENV),
  );
  const legacyEndpoint = configurationString(
    configService.get(OSM_OVERPASS_URL_ENV),
  );
  const values =
    configuredList === null
      ? legacyEndpoint === null
        ? DEFAULT_OVERPASS_URLS
        : [legacyEndpoint, ...DEFAULT_OVERPASS_URLS]
      : configuredList.split(',');

  const unique = [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].slice(0, MAX_ENDPOINT_ATTEMPTS);

  return unique.length > 0 ? unique : DEFAULT_OVERPASS_URLS;
};

const endpointPosition = (endpointIndex: number): 'primary' | 'fallback' =>
  endpointIndex === 0 ? 'primary' : 'fallback';

const isTransientHttpStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429;

const isAbortError = (error: unknown): boolean =>
  isRecord(error) && error.name === 'AbortError';

const isOverpassPayload = (
  value: unknown,
): value is { readonly elements: readonly unknown[] } =>
  isRecord(value) && Array.isArray(value.elements);

const isPersistentCityCache = (
  value: unknown,
  cityId: string,
): value is PersistentCityCache =>
  isRecord(value) &&
  value.version === 1 &&
  value.cityId === cityId &&
  isRecord(value.streets);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const numberValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const configurationString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
