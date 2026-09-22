import type { CityBounds } from '../../cities/city.types';
import { CityGeoImportCache } from './city-geo-import.cache';
import type {
  CityGeoGeometry,
  YandexGeoObject,
  YandexSuggestCandidate,
} from './city-geo-import.types';

const SUGGEST_ENDPOINT = 'https://suggest-maps.yandex.ru/v1/suggest';
const GEOCODER_ENDPOINT = 'https://geocode-maps.yandex.ru/v1/';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;

type FetchLike = typeof fetch;

export interface YandexCityGeoProviderOptions {
  readonly suggestApiKey: string;
  readonly geocoderApiKey: string;
  readonly cache: CityGeoImportCache;
  readonly requestDelayMs: number;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly fetchFn?: FetchLike;
}

export class YandexCityGeoProvider {
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private lastRequestAt = 0;

  constructor(private readonly options: YandexCityGeoProviderOptions) {
    if (!options.suggestApiKey.trim() || !options.geocoderApiKey.trim()) {
      throw new Error('YANDEX_CITY_IMPORT_CONFIG_MISSING');
    }
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  suggest(input: {
    readonly text: string;
    readonly types: readonly string[];
    readonly bounds: CityBounds;
  }): Promise<readonly YandexSuggestCandidate[]> {
    const identity = {
      text: input.text,
      types: [...input.types].sort(),
      bounds: input.bounds,
    };

    return this.deduplicated(`suggest:${JSON.stringify(identity)}`, () =>
      this.options.cache.getOrLoad('suggest', identity, async () => {
        const url = new URL(SUGGEST_ENDPOINT);
        setQuery(url, {
          apikey: this.options.suggestApiKey,
          text: input.text,
          lang: 'ru',
          results: '10',
          highlight: '0',
          print_address: '1',
          attrs: 'uri',
          types: input.types.join(','),
          bbox: boundsAsYandexBbox(input.bounds),
          strict_bounds: '1',
        });
        const response = await this.requestJson(url, 'SUGGEST');
        return parseSuggestResponse(response);
      }),
    );
  }

  geocodeUri(uri: string): Promise<YandexGeoObject | null> {
    const identity = { uri };

    return this.deduplicated(`geocoder:${uri}`, () =>
      this.options.cache.getOrLoad('geocoder', identity, async () => {
        const url = new URL(GEOCODER_ENDPOINT);
        setQuery(url, {
          apikey: this.options.geocoderApiKey,
          uri,
          lang: 'ru_RU',
          format: 'json',
          results: '1',
        });
        const response = await this.requestJson(url, 'GEOCODER');
        return parseGeocoderResponse(response);
      }),
    );
  }

  private deduplicated<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const current = this.inFlight.get(key) as Promise<T> | undefined;
    if (current !== undefined) return current;
    const pending = loader().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, pending);
    return pending;
  }

  private async requestJson(url: URL, stage: string): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.applyRequestDelay();
      let response: Response;

      try {
        response = await this.fetchFn(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        lastError = safeProviderError(stage, 'NETWORK_ERROR', error);
        if (attempt < this.maxRetries) {
          await wait(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      const rawBody = await response.text();
      const parsedBody = parseJson(rawBody);

      if (response.ok) return parsedBody;

      const apiMessage = safeApiMessage(parsedBody);
      const code = `HTTP_${response.status}`;
      lastError = new Error(
        `${stage}_${code}${apiMessage === null ? '' : `: ${apiMessage}`}`,
      );

      if (
        attempt < this.maxRetries &&
        (response.status === 429 || response.status >= 500)
      ) {
        await wait(retryAfterMs(response, attempt));
        continue;
      }

      throw lastError;
    }

    throw lastError ?? new Error(`${stage}_UNKNOWN_ERROR`);
  }

  private async applyRequestDelay(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    const remaining = this.options.requestDelayMs - elapsed;
    if (remaining > 0) await wait(remaining);
    this.lastRequestAt = Date.now();
  }
}

export const parseSuggestResponse = (
  value: unknown,
): readonly YandexSuggestCandidate[] => {
  const results = objectValue(value, 'results');
  if (!Array.isArray(results)) return [];

  return results.flatMap((candidate) => {
    const object = asObject(candidate);
    const title = nestedString(object, ['title', 'text']);
    if (title === null) return [];
    const address = asObject(object.address);
    const components = Array.isArray(address.component)
      ? address.component.flatMap((component) => {
          const item = asObject(component);
          const name = stringValue(item.name);
          if (name === null) return [];
          return [
            {
              name,
              kinds: Array.isArray(item.kind)
                ? item.kind.filter(
                    (kind): kind is string => typeof kind === 'string',
                  )
                : [],
            },
          ];
        })
      : [];

    return [
      {
        title,
        subtitle: nestedString(object, ['subtitle', 'text']),
        tags: Array.isArray(object.tags)
          ? object.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
        uri: stringValue(object.uri),
        formattedAddress: stringValue(address.formatted_address),
        components,
      },
    ];
  });
};

export const parseGeocoderResponse = (
  value: unknown,
): YandexGeoObject | null => {
  const collection = nestedObject(value, ['response', 'GeoObjectCollection']);
  const members = collection?.featureMember;
  if (!Array.isArray(members) || members.length === 0) return null;
  const geoObject = asObject(asObject(members[0]).GeoObject);
  if (Object.keys(geoObject).length === 0) return null;
  const metadata = nestedObject(geoObject, [
    'metaDataProperty',
    'GeocoderMetaData',
  ]);
  const address = asObject(metadata?.Address);
  const envelope = nestedObject(geoObject, ['boundedBy', 'Envelope']);

  return {
    canonicalName:
      stringValue(geoObject.name) ??
      stringValue(metadata?.text) ??
      'Unknown Yandex object',
    formattedAddress:
      stringValue(address.formatted) ?? stringValue(metadata?.text),
    kind: stringValue(metadata?.kind),
    precision: stringValue(metadata?.precision),
    uri: stringValue(geoObject.uri) ?? stringValue(metadata?.uri),
    point: parseYandexPoint(nestedString(geoObject, ['Point', 'pos'])),
    bounds: parseYandexBounds(
      stringValue(envelope?.lowerCorner),
      stringValue(envelope?.upperCorner),
    ),
    actualGeometry: parseActualGeometry(geoObject),
    components: Array.isArray(address.Components)
      ? address.Components.flatMap((component) => {
          const item = asObject(component);
          const name = stringValue(item.name);
          if (name === null) return [];
          return [{ name, kind: stringValue(item.kind) }];
        })
      : [],
  };
};

export const parseYandexPoint = (
  value: string | null,
): {
  latitude: number;
  longitude: number;
} | null => {
  if (value === null) return null;
  const [longitude, latitude] = value.trim().split(/\s+/).map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { latitude, longitude };
};

export const parseYandexBounds = (
  lowerCorner: string | null,
  upperCorner: string | null,
): CityBounds | null => {
  const lower = parseYandexPoint(lowerCorner);
  const upper = parseYandexPoint(upperCorner);
  if (lower === null || upper === null) return null;
  return {
    west: lower.longitude,
    south: lower.latitude,
    east: upper.longitude,
    north: upper.latitude,
  };
};

const parseActualGeometry = (
  geoObject: Readonly<Record<string, unknown>>,
): CityGeoGeometry | null => {
  for (const key of [
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
  ]) {
    const candidate = asObject(geoObject[key]);
    if (!Array.isArray(candidate.coordinates)) continue;
    return {
      type: key,
      coordinates: candidate.coordinates,
    } as CityGeoGeometry;
  }
  return null;
};

const boundsAsYandexBbox = (bounds: CityBounds): string =>
  `${bounds.west},${bounds.south}~${bounds.east},${bounds.north}`;

const setQuery = (url: URL, values: Readonly<Record<string, string>>): void => {
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, value);
  }
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error('YANDEX_INVALID_JSON');
  }
};

const safeApiMessage = (value: unknown): string | null => {
  const object = asObject(value);
  return stringValue(object.message) ?? stringValue(object.error);
};

const safeProviderError = (
  stage: string,
  code: string,
  error: unknown,
): Error => {
  const cause = error instanceof Error ? error.name : 'UnknownError';
  return new Error(`${stage}_${code}: ${cause}`);
};

const retryAfterMs = (response: Response, attempt: number): number => {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, 30_000)
    : backoffMs(attempt);
};

const backoffMs = (attempt: number): number =>
  Math.min(500 * 2 ** attempt, 5_000);
const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const asObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const objectValue = (value: unknown, key: string): unknown =>
  asObject(value)[key];
const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const nestedObject = (
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null => {
  let current = asObject(value);
  for (const key of keys) {
    const next = asObject(current[key]);
    if (Object.keys(next).length === 0) return null;
    current = next;
  }
  return current;
};
const nestedString = (
  value: unknown,
  keys: readonly string[],
): string | null => {
  let current: unknown = value;
  for (const key of keys) current = asObject(current)[key];
  return stringValue(current);
};
