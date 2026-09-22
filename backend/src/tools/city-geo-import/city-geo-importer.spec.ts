import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CityGeoImporter,
  classifyCoordinateDiagnostic,
} from './city-geo-importer';
import type {
  CityGeoImportOptions,
  YandexGeoObject,
  YandexSuggestCandidate,
} from './city-geo-import.types';
import type { OsmCityGeoProvider } from './osm-city-geo.provider';
import type { YandexCityGeoProvider } from './yandex-city-geo.provider';

describe('CityGeoImporter', () => {
  let root: string;
  let options: CityGeoImportOptions;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'city-geo-importer-'));
    options = {
      cityId: 'balakovo',
      refresh: false,
      apply: false,
      runtimeDataRoot: join(root, 'runtime'),
      appliedDataRoot: join(root, 'applied'),
      historicalLogDirectories: [join(root, 'logs')],
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('builds a dry-run inventory without mutating the applied dataset', async () => {
    const { importer } = importerFixture();
    const report = await importer.run(options);

    expect(report.dryRun).toBe(true);
    expect(report.applyStatus).toMatchObject({
      applyReady: true,
      blocking: 0,
    });
    expect(report.capability).toMatchObject({
      suggestOk: true,
      uriResolving: true,
      point: true,
      boundedBy: true,
      actualLineString: false,
      actualPolygon: false,
    });
    expect(
      report.objects.some(
        ({ canonicalName }) => canonicalName === 'Тестовая улица',
      ),
    ).toBe(true);
    await expect(
      access(join(root, 'applied', 'balakovo', 'imported-locations.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('applies only when the explicit apply option is enabled', async () => {
    const { importer } = importerFixture();
    const report = await importer.run({ ...options, apply: true });
    const applied = JSON.parse(
      await readFile(
        join(root, 'applied', 'balakovo', 'imported-locations.json'),
        'utf8',
      ),
    ) as { schemaVersion: number; cityId: string; objects: unknown[] };
    const manifest = JSON.parse(
      await readFile(
        join(root, 'applied', 'balakovo', 'manifest.json'),
        'utf8',
      ),
    ) as { schemaVersion: number; sha256: string };

    expect(applied.schemaVersion).toBe(1);
    expect(report.dryRun).toBe(false);
    expect(applied.cityId).toBe('balakovo');
    expect(applied.objects.length).toBeGreaterThan(0);
    expect(JSON.stringify(applied)).not.toContain('importedAt');
    expect(manifest).toMatchObject({ schemaVersion: 1 });
    expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('blocks apply only for a real blocking conflict', async () => {
    const { importer } = importerFixture({ invalidGeometry: true });

    await expect(importer.run({ ...options, apply: true })).rejects.toThrow(
      'CITY_GEO_APPLY_BLOCKED',
    );
  });

  it('cross-checks historical Telegram location candidates', async () => {
    await mkdir(join(root, 'logs'), { recursive: true });
    await writeFile(
      join(root, 'logs', 'telegram-matched.ndjson'),
      `${JSON.stringify({ parser: { locationText: 'Тестовая улица' } })}\n`,
      'utf8',
    );
    const { importer } = importerFixture();
    const report = await importer.run(options);

    expect(report.streets.matchedTelegramCorpus).toBeGreaterThanOrEqual(1);
  });

  it('keeps exact OSM geometry matched by normalized street name', async () => {
    const { importer } = importerFixture();
    const report = await importer.run(options);
    const street = report.objects.find(
      ({ canonicalName }) => canonicalName === 'Тестовая улица',
    );

    expect(street).toMatchObject({
      type: 'STREET',
      geoSource: 'OSM',
      geometryPrecision: 'EXACT_GEOMETRY',
      geometry: { type: 'LineString' },
    });
  });

  it('rejects an unsupported city without touching providers', async () => {
    const { importer, yandex, osm } = importerFixture();
    await expect(
      importer.run({ ...options, cityId: 'unknown-city' }),
    ).rejects.toThrow('UNSUPPORTED_CITY');
    expect(yandex.suggest).not.toHaveBeenCalled();
    expect(osm.inventoryStreets).not.toHaveBeenCalled();
  });

  it('classifies a close trusted point as a non-blocking manual preference', () => {
    const diagnostic = classifyCoordinateDiagnostic(
      {
        id: 'generated',
        cityId: 'balakovo',
        canonicalName: 'Гипер Лента',
        aliases: ['Лента'],
        type: 'LANDMARK',
        representativePoint: { latitude: 52.006476, longitude: 47.793101 },
        geometryPrecision: 'POINT_ONLY',
        geoSource: 'YANDEX',
        validationStatus: 'POINT_ONLY',
      },
      {
        id: 'lenta',
        title: 'Лента',
        aliases: ['лента'],
        kind: 'LANDMARK',
        verifiedCoordinates: { latitude: 52.00552, longitude: 47.794321 },
      },
    );

    expect(diagnostic).toMatchObject({
      samePhysicalObject: 'YES',
      recommendedAction: 'MANUAL_POINT_PREFERRED',
    });
  });

  it('classifies a distant short-alias candidate as a Yandex false match', () => {
    const diagnostic = classifyCoordinateDiagnostic(
      {
        id: 'generated',
        cityId: 'balakovo',
        canonicalName: '43-й квартал',
        aliases: ['43'],
        type: 'LANDMARK',
        representativePoint: { latitude: 51.989511, longitude: 47.770269 },
        geometryPrecision: 'POINT_ONLY',
        geoSource: 'YANDEX',
        validationStatus: 'POINT_ONLY',
      },
      {
        id: 'college-43',
        title: '43',
        aliases: ['поволжский'],
        kind: 'LANDMARK',
        verifiedCoordinates: { latitude: 52.009728, longitude: 47.789546 },
      },
    );

    expect(diagnostic).toMatchObject({
      samePhysicalObject: 'NO',
      recommendedAction: 'KEEP_MANUAL_IGNORE_FALSE_MATCH',
    });
  });
});

const importerFixture = (
  fixtureOptions: { invalidGeometry?: boolean } = {},
) => {
  const streetCoordinates: [number, number][] = fixtureOptions.invalidGeometry
    ? [
        [47.8, 52.01],
        [80, 20],
      ]
    : [
        [47.8, 52.01],
        [47.81, 52.02],
      ];
  const yandex = {
    suggest: jest.fn(({ text }: { text: string }) => {
      if (text === 'Улица Комарова, Балаково') {
        return Promise.resolve([
          streetCandidate('улица Комарова', 'komarova-uri'),
        ]);
      }
      if (text === 'Балаково') {
        return Promise.resolve([localityCandidate('Балаково', 'balakovo-uri')]);
      }
      if (text.includes('Тестовая улица')) {
        return Promise.resolve([
          streetCandidate('Тестовая улица', 'test-street-uri'),
        ]);
      }
      return Promise.resolve([]);
    }),
    geocodeUri: jest.fn((uri: string) => {
      if (uri === 'balakovo-uri') {
        return Promise.resolve(geo('Балаково', 'locality'));
      }
      if (uri === 'test-street-uri') {
        return Promise.resolve(geo('Тестовая улица', 'street'));
      }
      return Promise.resolve(geo('улица Комарова', 'street'));
    }),
  };
  const osm = {
    inventoryStreetEvidence: jest.fn().mockResolvedValue({
      ways: [
        {
          osmId: 'way/test',
          names: ['Тестовая улица'],
          highway: 'residential',
          bridge: false,
          geometry: {
            type: 'LineString',
            coordinates: streetCoordinates,
          },
          bounds: {
            west: 47.8,
            south: 52.01,
            east: 47.81,
            north: 52.02,
          },
        },
      ],
      addresses: [],
    }),
    inventoryStreetWays: jest.fn().mockResolvedValue([
      {
        names: ['Тестовая улица'],
        geometry: {
          type: 'LineString',
          coordinates: streetCoordinates,
        },
        bounds: { west: 47.8, south: 52.01, east: 47.81, north: 52.02 },
      },
    ]),
    inventoryStreets: jest.fn().mockResolvedValue([
      {
        canonicalName: 'Тестовая улица',
        aliases: ['Тестовая улица'],
        geometry: {
          type: 'LineString',
          coordinates: streetCoordinates,
        },
      },
    ]),
    inventoryAreas: jest.fn().mockResolvedValue([]),
  };
  const importer = new CityGeoImporter({
    yandex: yandex as unknown as YandexCityGeoProvider,
    osm: osm as unknown as OsmCityGeoProvider,
    concurrency: 3,
    now: () => new Date('2026-09-21T12:00:00.000Z'),
  });
  return { importer, yandex, osm };
};

const streetCandidate = (
  title: string,
  uri: string,
): YandexSuggestCandidate => ({
  title,
  subtitle: 'Балаково',
  tags: ['street'],
  uri,
  formattedAddress: `Балаково, ${title}`,
  components: [
    { name: 'Балаково', kinds: ['LOCALITY'] },
    { name: title, kinds: ['STREET'] },
  ],
});

const localityCandidate = (
  title: string,
  uri: string,
): YandexSuggestCandidate => ({
  title,
  subtitle: 'Саратовская область',
  tags: ['locality'],
  uri,
  formattedAddress: title,
  components: [{ name: title, kinds: ['LOCALITY'] }],
});

const geo = (canonicalName: string, kind: string): YandexGeoObject => ({
  canonicalName,
  formattedAddress: canonicalName,
  kind,
  precision: kind,
  uri: `${canonicalName}-uri`,
  point: { latitude: 52.02, longitude: 47.8 },
  bounds: { west: 47.7, south: 51.95, east: 47.9, north: 52.06 },
  actualGeometry: null,
  components: [{ name: 'Балаково', kind: 'locality' }],
});
