import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { getCityImportConfig } from '../../cities/city.registry';
import type { CityConfig, CityLocationConfig } from '../../cities/city.types';
import { atomicJsonWrite } from './city-geo-import.cache';
import type {
  CityGeoImportConflict,
  CityGeoImportOptions,
  CityGeoImportReport,
  CityGeoCoordinateDiagnostic,
  CityGeoObject,
  CityGeoObjectType,
  OsmAddressEvidence,
  OsmAreaInventoryItem,
  OsmStreetInventoryItem,
  OsmStreetWayCandidate,
  StreetCandidateScore,
  YandexGeoObject,
  YandexSuggestCandidate,
} from './city-geo-import.types';
import {
  distanceMeters,
  geometryIsValid,
  mapManualLocationType,
  mergeManualLocation,
  normalizeGeoName,
  normalizeStreetMatchName,
  stableGeoId,
  validateBounds,
  yandexExternalId,
} from './city-geo-import.utils';
import { groupStreetWays, OsmCityGeoProvider } from './osm-city-geo.provider';
import { YandexCityGeoProvider } from './yandex-city-geo.provider';

const STREET_DISCOVERY_PREFIXES = [
  'улица',
  'проспект',
  'шоссе',
  'переулок',
  'проезд',
  'тупик',
  'бульвар',
  'набережная',
  ...'абвгдежзийклмнопрстуфхцчшщэюя',
] as const;

const COORDINATE_CONFLICT_METERS = 100;

export interface CityGeoImporterDependencies {
  readonly yandex: YandexCityGeoProvider;
  readonly osm: OsmCityGeoProvider;
  readonly concurrency: number;
  readonly now?: () => Date;
}

export class CityGeoImporter {
  private readonly now: () => Date;

  constructor(private readonly dependencies: CityGeoImporterDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(options: CityGeoImportOptions): Promise<CityGeoImportReport> {
    const city = getCityImportConfig(options.cityId);
    if (city === undefined) {
      throw new Error(`UNSUPPORTED_CITY: ${options.cityId}`);
    }

    const generatedAt = this.now().toISOString();
    const cityDirectory = join(options.runtimeDataRoot, city.id);
    await mkdir(cityDirectory, { recursive: true });
    await atomicJsonWrite(join(cityDirectory, 'progress.json'), {
      version: 1,
      cityId: city.id,
      stage: 'DISCOVERY',
      updatedAt: generatedAt,
    });

    const capability = await this.capabilityCheck(city);
    const cityYandex = await this.resolveBestCandidate(
      city,
      city.name,
      ['locality'],
      (candidate) => candidate.tags.includes('locality'),
    );
    const physicalCityBounds =
      cityYandex?.geo.bounds !== null &&
      cityYandex?.geo.bounds !== undefined &&
      validateBounds(cityYandex.geo.bounds)
        ? cityYandex.geo.bounds
        : city.coverageBounds;

    const osmEvidence = await this.dependencies.osm.inventoryStreetEvidence(
      city.id,
      physicalCityBounds,
    );
    const osmStreetWays = osmEvidence.ways;
    const osmStreets = groupStreetWays(osmStreetWays);
    const osmAreas = await this.dependencies.osm.inventoryAreas(
      city.id,
      physicalCityBounds,
    );
    const suggestStreets = await this.discoverSuggestStreets(city);
    const streetNames = uniqueStreetSeeds(city, osmStreets, suggestStreets);
    const telegramCorpus = await loadHistoricalLocationCandidates(
      options.historicalLogDirectories,
    );
    const osmByName = new Map<string, OsmStreetInventoryItem>();
    for (const street of osmStreets) {
      for (const name of [street.canonicalName, ...street.aliases]) {
        osmByName.set(normalizeStreetMatchName(name), street);
      }
    }
    const osmAreasByName = new Map(
      osmAreas.map((area) => [normalizeGeoName(area.canonicalName), area]),
    );

    const conflicts: CityGeoImportConflict[] = [];
    const coordinateDiagnostics: CityGeoCoordinateDiagnostic[] = [];
    const importedStreets = await mapConcurrent(
      streetNames,
      this.dependencies.concurrency,
      async (name) =>
        this.importStreet(
          city,
          name,
          osmByName,
          osmStreetWays,
          osmEvidence.addresses,
          conflicts,
          coordinateDiagnostics,
          generatedAt,
        ),
    );

    await atomicJsonWrite(join(cityDirectory, 'progress.json'), {
      version: 1,
      cityId: city.id,
      stage: 'AREAS_SETTLEMENTS_LANDMARKS',
      streetsProcessed: importedStreets.length,
      updatedAt: this.now().toISOString(),
    });

    const nonStreetManual = city.locations.filter(
      (location) => location.kind !== 'STREET',
    );
    const importedManualObjects = await mapConcurrent(
      nonStreetManual,
      this.dependencies.concurrency,
      async (manual) =>
        this.importManualSeed(
          city,
          manual,
          osmAreasByName,
          osmAreas,
          osmStreetWays,
          osmEvidence.addresses,
          conflicts,
          coordinateDiagnostics,
          generatedAt,
        ),
    );
    const settlementObjects = await mapConcurrent(
      city.nearbyAreas,
      this.dependencies.concurrency,
      async (area) => {
        const existing = city.locations.find(({ id }) => id === area.id);
        if (existing !== undefined) return null;
        return this.importNamedObject(
          city,
          area.name,
          'SETTLEMENT',
          area.aliases,
          generatedAt,
        );
      },
    );

    const objects = deduplicateObjects([
      ...importedStreets,
      ...importedManualObjects,
      ...settlementObjects.filter(
        (object): object is CityGeoObject => object !== null,
      ),
    ]);

    const report = buildReport({
      city,
      generatedAt,
      dryRun: !options.apply,
      capability,
      objects,
      osmStreets,
      telegramCorpus,
      conflicts,
      coordinateDiagnostics,
    });

    await atomicJsonWrite(
      join(cityDirectory, 'normalized', 'city-geo-objects.json'),
      objects,
    );
    await atomicJsonWrite(
      join(cityDirectory, 'reports', 'city-geo-import-report.json'),
      report,
    );
    await atomicJsonWrite(
      join(cityDirectory, 'reports', 'manual-review.geo.json'),
      buildManualReviewGeoJson(objects, osmStreetWays),
    );
    await atomicJsonWrite(join(cityDirectory, 'progress.json'), {
      version: 1,
      cityId: city.id,
      stage: 'COMPLETE',
      objectCount: objects.length,
      updatedAt: this.now().toISOString(),
    });

    if (options.apply) {
      if (!report.applyStatus.applyReady) {
        throw new Error(
          `CITY_GEO_APPLY_BLOCKED: ${report.applyStatus.blocking} blocking conflict(s)`,
        );
      }
      const appliedObjects = objects.map(toAppliedGeoObject);
      const appliedDataset = {
        schemaVersion: 1,
        cityId: city.id,
        objects: appliedObjects,
      };
      const sha256 = createHash('sha256')
        .update(JSON.stringify(appliedDataset))
        .digest('hex');
      await atomicJsonWrite(
        join(options.appliedDataRoot, city.id, 'imported-locations.json'),
        appliedDataset,
      );
      await atomicJsonWrite(
        join(options.appliedDataRoot, city.id, 'manifest.json'),
        buildAppliedManifest(city.id, appliedObjects, sha256),
      );
    }

    return report;
  }

  private async capabilityCheck(city: CityConfig) {
    const suggestions = await this.dependencies.yandex.suggest({
      text: `Улица Комарова, ${city.name}`,
      types: ['street'],
      bounds: city.coverageBounds,
    });
    const withUri = suggestions.find(({ uri }) => uri !== null);
    const geocoded =
      withUri?.uri === null || withUri?.uri === undefined
        ? null
        : await this.dependencies.yandex.geocodeUri(withUri.uri);
    const geometryType = geocoded?.actualGeometry?.type;

    return {
      suggestOk: true,
      suggestUri: withUri !== undefined,
      suggestTypes: [...new Set(suggestions.flatMap(({ tags }) => tags))],
      geocoderOk: geocoded !== null,
      uriResolving: geocoded !== null,
      point: geocoded?.point !== null && geocoded?.point !== undefined,
      kind: geocoded?.kind !== null && geocoded?.kind !== undefined,
      boundedBy: geocoded?.bounds !== null && geocoded?.bounds !== undefined,
      actualLineString:
        geometryType === 'LineString' || geometryType === 'MultiLineString',
      actualPolygon:
        geometryType === 'Polygon' || geometryType === 'MultiPolygon',
    };
  }

  private async discoverSuggestStreets(
    city: CityConfig,
  ): Promise<readonly YandexSuggestCandidate[]> {
    const pages = await mapConcurrent(
      STREET_DISCOVERY_PREFIXES,
      this.dependencies.concurrency,
      (prefix) =>
        this.dependencies.yandex.suggest({
          text: `${city.name}, ${prefix}`,
          types: ['street'],
          bounds: city.coverageBounds,
        }),
    );

    return deduplicateSuggestCandidates(pages.flat()).filter((candidate) =>
      candidateBelongsToCity(candidate, city.name),
    );
  }

  private async importStreet(
    city: CityConfig,
    name: string,
    osmByName: ReadonlyMap<string, OsmStreetInventoryItem>,
    osmStreetWays: readonly OsmStreetWayCandidate[],
    osmAddresses: readonly OsmAddressEvidence[],
    conflicts: CityGeoImportConflict[],
    coordinateDiagnostics: CityGeoCoordinateDiagnostic[],
    importedAt: string,
  ): Promise<CityGeoObject> {
    const normalized = normalizeStreetMatchName(name);
    const osm = osmByName.get(normalized);
    const resolved = await this.resolveBestCandidate(
      city,
      `${name}, ${city.name}`,
      ['street'],
      (candidate) =>
        candidate.tags.includes('street') &&
        candidateBelongsToCity(candidate, city.name) &&
        normalizeStreetMatchName(candidate.title) === normalized,
    );
    const manual = city.locations.find(
      (location) =>
        location.kind === 'STREET' &&
        [location.title, ...location.aliases].some(
          (alias) => normalizeStreetMatchName(alias) === normalized,
        ),
    );
    const canonicalName =
      resolved?.geo.canonicalName ?? osm?.canonicalName ?? name;
    const aliases = uniqueStrings([
      name,
      ...(osm?.aliases ?? []),
      ...(manual?.aliases ?? []),
    ]);
    const nearbyCandidates =
      osm === undefined &&
      resolved?.geo.bounds !== null &&
      resolved?.geo.bounds !== undefined
        ? findWaysIntersectingBounds(osmStreetWays, resolved.geo.bounds)
        : [];
    const candidateScores =
      osm === undefined && resolved !== null
        ? scoreStreetCandidates({
            canonicalName,
            aliases,
            yandexPoint: resolved.geo.point,
            yandexBounds: resolved.geo.bounds,
            candidates: nearbyCandidates,
            addresses: osmAddresses,
          })
        : [];
    const inferredCandidate = selectStrongStreetCandidate(
      nearbyCandidates,
      candidateScores,
    );
    const candidateNames = candidateScores
      .slice(0, 3)
      .map(({ candidateLabel }) => candidateLabel);
    const geometry =
      resolved?.geo.actualGeometry ??
      osm?.geometry ??
      (inferredCandidate === null
        ? undefined
        : inferredCandidate.candidate.geometry);
    const validGeometry =
      geometry === undefined ? undefined : geometryIsValid(geometry);
    const source = resolved === null ? 'OSM' : 'YANDEX';
    let imported: CityGeoObject = {
      id: stableGeoId(city.id, 'STREET', canonicalName),
      cityId: city.id,
      canonicalName,
      aliases,
      type: 'STREET',
      ...(resolved?.geo.point === null || resolved?.geo.point === undefined
        ? {}
        : { representativePoint: resolved.geo.point }),
      ...(resolved?.geo.bounds === null || resolved?.geo.bounds === undefined
        ? {}
        : { bounds: resolved.geo.bounds }),
      ...(geometry === undefined || !geometryIsValid(geometry)
        ? {}
        : { geometry }),
      geometryPrecision:
        geometry === undefined
          ? resolved?.geo.bounds === null || resolved?.geo.bounds === undefined
            ? 'POINT_ONLY'
            : 'BOUNDS_ONLY'
          : 'EXACT_GEOMETRY',
      geoSource:
        geometry === osm?.geometry || inferredCandidate !== null
          ? 'OSM'
          : source,
      mergeStatus:
        geometry === undefined
          ? nearbyCandidates.length > 0
            ? 'IDENTITY_AMBIGUOUS'
            : 'GEOMETRY_MISSING'
          : validGeometry
            ? resolved === null
              ? 'READY_OSM_ONLY'
              : 'READY_YANDEX_OSM'
            : 'INVALID_GEOMETRY',
      ...(osm === undefined
        ? inferredCandidate === null
          ? {}
          : {
              geometryMatch: {
                strategy: 'SPATIAL_INFERENCE' as const,
                score: inferredCandidate.score.score,
                reasons: inferredCandidate.score.reasons,
              },
            }
        : {
            geometryMatch: {
              strategy:
                normalizeStreetMatchName(osm.canonicalName) === normalized
                  ? ('PRIMARY_NAME' as const)
                  : ('ALTERNATE_NAME' as const),
              matchedName:
                osm.aliases.find(
                  (alias) => normalizeStreetMatchName(alias) === normalized,
                ) ?? osm.canonicalName,
            },
          }),
      ...(candidateNames.length === 0
        ? {}
        : { geometryCandidates: candidateNames }),
      ...(candidateScores.length === 0
        ? {}
        : { candidateScores: candidateScores.slice(0, 3) }),
      ...(resolved?.candidate.uri === null ||
      resolved?.candidate.uri === undefined
        ? {}
        : {
            externalSources: yandexExternalSources(resolved),
          }),
      importedAt,
      validationStatus:
        geometry === undefined
          ? nearbyCandidates.length > 0
            ? 'GEOMETRY_AMBIGUOUS'
            : 'GEOMETRY_MISSING'
          : validGeometry
            ? 'READY'
            : 'GEOMETRY_MISSING',
    };

    if (resolved === null) {
      conflicts.push({
        severity: 'INFO',
        type: 'MISSING_FROM_YANDEX',
        objectId: imported.id,
        message: `${name}: Yandex street match not found`,
      });
    }
    if (geometry !== undefined && validGeometry === false) {
      conflicts.push({
        severity: 'BLOCKING',
        type: 'INVALID_GEOMETRY',
        objectId: imported.id,
        message: `${name}: generated geometry is invalid`,
      });
    }
    if (manual !== undefined) {
      registerCoordinateConflict(
        conflicts,
        coordinateDiagnostics,
        imported,
        manual,
      );
      imported = mergeManualLocation(imported, manual);
    }
    return imported;
  }

  private async importManualSeed(
    city: CityConfig,
    manual: CityLocationConfig,
    osmAreasByName: ReadonlyMap<string, OsmAreaInventoryItem>,
    osmAreas: readonly OsmAreaInventoryItem[],
    osmStreetWays: readonly OsmStreetWayCandidate[],
    osmAddresses: readonly OsmAddressEvidence[],
    conflicts: CityGeoImportConflict[],
    coordinateDiagnostics: CityGeoCoordinateDiagnostic[],
    importedAt: string,
  ): Promise<CityGeoObject> {
    let imported = await this.importNamedObject(
      city,
      manual.title,
      mapManualLocationType(manual),
      manual.aliases,
      importedAt,
    );
    if (
      (manual.kind === 'DISTRICT' || manual.kind === 'AREA') &&
      imported.geometry === undefined
    ) {
      const osmArea = [manual.title, ...manual.aliases]
        .map((name) => osmAreasByName.get(normalizeGeoName(name)))
        .find((candidate) => candidate !== undefined);
      if (osmArea !== undefined && geometryIsValid(osmArea.geometry)) {
        imported = {
          ...imported,
          geometry: osmArea.geometry,
          geometryPrecision: 'EXACT_GEOMETRY',
          geoSource: 'OSM',
          validationStatus: 'READY',
        };
      }
    }
    if (
      manual.kind === 'BRIDGE' &&
      imported.geometry === undefined &&
      imported.bounds !== undefined
    ) {
      const candidates = findWaysIntersectingBounds(
        osmStreetWays,
        imported.bounds,
      );
      const scores = scoreStreetCandidates({
        canonicalName: manual.title,
        aliases: manual.aliases,
        yandexPoint:
          imported.externalSources?.yandex?.point ??
          manual.verifiedCoordinates ??
          null,
        yandexBounds: imported.bounds,
        candidates,
        addresses: osmAddresses,
      });
      const selected = selectStrongStreetCandidate(candidates, scores);
      if (selected !== null) {
        imported = {
          ...imported,
          geometry: selected.candidate.geometry,
          geometryPrecision: 'EXACT_GEOMETRY',
          geoSource: 'OSM',
          mergeStatus: 'READY_YANDEX_OSM',
          validationStatus: 'READY',
          geometryMatch: {
            strategy: 'SPATIAL_INFERENCE',
            score: selected.score.score,
            reasons: selected.score.reasons,
          },
          candidateScores: scores.slice(0, 3),
        };
      } else if (scores.length > 0) {
        imported = {
          ...imported,
          candidateScores: scores.slice(0, 3),
          geometryCandidates: scores
            .slice(0, 3)
            .map(({ candidateLabel }) => candidateLabel),
        };
      }
    }
    const importedBounds = imported.bounds;
    if (
      (manual.kind === 'DISTRICT' || manual.kind === 'AREA') &&
      imported.geometry === undefined &&
      importedBounds !== undefined
    ) {
      const candidates = osmAreas.filter((area) =>
        boundsIntersect(area.bounds, importedBounds),
      );
      if (candidates.length > 0) {
        imported = {
          ...imported,
          geometryCandidates: uniqueStrings(
            candidates.map(({ canonicalName }) => canonicalName),
          ),
        };
      }
    }
    registerCoordinateConflict(
      conflicts,
      coordinateDiagnostics,
      imported,
      manual,
    );
    const merged = mergeManualLocation(imported, manual);
    if (manual.kind !== 'DISTRICT' && manual.kind !== 'AREA') return merged;
    const suggestedRadiusMeters = suggestedRadius(imported);
    return {
      ...merged,
      areaApproximation: {
        ...(merged.representativePoint === undefined
          ? {}
          : {
              representativePointSource:
                manual.areaGeometry === undefined
                  ? ('YANDEX' as const)
                  : ('MANUAL' as const),
            }),
        ...(imported.bounds === undefined ? {} : { boundsSource: 'YANDEX' }),
        ...(manual.areaGeometry === undefined
          ? suggestedRadiusMeters === null
            ? {}
            : { suggestedRadiusMeters }
          : {
              radiusSource: 'USER_CONFIRMED',
              radiusMeters: manual.areaGeometry.radiusMeters,
            }),
      },
      mergeStatus:
        manual.areaGeometry === undefined
          ? merged.representativePoint === undefined
            ? 'GEOMETRY_MISSING'
            : 'NEEDS_USER_CONFIRMATION'
          : merged.mergeStatus,
    };
  }

  private async importNamedObject(
    city: CityConfig,
    name: string,
    type: CityGeoObjectType,
    aliases: readonly string[],
    importedAt: string,
  ): Promise<CityGeoObject> {
    const query = type === 'SETTLEMENT' ? name : `${name}, ${city.name}`;
    const resolved = await this.resolveBestCandidate(
      city,
      query,
      suggestTypesFor(type),
      (candidate) =>
        (candidateBelongsToCoverage(candidate, city) ||
          (type === 'SETTLEMENT' && candidateIsLocality(candidate, name))) &&
        normalizeGeoName(candidate.title).includes(normalizeGeoName(name)),
    );
    const geo = resolved?.geo;
    const geometry = geo?.actualGeometry ?? undefined;
    const point = geo?.point ?? undefined;
    const bounds = geo?.bounds ?? undefined;
    const canonicalName = geo?.canonicalName ?? name;

    return {
      id: stableGeoId(city.id, type, canonicalName),
      cityId: city.id,
      canonicalName,
      aliases: uniqueStrings([name, ...aliases]),
      type,
      ...(point === undefined ? {} : { representativePoint: point }),
      ...(bounds === undefined ? {} : { bounds }),
      ...(geometry === undefined || !geometryIsValid(geometry)
        ? {}
        : { geometry }),
      geometryPrecision:
        geometry !== undefined
          ? 'EXACT_GEOMETRY'
          : bounds !== undefined
            ? 'BOUNDS_ONLY'
            : point !== undefined
              ? 'POINT_ONLY'
              : 'POINT_ONLY',
      geoSource: resolved === null ? 'MANUAL' : 'YANDEX',
      mergeStatus:
        resolved === null
          ? 'GEOMETRY_MISSING'
          : geometry === undefined
            ? 'NEEDS_USER_CONFIRMATION'
            : 'READY_YANDEX_OSM',
      ...(resolved?.candidate.uri === null ||
      resolved?.candidate.uri === undefined
        ? {}
        : {
            externalSources: yandexExternalSources(resolved),
          }),
      importedAt,
      validationStatus:
        geometry !== undefined
          ? 'READY'
          : bounds !== undefined
            ? 'BOUNDS_ONLY'
            : point !== undefined
              ? 'POINT_ONLY'
              : 'GEOMETRY_MISSING',
    };
  }

  private async resolveBestCandidate(
    city: CityConfig,
    query: string,
    types: readonly string[],
    predicate: (candidate: YandexSuggestCandidate) => boolean,
  ): Promise<{
    candidate: YandexSuggestCandidate;
    geo: YandexGeoObject;
  } | null> {
    const candidates = await this.dependencies.yandex.suggest({
      text: query,
      types,
      bounds: city.coverageBounds,
    });
    const candidate = candidates.find(
      (item) => item.uri !== null && predicate(item),
    );
    if (candidate?.uri === null || candidate?.uri === undefined) return null;
    const geo = await this.dependencies.yandex.geocodeUri(candidate.uri);
    return geo === null ? null : { candidate, geo };
  }
}

const toAppliedGeoObject = (
  object: CityGeoObject,
): Omit<
  CityGeoObject,
  'importedAt' | 'geometryCandidates' | 'candidateScores'
> => {
  const { importedAt, geometryCandidates, candidateScores, ...applied } =
    object;
  void importedAt;
  void geometryCandidates;
  void candidateScores;
  return applied;
};

const buildAppliedManifest = (
  cityId: string,
  objects: readonly ReturnType<typeof toAppliedGeoObject>[],
  sha256: string,
) => {
  const streets = objects.filter(({ type }) => type === 'STREET');
  return {
    schemaVersion: 1,
    datasetVersion: 1,
    cityId,
    sha256,
    streets: streets.length,
    streetsWithGeometry: streets.filter(
      ({ geometry }) => geometry !== undefined,
    ).length,
    ambiguousStreets: streets.filter(
      ({ mergeStatus }) => mergeStatus === 'IDENTITY_AMBIGUOUS',
    ).length,
    bridges: objects.filter(({ type }) => type === 'BRIDGE').length,
    areas: objects.filter(({ type }) => type === 'AREA' || type === 'DISTRICT')
      .length,
    settlements: objects.filter(({ type }) => type === 'SETTLEMENT').length,
  };
};

export const uniqueStreetSeeds = (
  city: CityConfig,
  osm: readonly OsmStreetInventoryItem[],
  suggest: readonly YandexSuggestCandidate[],
): readonly string[] => {
  const names = [
    ...osm.map(({ canonicalName }) => canonicalName),
    ...suggest.map(({ title }) => title),
    ...city.locations
      .filter(({ kind }) => kind === 'STREET')
      .map(({ title }) => title),
  ];
  const unique = new Map<string, string>();
  const protectedRoadObjects = new Set(
    city.locations
      .filter(({ kind }) => kind === 'BRIDGE')
      .flatMap(({ title, aliases }) => [title, ...aliases])
      .map(normalizeStreetMatchName),
  );
  for (const name of names) {
    const normalized = normalizeStreetMatchName(name);
    if (
      normalized &&
      !protectedRoadObjects.has(normalized) &&
      !unique.has(normalized)
    ) {
      unique.set(normalized, name);
    }
  }
  return [...unique.values()].sort((left, right) =>
    left.localeCompare(right, 'ru'),
  );
};

const candidateBelongsToCity = (
  candidate: YandexSuggestCandidate,
  cityName: string,
): boolean =>
  candidate.components.some(
    ({ name, kinds }) =>
      kinds.includes('LOCALITY') &&
      normalizeGeoName(name) === normalizeGeoName(cityName),
  );

const candidateBelongsToCoverage = (
  candidate: YandexSuggestCandidate,
  city: CityConfig,
): boolean => {
  const supportedNames = [
    city.name,
    ...city.nearbyAreas.flatMap((area) => [area.name, ...area.aliases]),
  ].map(normalizeGeoName);
  return candidate.components.some(({ name, kinds }) => {
    const normalized = normalizeGeoName(name);
    return (
      kinds.includes('LOCALITY') &&
      supportedNames.some(
        (supported) =>
          normalized === supported || normalized.includes(supported),
      )
    );
  });
};

const candidateIsLocality = (
  candidate: YandexSuggestCandidate,
  name: string,
): boolean =>
  candidate.components.some(
    (component) =>
      component.kinds.includes('LOCALITY') &&
      normalizeGeoName(component.name).includes(normalizeGeoName(name)),
  );

const suggestTypesFor = (type: CityGeoObjectType): readonly string[] => {
  switch (type) {
    case 'STREET':
      return ['street'];
    case 'DISTRICT':
      return ['district'];
    case 'AREA':
      return ['district', 'area'];
    case 'SETTLEMENT':
      return ['locality'];
    case 'BRIDGE':
    case 'LANDMARK':
    case 'INTERSECTION':
      return ['geo', 'biz'];
  }
};

const yandexExternalSources = (resolved: {
  candidate: YandexSuggestCandidate;
  geo: YandexGeoObject;
}): NonNullable<CityGeoObject['externalSources']> => ({
  yandex: {
    ...(resolved.candidate.uri === null
      ? {}
      : {
          uri: resolved.candidate.uri,
          externalId: yandexExternalId(resolved.candidate.uri),
        }),
    title: resolved.geo.canonicalName,
    ...(resolved.geo.formattedAddress === null
      ? {}
      : { address: resolved.geo.formattedAddress }),
    ...(resolved.geo.kind === null ? {} : { kind: resolved.geo.kind }),
    ...(resolved.geo.point === null ? {} : { point: resolved.geo.point }),
    ...(resolved.geo.bounds === null ? {} : { bounds: resolved.geo.bounds }),
  },
});

const findWaysIntersectingBounds = (
  ways: readonly OsmStreetWayCandidate[],
  bounds: NonNullable<YandexGeoObject['bounds']>,
): readonly OsmStreetWayCandidate[] =>
  ways.filter((way) => boundsIntersect(way.bounds, bounds));

const boundsIntersect = (
  first: NonNullable<YandexGeoObject['bounds']>,
  second: NonNullable<YandexGeoObject['bounds']>,
): boolean =>
  first.east >= second.west &&
  first.west <= second.east &&
  first.north >= second.south &&
  first.south <= second.north;

export const scoreStreetCandidates = (input: {
  canonicalName: string;
  aliases: readonly string[];
  yandexPoint: YandexGeoObject['point'];
  yandexBounds: YandexGeoObject['bounds'];
  candidates: readonly OsmStreetWayCandidate[];
  addresses: readonly OsmAddressEvidence[];
}): readonly StreetCandidateScore[] => {
  const expectedNames = new Set(
    [input.canonicalName, ...input.aliases].map(normalizeStreetMatchName),
  );
  const expectedBridge = normalizeGeoName(input.canonicalName).includes('мост');

  return input.candidates
    .map((candidate) => {
      const normalizedCandidateNames = candidate.names.map(
        normalizeStreetMatchName,
      );
      const exactName = normalizedCandidateNames.some((name) =>
        expectedNames.has(name),
      );
      const distanceToYandexPointMeters =
        input.yandexPoint === null
          ? null
          : Math.round(
              pointToLineDistanceMeters(
                input.yandexPoint,
                candidate.geometry.coordinates,
              ),
            );
      const boundsOverlapRatio =
        input.yandexBounds === null
          ? 0
          : lineBoundsOverlapRatio(
              candidate.geometry.coordinates,
              candidate.bounds,
              input.yandexBounds,
            );
      const matchingAddresses = input.addresses.filter(
        (address) =>
          expectedNames.has(normalizeStreetMatchName(address.streetName)) &&
          pointToLineDistanceMeters(
            address.coordinate,
            candidate.geometry.coordinates,
          ) <= 120,
      );
      const reasons: string[] = [];
      let score = 5;
      reasons.push('CITY_COVERAGE +5');
      if (exactName) {
        score += 45;
        reasons.push('NAME_MATCH +45');
      } else if (candidate.names.length === 0) {
        score -= 5;
        reasons.push('UNNAMED_WAY -5');
      } else {
        score -= 20;
        reasons.push('NAME_MISMATCH -20');
      }
      if (distanceToYandexPointMeters !== null) {
        if (distanceToYandexPointMeters <= 30) {
          score += 30;
          reasons.push('NEAR_YANDEX_POINT_30M +30');
        } else if (distanceToYandexPointMeters <= 75) {
          score += 24;
          reasons.push('NEAR_YANDEX_POINT_75M +24');
        } else if (distanceToYandexPointMeters <= 150) {
          score += 15;
          reasons.push('NEAR_YANDEX_POINT_150M +15');
        } else if (distanceToYandexPointMeters <= 300) {
          score += 5;
          reasons.push('NEAR_YANDEX_POINT_300M +5');
        } else if (distanceToYandexPointMeters > 500) {
          score -= 15;
          reasons.push('FAR_FROM_YANDEX_POINT -15');
        }
      }
      if (boundsOverlapRatio >= 0.8) {
        score += 30;
        reasons.push('INSIDE_YANDEX_BOUNDS +30');
      } else if (boundsOverlapRatio >= 0.4) {
        score += 20;
        reasons.push('STRONG_BOUNDS_OVERLAP +20');
      } else if (boundsOverlapRatio > 0) {
        score += 10;
        reasons.push('INTERSECTS_YANDEX_BOUNDS +10');
      } else {
        score -= 15;
        reasons.push('OUTSIDE_YANDEX_BOUNDS -15');
      }
      if (matchingAddresses.length >= 3) {
        score += 35;
        reasons.push('ADDR_STREET_EVIDENCE_3_PLUS +35');
      } else if (matchingAddresses.length > 0) {
        score += 20;
        reasons.push('ADDR_STREET_EVIDENCE +20');
      }
      if (
        ['footway', 'path', 'steps'].includes(candidate.highway ?? '') &&
        !normalizeGeoName(input.canonicalName).includes('аллея')
      ) {
        score -= 25;
        reasons.push('NON_DRIVABLE_HIGHWAY -25');
      }
      if (expectedBridge) {
        score += candidate.bridge ? 25 : -25;
        reasons.push(
          candidate.bridge ? 'EXPECTED_BRIDGE +25' : 'BRIDGE_TAG_MISSING -25',
        );
      }

      return {
        candidateId: candidate.osmId,
        candidateLabel:
          candidate.names.join(' / ') || `Без названия (${candidate.osmId})`,
        score,
        reasons,
        highway: candidate.highway,
        bridge: candidate.bridge,
        distanceToYandexPointMeters,
        boundsOverlapRatio: Number(boundsOverlapRatio.toFixed(3)),
        addressEvidenceCount: matchingAddresses.length,
        lengthMeters: Math.round(
          lineLengthMeters(candidate.geometry.coordinates),
        ),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidateId.localeCompare(right.candidateId),
    );
};

export const selectStrongStreetCandidate = (
  candidates: readonly OsmStreetWayCandidate[],
  scores: readonly StreetCandidateScore[],
): { candidate: OsmStreetWayCandidate; score: StreetCandidateScore } | null => {
  const best = scores[0];
  if (best === undefined) return null;
  const second = scores[1];
  if (second !== undefined && best.score - second.score < 15) return null;
  const candidate = candidates.find(({ osmId }) => osmId === best.candidateId);
  if (candidate === undefined) return null;
  const hasStrongSpatialLead =
    best.score >= 50 &&
    best.distanceToYandexPointMeters !== null &&
    best.distanceToYandexPointMeters <= 30 &&
    best.boundsOverlapRatio >= 0.4 &&
    (second === undefined || best.score - second.score >= 20);
  if (best.score < 55 && !hasStrongSpatialLead) return null;
  if (
    candidate.names.length === 0 &&
    (best.boundsOverlapRatio < 0.4 ||
      best.distanceToYandexPointMeters === null ||
      best.distanceToYandexPointMeters > 150 ||
      (best.addressEvidenceCount === 0 &&
        scores.length > 1 &&
        ((best.score < 60 && !hasStrongSpatialLead) ||
          (scores[1] !== undefined && best.score - scores[1].score < 20))))
  ) {
    return null;
  }
  if (
    candidate.names.length > 0 &&
    !best.reasons.includes('NAME_MATCH +45') &&
    best.addressEvidenceCount === 0
  ) {
    return null;
  }
  return { candidate, score: best };
};

const lineBoundsOverlapRatio = (
  line: readonly [number, number][],
  lineBounds: NonNullable<YandexGeoObject['bounds']>,
  expectedBounds: NonNullable<YandexGeoObject['bounds']>,
): number => {
  const inside = line.filter(
    ([longitude, latitude]) =>
      longitude >= expectedBounds.west &&
      longitude <= expectedBounds.east &&
      latitude >= expectedBounds.south &&
      latitude <= expectedBounds.north,
  ).length;
  if (inside > 0) return inside / line.length;
  return boundsIntersect(lineBounds, expectedBounds) ? 0.2 : 0;
};

const pointToLineDistanceMeters = (
  point: { latitude: number; longitude: number },
  line: readonly [number, number][],
): number => {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    if (start === undefined || end === undefined) continue;
    minimum = Math.min(
      minimum,
      pointToSegmentDistanceMeters(point, start, end),
    );
  }
  return minimum;
};

const pointToSegmentDistanceMeters = (
  point: { latitude: number; longitude: number },
  [startLongitude, startLatitude]: [number, number],
  [endLongitude, endLatitude]: [number, number],
): number => {
  const latitudeScale = 111_320;
  const longitudeScale = 111_320 * Math.cos((point.latitude * Math.PI) / 180);
  const pointX = point.longitude * longitudeScale;
  const pointY = point.latitude * latitudeScale;
  const startX = startLongitude * longitudeScale;
  const startY = startLatitude * latitudeScale;
  const endX = endLongitude * longitudeScale;
  const endY = endLatitude * latitudeScale;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  const fraction =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((pointX - startX) * deltaX + (pointY - startY) * deltaY) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    pointX - (startX + fraction * deltaX),
    pointY - (startY + fraction * deltaY),
  );
};

const lineLengthMeters = (line: readonly [number, number][]): number =>
  line.slice(1).reduce((sum, coordinate, index) => {
    const previous = line[index];
    return previous === undefined
      ? sum
      : sum +
          distanceMeters(
            { latitude: previous[1], longitude: previous[0] },
            { latitude: coordinate[1], longitude: coordinate[0] },
          );
  }, 0);

const suggestedRadius = (object: CityGeoObject): number | null => {
  const point = object.representativePoint;
  const bounds = object.bounds;
  if (point === undefined || bounds === undefined) return null;
  return Math.round(
    Math.max(
      distanceMeters(point, {
        latitude: bounds.north,
        longitude: point.longitude,
      }),
      distanceMeters(point, {
        latitude: bounds.south,
        longitude: point.longitude,
      }),
      distanceMeters(point, {
        latitude: point.latitude,
        longitude: bounds.east,
      }),
      distanceMeters(point, {
        latitude: point.latitude,
        longitude: bounds.west,
      }),
    ),
  );
};

const registerCoordinateConflict = (
  conflicts: CityGeoImportConflict[],
  coordinateDiagnostics: CityGeoCoordinateDiagnostic[],
  imported: CityGeoObject,
  manual: CityLocationConfig,
): void => {
  const diagnostic = classifyCoordinateDiagnostic(imported, manual);
  if (diagnostic === null) return;
  coordinateDiagnostics.push(diagnostic);
  conflicts.push({
    severity: 'WARNING',
    type:
      diagnostic.samePhysicalObject === 'NO'
        ? 'YANDEX_FALSE_MATCH'
        : diagnostic.samePhysicalObject === 'YES'
          ? 'MANUAL_POINT_PREFERRED'
          : 'COORDINATE_CONFLICT',
    objectId: manual.id,
    message: `${manual.title}: ${diagnostic.reason}`,
    details: { ...diagnostic },
  });
};

export const classifyCoordinateDiagnostic = (
  imported: CityGeoObject,
  manual: CityLocationConfig,
): CityGeoCoordinateDiagnostic | null => {
  if (
    manual.verifiedCoordinates === undefined ||
    imported.representativePoint === undefined
  ) {
    return null;
  }
  const distance = distanceMeters(
    manual.verifiedCoordinates,
    imported.representativePoint,
  );
  if (distance <= COORDINATE_CONFLICT_METERS) return null;
  const roundedDistance = Math.round(distance);
  const yandex = imported.externalSources?.yandex;
  const samePhysicalObject =
    manual.kind === 'SETTLEMENT'
      ? 'YES'
      : distance <= 300
        ? 'YES'
        : distance > 1_000
          ? 'NO'
          : 'UNCERTAIN';
  const reason =
    manual.kind === 'SETTLEMENT'
      ? 'Yandex locality center and RoadRadar representative point serve different purposes'
      : samePhysicalObject === 'YES'
        ? 'Difference is consistent with entrance, centroid or road-side reference placement'
        : samePhysicalObject === 'NO'
          ? 'Yandex candidate is a different physical object selected by a short local alias'
          : 'Manual point remains authoritative; candidate needs optional later review';
  const recommendedAction =
    samePhysicalObject === 'YES'
      ? 'MANUAL_POINT_PREFERRED'
      : samePhysicalObject === 'NO'
        ? 'KEEP_MANUAL_IGNORE_FALSE_MATCH'
        : 'KEEP_MANUAL_REVIEW_LATER';
  return {
    objectId: manual.id,
    canonical: manual.title,
    manualCoordinate: manual.verifiedCoordinates,
    yandexCandidateTitle: yandex?.title ?? null,
    yandexAddress: yandex?.address ?? null,
    yandexKind: yandex?.kind ?? null,
    yandexCoordinate: imported.representativePoint,
    distanceMeters: roundedDistance,
    samePhysicalObject,
    reason,
    recommendedAction,
  };
};

const buildReport = (input: {
  city: CityConfig;
  generatedAt: string;
  dryRun: boolean;
  capability: CityGeoImportReport['capability'];
  objects: readonly CityGeoObject[];
  osmStreets: readonly OsmStreetInventoryItem[];
  telegramCorpus: HistoricalLocationCorpus;
  conflicts: readonly CityGeoImportConflict[];
  coordinateDiagnostics: readonly CityGeoCoordinateDiagnostic[];
}): CityGeoImportReport => {
  const streets = input.objects.filter(({ type }) => type === 'STREET');
  const areas = input.objects.filter(({ type }) =>
    ['DISTRICT', 'AREA'].includes(type),
  );
  const settlements = input.objects.filter(({ type }) => type === 'SETTLEMENT');
  const yandexNames = new Set(
    input.objects
      .filter(({ externalSources }) => externalSources?.yandex !== undefined)
      .map(({ canonicalName }) => normalizeGeoName(canonicalName)),
  );
  const manualNames = new Set(
    input.city.locations.map(({ title }) => normalizeGeoName(title)),
  );
  const telegramNames = new Set(
    [...input.telegramCorpus.unique].map(normalizeGeoName),
  );
  const allNames = new Set([...yandexNames, ...manualNames, ...telegramNames]);
  const matched = [...allNames].filter(
    (name) =>
      yandexNames.has(name) &&
      (manualNames.has(name) || telegramNames.has(name)),
  );
  const severityCount = (severity: CityGeoImportConflict['severity']): number =>
    input.conflicts.filter((conflict) => conflict.severity === severity).length;
  const blocking = severityCount('BLOCKING');
  const warnings = severityCount('WARNING');
  const info = severityCount('INFO');
  const unresolvedStreets = streets
    .filter(({ geometry }) => geometry === undefined)
    .map((street) => ({
      canonicalName: street.canonicalName,
      ...(street.representativePoint === undefined
        ? {}
        : { yandexPoint: street.representativePoint }),
      ...(street.bounds === undefined ? {} : { yandexBounds: street.bounds }),
      osmCandidates: street.geometryCandidates ?? [],
      topCandidates: street.candidateScores ?? [],
      reason:
        street.mergeStatus === 'IDENTITY_AMBIGUOUS'
          ? 'OSM ways intersect Yandex bounds, but no safe name match exists'
          : 'No matching OSM highway geometry was found',
    }));
  const streetByName = new Map<string, CityGeoObject>();
  for (const street of streets) {
    for (const name of [street.canonicalName, ...street.aliases]) {
      streetByName.set(normalizeGeoName(name), street);
    }
  }
  const telegramStreetMatches = [...input.telegramCorpus.unique].flatMap(
    (name) => {
      const normalized = normalizeGeoName(name);
      const street = streetByName.get(normalized);
      return street === undefined ? [] : [{ normalized, street }];
    },
  );
  const telegramOccurrenceTotal = telegramStreetMatches.reduce(
    (sum, { normalized }) =>
      sum + (input.telegramCorpus.occurrences.get(normalized) ?? 0),
    0,
  );
  const telegramOccurrenceCovered = telegramStreetMatches.reduce(
    (sum, { normalized, street }) =>
      sum +
      (street.geometry === undefined
        ? 0
        : (input.telegramCorpus.occurrences.get(normalized) ?? 0)),
    0,
  );

  return {
    version: 2,
    cityId: input.city.id,
    generatedAt: input.generatedAt,
    dryRun: input.dryRun,
    applyStatus: {
      applyReady: blocking === 0,
      blocking,
      warnings,
      info,
    },
    capability: input.capability,
    streets: {
      discovered: streets.length,
      unique: streets.length,
      matchedExistingRoadRadar: streets.filter(({ id }) =>
        input.city.locations.some((location) => location.id === id),
      ).length,
      matchedTelegramCorpus: streets.filter(({ canonicalName, aliases }) =>
        [canonicalName, ...aliases].some((name) =>
          telegramNames.has(normalizeGeoName(name)),
        ),
      ).length,
      actualYandexGeometry: streets.filter(
        ({ geoSource, geometry }) =>
          geoSource === 'YANDEX' && geometry !== undefined,
      ).length,
      osmGeometry: streets.filter(
        ({ geoSource, geometry }) =>
          geoSource === 'OSM' && geometry !== undefined,
      ).length,
      manualGeometry: streets.filter(
        ({ geoSource, geometry }) =>
          geoSource === 'MANUAL' && geometry !== undefined,
      ).length,
      exactGeometry: streets.filter(({ geometry }) => geometry !== undefined)
        .length,
      geometryMissing: streets.filter(
        ({ mergeStatus }) => mergeStatus === 'GEOMETRY_MISSING',
      ).length,
      readyBeforeRecovery: streets.filter(
        ({ geometry, geometryMatch }) =>
          geometry !== undefined &&
          geometryMatch?.strategy !== 'ALTERNATE_NAME' &&
          geometryMatch?.strategy !== 'SPATIAL_INFERENCE',
      ).length,
      recoveredNow: streets.filter(
        ({ geometry, geometryMatch }) =>
          geometry !== undefined &&
          (geometryMatch?.strategy === 'ALTERNATE_NAME' ||
            geometryMatch?.strategy === 'SPATIAL_INFERENCE'),
      ).length,
      autoResolvedThisPass: streets.filter(
        ({ geometry, geometryMatch }) =>
          geometry !== undefined &&
          geometryMatch?.strategy === 'SPATIAL_INFERENCE',
      ).length,
      coveragePercent: percentage(
        streets.filter(({ geometry }) => geometry !== undefined).length,
        streets.length,
      ),
      ambiguous: streets.filter(
        ({ mergeStatus }) => mergeStatus === 'IDENTITY_AMBIGUOUS',
      ).length,
      invalid: streets.filter(
        ({ mergeStatus }) => mergeStatus === 'INVALID_GEOMETRY',
      ).length,
      unresolved: unresolvedStreets,
    },
    areas: {
      discovered: areas.length,
      unique: areas.length,
      actualYandexPolygon: areas.filter(
        ({ geoSource, geometry }) =>
          geoSource === 'YANDEX' &&
          (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon'),
      ).length,
      osmPolygon: areas.filter(
        ({ geoSource, geometry }) =>
          geoSource === 'OSM' &&
          (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon'),
      ).length,
      boundsOnly: areas.filter(
        ({ geometryPrecision }) => geometryPrecision === 'BOUNDS_ONLY',
      ).length,
      geometryMissing: areas.filter(
        ({ representativePoint, geometry }) =>
          representativePoint === undefined && geometry === undefined,
      ).length,
      approximateGeometryReady: areas.filter(
        ({ areaApproximation }) =>
          areaApproximation?.radiusSource === 'USER_CONFIRMED',
      ).length,
      radiusConfirmationNeeded: areas.filter(
        ({ mergeStatus }) => mergeStatus === 'NEEDS_USER_CONFIRMATION',
      ).length,
      diagnostics: areas.map((area) => ({
        canonical: area.canonicalName,
        aliases: area.aliases,
        yandexKind: area.externalSources?.yandex?.kind ?? null,
        yandexPoint: area.externalSources?.yandex?.point ?? null,
        yandexBounds: area.externalSources?.yandex?.bounds ?? null,
        osmCandidates: area.geometryCandidates ?? [],
        suggestedRadiusMeters:
          area.areaApproximation?.suggestedRadiusMeters ?? null,
      })),
    },
    settlements: {
      discovered: settlements.length,
      ready: settlements.filter(
        ({ representativePoint }) => representativePoint !== undefined,
      ).length,
      missing: settlements.filter(
        ({ representativePoint }) => representativePoint === undefined,
      ).length,
    },
    comparison: {
      yandexOnly: [...yandexNames].filter(
        (name) => !manualNames.has(name) && !telegramNames.has(name),
      ),
      roadRadarOnly: [...manualNames].filter((name) => !yandexNames.has(name)),
      telegramOnly: [...telegramNames].filter((name) => !yandexNames.has(name)),
      matched,
    },
    telegramCoverage: {
      uniqueStreetLocations: telegramStreetMatches.length,
      geometryCovered: telegramStreetMatches.filter(
        ({ street }) => street.geometry !== undefined,
      ).length,
      missingGeometry: telegramStreetMatches.filter(
        ({ street }) => street.geometry === undefined,
      ).length,
      occurrenceTotal: telegramOccurrenceTotal,
      occurrenceCovered: telegramOccurrenceCovered,
      occurrenceCoveragePercent: percentage(
        telegramOccurrenceCovered,
        telegramOccurrenceTotal,
      ),
    },
    readiness: {
      coreDatasetReady: blocking === 0,
      fullGeometryCoverage: streets.every(
        ({ geometry }) => geometry !== undefined,
      ),
    },
    conflicts: input.conflicts,
    coordinateDiagnostics: input.coordinateDiagnostics,
    externalEnrichment: {
      yandexMatched: input.objects.filter(
        ({ externalSources }) => externalSources?.yandex !== undefined,
      ).length,
      yandexUnmatched: input.conflicts.filter(
        ({ type }) => type === 'MISSING_FROM_YANDEX',
      ).length,
      yandexFalseMatches: input.conflicts.filter(
        ({ type }) => type === 'YANDEX_FALSE_MATCH',
      ).length,
      coordinateDiagnostics: input.coordinateDiagnostics.length,
    },
    objects: input.objects,
  };
};

const deduplicateObjects = (
  objects: readonly CityGeoObject[],
): readonly CityGeoObject[] => {
  const unique = new Map<string, CityGeoObject>();
  for (const object of objects) {
    const key = `${object.type}:${normalizeGeoName(object.canonicalName)}`;
    const current = unique.get(key);
    if (current === undefined || object.userVerified === true)
      unique.set(key, object);
  }
  return [...unique.values()].sort((left, right) =>
    left.canonicalName.localeCompare(right.canonicalName, 'ru'),
  );
};

const deduplicateSuggestCandidates = (
  candidates: readonly YandexSuggestCandidate[],
): readonly YandexSuggestCandidate[] => {
  const unique = new Map<string, YandexSuggestCandidate>();
  for (const candidate of candidates) {
    const key =
      candidate.uri ??
      `${normalizeGeoName(candidate.title)}:${candidate.subtitle}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
};

const uniqueStrings = (values: readonly string[]): readonly string[] => [
  ...new Map(
    values.filter(Boolean).map((value) => [normalizeGeoName(value), value]),
  ).values(),
];

const percentage = (part: number, total: number): number =>
  total === 0 ? 100 : Number(((part / total) * 100).toFixed(1));

export const mapConcurrent = async <T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, values.length || 1)) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        const value = values[index];
        if (value !== undefined) results[index] = await mapper(value, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
};

interface HistoricalLocationCorpus {
  readonly unique: ReadonlySet<string>;
  readonly occurrences: ReadonlyMap<string, number>;
}

const loadHistoricalLocationCandidates = async (
  directories: readonly string[],
): Promise<HistoricalLocationCorpus> => {
  const values = new Set<string>();
  const occurrences = new Map<string, number>();
  for (const directory of directories) {
    let files: string[];
    try {
      files = await readdir(directory);
    } catch {
      continue;
    }
    for (const file of files.filter((name) => name.endsWith('.ndjson'))) {
      let content: string;
      try {
        content = await readFile(join(directory, file), 'utf8');
      } catch {
        continue;
      }
      for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const lineValues = new Set<string>();
          collectLocationStrings(JSON.parse(line) as unknown, lineValues);
          for (const value of lineValues) {
            values.add(value);
            const normalized = normalizeGeoName(value);
            occurrences.set(normalized, (occurrences.get(normalized) ?? 0) + 1);
          }
        } catch {
          // A malformed review line must not abort the one-time import.
        }
      }
    }
  }
  return { unique: values, occurrences };
};

const collectLocationStrings = (
  value: unknown,
  target: Set<string>,
  parentKey = '',
): void => {
  if (typeof value === 'string') {
    if (
      [
        'locationtext',
        'locationinput',
        'locationalias',
        'canonicaltitle',
        'canonicallocation',
        'unknownlocationcandidate',
      ].includes(parentKey.toLocaleLowerCase()) &&
      value.trim()
    ) {
      target.add(value.trim());
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLocationStrings(item, target, parentKey);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'locations' && Array.isArray(child)) {
      for (const location of child) {
        if (location === null || typeof location !== 'object') continue;
        const text = (location as Record<string, unknown>).text;
        if (typeof text === 'string' && text.trim()) target.add(text.trim());
      }
    }
    collectLocationStrings(child, target, key);
  }
};

export const buildManualReviewGeoJson = (
  objects: readonly CityGeoObject[],
  ways: readonly OsmStreetWayCandidate[],
): Readonly<Record<string, unknown>> => {
  const wayById = new Map(ways.map((way) => [way.osmId, way]));
  const features = objects
    .filter(
      (object) => object.type === 'STREET' && object.geometry === undefined,
    )
    .flatMap((object) => {
      const referenceFeatures: Readonly<Record<string, unknown>>[] = [];
      if (object.representativePoint !== undefined) {
        referenceFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [
              object.representativePoint.longitude,
              object.representativePoint.latitude,
            ],
          },
          properties: {
            canonicalStreet: object.canonicalName,
            featureRole: 'YANDEX_REFERENCE_POINT',
          },
        });
      }
      if (object.bounds !== undefined) {
        const { west, south, east, north } = object.bounds;
        referenceFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
              ],
            ],
          },
          properties: {
            canonicalStreet: object.canonicalName,
            featureRole: 'YANDEX_BOUNDS',
          },
        });
      }
      const candidates = (object.candidateScores ?? [])
        .slice(0, 3)
        .flatMap((score, index) => {
          const way = wayById.get(score.candidateId);
          return way === undefined
            ? []
            : [
                {
                  type: 'Feature',
                  geometry: way.geometry,
                  properties: {
                    canonicalStreet: object.canonicalName,
                    featureRole: 'OSM_CANDIDATE',
                    candidateNumber: index + 1,
                    osmId: score.candidateId,
                    name: score.candidateLabel,
                    highway: score.highway,
                    bridge: score.bridge,
                    score: score.score,
                    distanceToYandexPointMeters:
                      score.distanceToYandexPointMeters,
                    boundsOverlapRatio: score.boundsOverlapRatio,
                    addressEvidenceCount: score.addressEvidenceCount,
                    lengthMeters: score.lengthMeters,
                    reasons: score.reasons.join('; '),
                  },
                },
              ];
        });
      return [...referenceFeatures, ...candidates];
    });

  return { type: 'FeatureCollection', features };
};

export const importReportPath = (options: CityGeoImportOptions): string =>
  join(
    options.runtimeDataRoot,
    options.cityId,
    'reports',
    'city-geo-import-report.json',
  );

export const reportDisplayName = (path: string): string => basename(path);
