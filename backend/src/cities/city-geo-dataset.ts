import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  CityBounds,
  CityCoordinate,
  CityLocationConfig,
  CityLocationKind,
  StreetLocationGeometryPart,
} from './city.types';

type CoordinatePair = readonly [number, number];

interface AppliedCityGeoObject {
  readonly id: string;
  readonly cityId: string;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly type: CityLocationKind;
  readonly representativePoint?: CityCoordinate;
  readonly bounds?: CityBounds;
  readonly geometry?:
    | { readonly type: 'LineString'; readonly coordinates: CoordinatePair[] }
    | {
        readonly type: 'MultiLineString';
        readonly coordinates: CoordinatePair[][];
      }
    | { readonly type: 'Polygon'; readonly coordinates: CoordinatePair[][] }
    | {
        readonly type: 'MultiPolygon';
        readonly coordinates: CoordinatePair[][][];
      };
  readonly geoSource: 'YANDEX' | 'OSM' | 'MANUAL';
  readonly mergeStatus?: string;
  readonly validationStatus: string;
  readonly externalSources?: {
    readonly yandex?: {
      readonly uri?: string;
      readonly point?: CityCoordinate;
    };
  };
}

export interface AppliedCityGeoManifest {
  readonly schemaVersion: number;
  readonly datasetVersion: number;
  readonly cityId: string;
  readonly sha256: string;
  readonly streets: number;
  readonly streetsWithGeometry: number;
  readonly ambiguousStreets: number;
  readonly bridges: number;
  readonly areas: number;
  readonly settlements: number;
}

interface AppliedCityGeoDataset {
  readonly schemaVersion: number;
  readonly cityId: string;
  readonly objects: readonly AppliedCityGeoObject[];
}

export interface LoadedCityGeoDataset {
  readonly locations: readonly CityLocationConfig[];
  readonly manifest: AppliedCityGeoManifest;
}

const loadedDatasets = new Map<string, LoadedCityGeoDataset | null>();

export const loadAppliedCityGeoDataset = (
  cityId: string,
): LoadedCityGeoDataset | null => {
  const cached = loadedDatasets.get(cityId);
  if (cached !== undefined) return cached;

  try {
    const directory = join(__dirname, 'data', cityId);
    const dataset = JSON.parse(
      readFileSync(join(directory, 'imported-locations.json'), 'utf8'),
    ) as AppliedCityGeoDataset;
    const manifest = JSON.parse(
      readFileSync(join(directory, 'manifest.json'), 'utf8'),
    ) as AppliedCityGeoManifest;

    if (
      dataset.schemaVersion !== 1 ||
      dataset.cityId !== cityId ||
      manifest.schemaVersion !== 1 ||
      manifest.cityId !== cityId
    ) {
      throw new Error('Applied city dataset metadata is invalid');
    }
    const actualHash = createHash('sha256')
      .update(JSON.stringify(dataset))
      .digest('hex');
    if (actualHash !== manifest.sha256) {
      throw new Error('Applied city dataset hash mismatch');
    }

    const loaded = {
      locations: dataset.objects.map(mapAppliedObject),
      manifest,
    };
    loadedDatasets.set(cityId, loaded);
    return loaded;
  } catch (error) {
    if (isMissingFile(error)) {
      loadedDatasets.set(cityId, null);
      return null;
    }
    throw error;
  }
};

export const mergeCityLocations = (
  manualLocations: readonly CityLocationConfig[],
  importedLocations: readonly CityLocationConfig[],
): readonly CityLocationConfig[] => {
  const remaining = new Map(
    importedLocations.map((entry) => [entry.id, entry]),
  );
  const mergedManual = manualLocations.map((manual) => {
    const imported = importedLocations.find((candidate) =>
      locationsReferToSameObject(manual, candidate),
    );
    if (imported === undefined) return manual;
    remaining.delete(imported.id);
    return {
      ...imported,
      ...manual,
      aliases: uniqueAliases([...manual.aliases, ...imported.aliases]),
      streetGeometry: manual.streetGeometry ?? imported.streetGeometry,
      streetGeometryStatus:
        manual.streetGeometry === undefined
          ? imported.streetGeometryStatus
          : 'RESOLVED',
      representativePoint:
        manual.verifiedCoordinates === undefined
          ? imported.representativePoint
          : undefined,
      bounds: imported.bounds,
      provenance: {
        ...(imported.provenance ?? {
          identitySource: 'MANUAL' as const,
          manualOverride: true,
        }),
        identitySource: 'MANUAL' as const,
        ...(manual.verifiedCoordinates === undefined
          ? {}
          : { pointSource: 'MANUAL' as const }),
        ...(manual.streetGeometry === undefined
          ? {}
          : { geometrySource: 'MANUAL' as const }),
        manualOverride: true,
      },
    };
  });

  return [...mergedManual, ...remaining.values()];
};

const mapAppliedObject = (
  object: AppliedCityGeoObject,
): CityLocationConfig => ({
  id: object.id,
  title: object.canonicalName,
  aliases: uniqueAliases([object.canonicalName, ...object.aliases]),
  kind: object.type,
  ...(object.representativePoint === undefined
    ? {}
    : { representativePoint: object.representativePoint }),
  ...(object.bounds === undefined ? {} : { bounds: object.bounds }),
  ...mapStreetGeometry(object),
  provenance: {
    identitySource:
      object.externalSources?.yandex === undefined
        ? object.geoSource
        : 'YANDEX',
    ...(object.externalSources?.yandex?.point === undefined
      ? object.representativePoint === undefined
        ? {}
        : { pointSource: object.geoSource }
      : { pointSource: 'YANDEX' as const }),
    ...(object.geometry === undefined
      ? {}
      : {
          geometrySource:
            object.geoSource === 'MANUAL'
              ? ('MANUAL' as const)
              : ('OSM' as const),
        }),
    manualOverride: object.geoSource === 'MANUAL',
    ...(object.externalSources?.yandex?.uri === undefined
      ? {}
      : { yandexUri: object.externalSources.yandex.uri }),
  },
});

const mapStreetGeometry = (
  object: AppliedCityGeoObject,
): Pick<CityLocationConfig, 'streetGeometry' | 'streetGeometryStatus'> => {
  if (object.type !== 'STREET') return {};
  if (object.mergeStatus === 'IDENTITY_AMBIGUOUS') {
    return { streetGeometryStatus: 'AMBIGUOUS' };
  }
  if (
    object.geometry?.type !== 'LineString' &&
    object.geometry?.type !== 'MultiLineString'
  ) {
    return {};
  }

  const lines =
    object.geometry.type === 'LineString'
      ? [object.geometry.coordinates]
      : object.geometry.coordinates;
  const parts = lines.map(mapLine).filter(isDefined);
  const first = parts[0];
  if (first === undefined) return {};

  return {
    streetGeometryStatus: 'RESOLVED',
    streetGeometry: {
      ...first,
      ...(parts.length < 2 ? {} : { disconnectedParts: parts.slice(1) }),
    },
  };
};

const mapLine = (
  coordinates: readonly CoordinatePair[],
): StreetLocationGeometryPart | undefined => {
  if (coordinates.length < 2) return undefined;
  const mapped = coordinates.map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }));
  const start = mapped[0];
  const end = mapped[mapped.length - 1];
  if (start === undefined || end === undefined) return undefined;
  return {
    start,
    end,
    ...(mapped.length <= 2 ? {} : { intermediate: mapped.slice(1, -1) }),
  };
};

const locationsReferToSameObject = (
  manual: CityLocationConfig,
  imported: CityLocationConfig,
): boolean => {
  if ((manual.kind ?? 'LANDMARK') !== (imported.kind ?? 'LANDMARK'))
    return false;
  const importedNames = new Set(
    [imported.title, ...imported.aliases].map(normalizeLocationName),
  );
  return [manual.title, ...manual.aliases].some((name) =>
    importedNames.has(normalizeLocationName(name)),
  );
};

const uniqueAliases = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map(normalizeLocationName).filter(Boolean)),
];

const normalizeLocationName = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/\s+/gu, ' ');

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const isMissingFile = (error: unknown): boolean =>
  error !== null &&
  typeof error === 'object' &&
  'code' in error &&
  error.code === 'ENOENT';
