import type { CityBounds } from '../../cities/city.types';
import { CityGeoImportCache } from './city-geo-import.cache';
import type {
  OsmAddressEvidence,
  OsmAreaInventoryItem,
  OsmStreetEvidenceInventory,
  OsmStreetInventoryItem,
  OsmStreetWayCandidate,
} from './city-geo-import.types';
import { normalizeStreetMatchName } from './city-geo-import.utils';

const DEFAULT_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const;

type FetchLike = typeof fetch;

export interface OsmCityGeoProviderOptions {
  readonly cache: CityGeoImportCache;
  readonly endpoints?: readonly string[];
  readonly fetchFn?: FetchLike;
  readonly timeoutMs?: number;
}

interface OverpassElement {
  readonly id?: unknown;
  readonly type?: unknown;
  readonly tags?: unknown;
  readonly geometry?: unknown;
  readonly members?: unknown;
  readonly lat?: unknown;
  readonly lon?: unknown;
  readonly center?: unknown;
}

type LegacyOsmAreaInventoryItem = Omit<OsmAreaInventoryItem, 'bounds'> & {
  readonly bounds?: CityBounds;
};

export class OsmCityGeoProvider {
  private readonly fetchFn: FetchLike;
  private readonly endpoints: readonly string[];
  private readonly timeoutMs: number;

  constructor(private readonly options: OsmCityGeoProviderOptions) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.endpoints = [
      ...new Set([...DEFAULT_ENDPOINTS, ...(options.endpoints ?? [])]),
    ];
    this.timeoutMs = options.timeoutMs ?? 90_000;
  }

  inventoryStreets(
    cityId: string,
    bounds: CityBounds,
  ): Promise<readonly OsmStreetInventoryItem[]> {
    return this.inventoryStreetEvidence(cityId, bounds).then(({ ways }) =>
      groupStreetWays(ways),
    );
  }

  inventoryStreetWays(
    cityId: string,
    bounds: CityBounds,
  ): Promise<readonly OsmStreetWayCandidate[]> {
    return this.inventoryStreetEvidence(cityId, bounds).then(
      ({ ways }) => ways,
    );
  }

  inventoryStreetEvidence(
    cityId: string,
    bounds: CityBounds,
  ): Promise<OsmStreetEvidenceInventory> {
    const identity = { cityId, bounds };
    return this.options.cache.getOrLoad(
      'osm/street-evidence-v3',
      identity,
      () => this.loadStreetEvidence(bounds),
    );
  }

  inventoryAreas(
    cityId: string,
    bounds: CityBounds,
  ): Promise<readonly OsmAreaInventoryItem[]> {
    const identity = { cityId, bounds };
    return this.options.cache
      .getOrLoad<readonly LegacyOsmAreaInventoryItem[]>(
        'osm/area-inventory',
        identity,
        () => this.loadAreaInventory(bounds),
      )
      .then((areas) => areas.map(withAreaBounds));
  }

  private async loadStreetEvidence(
    bounds: CityBounds,
  ): Promise<OsmStreetEvidenceInventory> {
    return this.loadInventory<OsmStreetEvidenceInventory>(
      buildStreetInventoryQuery(bounds),
      parseStreetEvidence,
    );
  }

  private async loadAreaInventory(
    bounds: CityBounds,
  ): Promise<readonly OsmAreaInventoryItem[]> {
    return this.loadInventory<readonly OsmAreaInventoryItem[]>(
      buildAreaInventoryQuery(bounds),
      parseAreaInventory,
    );
  }

  private async loadInventory<T>(
    query: string,
    parse: (value: unknown) => T,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (const endpoint of this.endpoints) {
      try {
        const response = await this.fetchFn(endpoint, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'user-agent': 'RoadRadar/1.0',
          },
          body: new URLSearchParams({ data: query }).toString(),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
          lastError = new Error(`OSM_HTTP_${response.status}`);
          continue;
        }
        return parse(await response.json());
      } catch (error) {
        lastError = new Error(
          `OSM_NETWORK_ERROR: ${error instanceof Error ? error.name : 'UnknownError'}`,
        );
      }
    }

    throw lastError ?? new Error('OSM_UNAVAILABLE');
  }
}

export const buildStreetInventoryQuery = (bounds: CityBounds): string =>
  `
[out:json][timeout:40];
(
  way["highway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  nwr["addr:street"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out tags center geom;
`.trim();

export const buildAreaInventoryQuery = (bounds: CityBounds): string =>
  `
[out:json][timeout:40];
(
  way["name"]["landuse"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["name"]["place"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["name"]["boundary"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  relation["name"]["type"="multipolygon"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  relation["name"]["boundary"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out tags geom;
`.trim();

export const parseStreetInventory = (
  value: unknown,
): readonly OsmStreetInventoryItem[] =>
  groupStreetWays(parseStreetEvidence(value).ways);

export const parseStreetEvidence = (
  value: unknown,
): OsmStreetEvidenceInventory => ({
  ways: parseStreetWays(value),
  addresses: parseAddressEvidence(value),
});

export const parseStreetWays = (
  value: unknown,
): readonly OsmStreetWayCandidate[] => {
  const elements = asObject(value).elements;
  if (!Array.isArray(elements)) return [];

  return elements.flatMap((rawElement) => {
    const element = asObject(rawElement) as OverpassElement;
    if (element.type !== 'way') return [];
    const tags = asObject(element.tags);
    if (stringValue(tags.highway) === null) return [];
    const line = parseLine(element.geometry);
    if (line === null) return [];
    const names = uniqueTagNames(tags);
    return [
      {
        osmId: osmElementId(element),
        names,
        highway: stringValue(tags.highway),
        bridge:
          stringValue(tags.bridge) !== null &&
          stringValue(tags.bridge) !== 'no',
        geometry: { type: 'LineString' as const, coordinates: line },
        bounds: lineBounds(line),
      },
    ];
  });
};

export const parseAddressEvidence = (
  value: unknown,
): readonly OsmAddressEvidence[] => {
  const elements = asObject(value).elements;
  if (!Array.isArray(elements)) return [];
  return elements.flatMap((rawElement) => {
    const element = asObject(rawElement) as OverpassElement;
    const streetName = stringValue(asObject(element.tags)['addr:street']);
    const coordinate = elementCoordinate(element);
    return streetName === null || coordinate === null
      ? []
      : [{ osmId: osmElementId(element), streetName, coordinate }];
  });
};

export const groupStreetWays = (
  ways: readonly OsmStreetWayCandidate[],
): readonly OsmStreetInventoryItem[] => {
  const grouped = new Map<
    string,
    {
      canonicalName: string;
      names: Set<string>;
      lines: [number, number][][];
    }
  >();

  for (const way of ways) {
    const primaryName = way.names[0];
    if (primaryName === undefined) continue;
    const normalized = normalizeStreetMatchName(primaryName);
    if (!normalized) continue;
    const current = grouped.get(normalized) ?? {
      canonicalName: primaryName,
      names: new Set<string>(),
      lines: [],
    };
    way.names.forEach((alias) => current.names.add(alias));
    current.lines.push(way.geometry.coordinates);
    grouped.set(normalized, current);
  }

  return [...grouped.values()]
    .map(({ canonicalName, names, lines }) => {
      const orderedNames = [...names].sort((left, right) =>
        left.localeCompare(right, 'ru'),
      );
      return {
        canonicalName,
        aliases: orderedNames,
        geometry: buildStreetGeometry(lines),
      };
    })
    .filter(({ canonicalName }) => canonicalName.length > 0)
    .sort((left, right) =>
      left.canonicalName.localeCompare(right.canonicalName, 'ru'),
    );
};

const buildStreetGeometry = (
  lines: readonly [number, number][][],
): OsmStreetInventoryItem['geometry'] => {
  const ordered = [...lines].sort((left, right) =>
    JSON.stringify(left[0] ?? []).localeCompare(JSON.stringify(right[0] ?? [])),
  );
  return ordered.length === 1
    ? { type: 'LineString', coordinates: ordered[0] ?? [] }
    : { type: 'MultiLineString', coordinates: ordered };
};

const STREET_NAME_TAGS = [
  'name',
  'official_name',
  'short_name',
  'alt_name',
  'old_name',
  'loc_name',
] as const;

const uniqueTagNames = (tags: Record<string, unknown>): readonly string[] => [
  ...new Set(
    STREET_NAME_TAGS.flatMap((tag) => {
      const value = stringValue(tags[tag]);
      return value === null
        ? []
        : value
            .split(';')
            .map((name) => name.trim())
            .filter(Boolean);
    }),
  ),
];

const lineBounds = (line: readonly [number, number][]): CityBounds => ({
  west: Math.min(...line.map(([longitude]) => longitude)),
  east: Math.max(...line.map(([longitude]) => longitude)),
  south: Math.min(...line.map(([, latitude]) => latitude)),
  north: Math.max(...line.map(([, latitude]) => latitude)),
});

const withAreaBounds = (
  area: LegacyOsmAreaInventoryItem,
): OsmAreaInventoryItem => ({
  ...area,
  bounds:
    area.bounds ??
    lineBounds(
      area.geometry.type === 'Polygon'
        ? area.geometry.coordinates.flat()
        : area.geometry.coordinates.flat(2),
    ),
});

export const parseAreaInventory = (
  value: unknown,
): readonly OsmAreaInventoryItem[] => {
  const elements = asObject(value).elements;
  if (!Array.isArray(elements)) return [];

  const grouped = new Map<
    string,
    { names: Set<string>; polygons: [number, number][][] }
  >();

  for (const rawElement of elements) {
    const element = asObject(rawElement) as OverpassElement;
    const tags = asObject(element.tags);
    const name = stringValue(tags.name);
    if (name === null) continue;
    const polygons = parseAreaPolygons(element);
    if (polygons.length === 0) continue;
    const normalized = normalizeStreetMatchName(name);
    if (!normalized) continue;
    const current = grouped.get(normalized) ?? {
      names: new Set<string>(),
      polygons: [],
    };
    current.names.add(name);
    current.polygons.push(...polygons);
    grouped.set(normalized, current);
  }

  return [...grouped.values()]
    .map(({ names, polygons }) => {
      const orderedNames = [...names].sort((left, right) =>
        left.localeCompare(right, 'ru'),
      );
      return {
        canonicalName: orderedNames[0] ?? '',
        aliases: orderedNames,
        bounds: lineBounds(polygons.flat()),
        geometry:
          polygons.length === 1
            ? { type: 'Polygon' as const, coordinates: [polygons[0] ?? []] }
            : {
                type: 'MultiPolygon' as const,
                coordinates: polygons.map((polygon) => [polygon]),
              },
      };
    })
    .filter(({ canonicalName }) => canonicalName.length > 0)
    .sort((left, right) =>
      left.canonicalName.localeCompare(right.canonicalName, 'ru'),
    );
};

const parseAreaPolygons = (element: OverpassElement): [number, number][][] => {
  if (element.type === 'way') {
    const ring = parseRing(element.geometry);
    return ring === null ? [] : [ring];
  }
  if (element.type !== 'relation' || !Array.isArray(element.members)) return [];
  return element.members.flatMap((rawMember) => {
    const member = asObject(rawMember);
    if (member.role !== 'outer') return [];
    const ring = parseRing(member.geometry);
    return ring === null ? [] : [ring];
  });
};

const parseRing = (value: unknown): [number, number][] | null => {
  const line = parseLine(value);
  if (line === null || line.length < 4) return null;
  const first = line[0];
  const last = line.at(-1);
  return first?.[0] === last?.[0] && first?.[1] === last?.[1] ? line : null;
};

const parseLine = (value: unknown): [number, number][] | null => {
  if (!Array.isArray(value)) return null;
  const line = value.flatMap((rawPoint) => {
    const point = asObject(rawPoint);
    const latitude = numberValue(point.lat);
    const longitude = numberValue(point.lon);
    return latitude === null || longitude === null
      ? []
      : ([[longitude, latitude]] as [number, number][]);
  });
  return line.length >= 2 ? line : null;
};

const osmElementId = (element: OverpassElement): string =>
  `${typeof element.type === 'string' ? element.type : 'element'}/${
    typeof element.id === 'number' || typeof element.id === 'string'
      ? String(element.id)
      : 'unknown'
  }`;

const elementCoordinate = (
  element: OverpassElement,
): { latitude: number; longitude: number } | null => {
  const latitude = numberValue(element.lat);
  const longitude = numberValue(element.lon);
  if (latitude !== null && longitude !== null) return { latitude, longitude };
  const center = asObject(element.center);
  const centerLatitude = numberValue(center.lat);
  const centerLongitude = numberValue(center.lon);
  if (centerLatitude !== null && centerLongitude !== null) {
    return { latitude: centerLatitude, longitude: centerLongitude };
  }
  const line = parseLine(element.geometry);
  if (line === null) return null;
  return {
    latitude:
      line.reduce((sum, [, pointLatitude]) => sum + pointLatitude, 0) /
      line.length,
    longitude:
      line.reduce((sum, [pointLongitude]) => sum + pointLongitude, 0) /
      line.length,
  };
};

const asObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const numberValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
