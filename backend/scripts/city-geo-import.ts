import 'source-map-support/register';

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

import { CityGeoImportCache } from '../src/tools/city-geo-import/city-geo-import.cache';
import {
  CityGeoImporter,
  importReportPath,
} from '../src/tools/city-geo-import/city-geo-importer';
import type { CityGeoImportOptions } from '../src/tools/city-geo-import/city-geo-import.types';
import { OsmCityGeoProvider } from '../src/tools/city-geo-import/osm-city-geo.provider';
import { YandexCityGeoProvider } from '../src/tools/city-geo-import/yandex-city-geo.provider';

loadEnv({ path: resolve(process.cwd(), '.env'), quiet: true });

const parsed = parseArguments(process.argv.slice(2));

async function run(parsedArguments: ParsedArguments): Promise<void> {
  const suggestApiKey = requiredEnv('YANDEX_SUGGEST_API_KEY');
  const geocoderApiKey = requiredEnv('YANDEX_GEOCODER_API_KEY');
  const runtimeDataRoot = resolve(
    process.cwd(),
    'runtime-data/city-geo-import',
  );
  const options: CityGeoImportOptions = {
    cityId: parsedArguments.cityId as string,
    refresh: parsedArguments.refresh,
    apply: parsedArguments.apply,
    runtimeDataRoot,
    appliedDataRoot: resolve(process.cwd(), 'src/cities/data'),
    historicalLogDirectories: [
      resolve(process.cwd(), 'runtime-logs/telegram'),
      resolve(process.cwd(), 'runtime-data/telegram'),
    ],
  };
  const cache = new CityGeoImportCache(runtimeDataRoot, options.refresh);
  const concurrency = positiveIntegerEnv(
    'YANDEX_CITY_IMPORT_CONCURRENCY',
    3,
    1,
    8,
  );
  const requestDelayMs = positiveIntegerEnv(
    'YANDEX_CITY_IMPORT_REQUEST_DELAY_MS',
    150,
    0,
    10_000,
  );
  const endpoints = (process.env.OSM_OVERPASS_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const importer = new CityGeoImporter({
    yandex: new YandexCityGeoProvider({
      suggestApiKey,
      geocoderApiKey,
      cache,
      requestDelayMs,
    }),
    osm: new OsmCityGeoProvider({
      cache,
      ...(endpoints.length === 0 ? {} : { endpoints }),
    }),
    concurrency,
  });

  process.stdout.write(
    `City geo import: city=${options.cityId} mode=${options.apply ? 'APPLY' : 'DRY_RUN'} refresh=${options.refresh}\n`,
  );
  const report = await importer.run(options);
  printReport(report, importReportPath(options));
}

interface ParsedArguments {
  readonly cityId: string | null;
  readonly refresh: boolean;
  readonly apply: boolean;
}

export function parseArguments(args: readonly string[]): ParsedArguments {
  let cityId: string | null = null;
  let refresh = false;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--city') {
      cityId = args[index + 1]?.trim() || null;
      index += 1;
    } else if (argument === '--refresh') {
      refresh = true;
    } else if (argument === '--apply') {
      apply = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { cityId, refresh, apply };
}

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for city geo import`);
  return value;
};

const positiveIntegerEnv = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
};

const printReport = (
  report: Awaited<ReturnType<CityGeoImporter['run']>>,
  path: string,
): void => {
  const lines = [
    '',
    'YANDEX API CAPABILITY',
    `Suggest request: ${report.capability.suggestOk ? 'OK' : 'FAIL'}`,
    `Suggest URI: ${report.capability.suggestUri ? 'YES' : 'NO'}`,
    `Suggest types: ${report.capability.suggestTypes.join(', ') || '—'}`,
    `Geocoder URI resolving: ${report.capability.uriResolving ? 'OK' : 'FAIL'}`,
    `Point: ${yesNo(report.capability.point)}`,
    `kind: ${yesNo(report.capability.kind)}`,
    `boundedBy: ${yesNo(report.capability.boundedBy)}`,
    `actual LineString: ${yesNo(report.capability.actualLineString)}`,
    `actual Polygon: ${yesNo(report.capability.actualPolygon)}`,
    '',
    'APPLY STATUS',
    `APPLY_READY: ${yesNo(report.applyStatus.applyReady)}`,
    `Blocking conflicts: ${report.applyStatus.blocking}`,
    `Warnings: ${report.applyStatus.warnings}`,
    `Info: ${report.applyStatus.info}`,
    '',
    'STREETS',
    `discovered: ${report.streets.discovered}`,
    `unique: ${report.streets.unique}`,
    `matched existing RoadRadar: ${report.streets.matchedExistingRoadRadar}`,
    `matched Telegram corpus: ${report.streets.matchedTelegramCorpus}`,
    `actual Yandex geometry: ${report.streets.actualYandexGeometry}`,
    `OSM geometry: ${report.streets.osmGeometry}`,
    `manual geometry: ${report.streets.manualGeometry}`,
    `exact geometry: ${report.streets.exactGeometry}`,
    `geometry coverage: ${report.streets.coveragePercent}%`,
    `ready before recovery: ${report.streets.readyBeforeRecovery}`,
    `recovered now: ${report.streets.recoveredNow}`,
    `auto-resolved this pass: ${report.streets.autoResolvedThisPass}`,
    `geometry missing: ${report.streets.geometryMissing}`,
    `ambiguous: ${report.streets.ambiguous}`,
    `invalid: ${report.streets.invalid}`,
    '',
    'AREAS / DISTRICTS',
    `discovered: ${report.areas.discovered}`,
    `unique: ${report.areas.unique}`,
    `actual Yandex polygon: ${report.areas.actualYandexPolygon}`,
    `OSM polygon: ${report.areas.osmPolygon}`,
    `approximate geometry ready: ${report.areas.approximateGeometryReady}`,
    `radius confirmation needed: ${report.areas.radiusConfirmationNeeded}`,
    `bounds only: ${report.areas.boundsOnly}`,
    `geometry missing: ${report.areas.geometryMissing}`,
    '',
    'SETTLEMENTS',
    `discovered: ${report.settlements.discovered}`,
    `ready: ${report.settlements.ready}`,
    `missing: ${report.settlements.missing}`,
    '',
    'TELEGRAM COVERAGE',
    `used streets: ${report.telegramCoverage.uniqueStreetLocations}`,
    `geometry covered: ${report.telegramCoverage.geometryCovered}`,
    `occurrence coverage: ${report.telegramCoverage.occurrenceCoveragePercent}%`,
    '',
    `CORE_DATASET_READY: ${yesNo(report.readiness.coreDatasetReady)}`,
    `FULL_GEOMETRY_COVERAGE: ${yesNo(report.readiness.fullGeometryCoverage)}`,
    '',
    `conflicts: ${report.conflicts.length}`,
    `mode: ${report.dryRun ? 'DRY_RUN' : 'APPLY'}`,
    `report: ${path}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
};

const yesNo = (value: boolean): string => (value ? 'YES' : 'NO');

if (parsed.cityId === null) {
  process.stderr.write(
    'Usage: npm run city:geo-import -- --city <cityId> [--refresh] [--apply]\n',
  );
  process.exitCode = 1;
} else {
  void run(parsed).catch((error: unknown) => {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`City geo import failed: ${name}: ${message}\n`);
    process.exitCode = 1;
  });
}
