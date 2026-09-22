import {
  BALAKOVO_BASE_CITY_CONFIG,
  BALAKOVO_CITY_CONFIG,
} from './balakovo/balakovo.config';
import type { CityConfig } from './city.types';

export class CitiesRegistry {
  private readonly configs: ReadonlyMap<string, CityConfig>;

  constructor(configs: readonly CityConfig[]) {
    this.configs = new Map(configs.map((config) => [config.id, config]));
  }

  get(cityId: string): CityConfig | undefined {
    return this.configs.get(cityId);
  }
}

export const citiesRegistry = new CitiesRegistry([BALAKOVO_CITY_CONFIG]);

export const getCityConfig = (cityId: string): CityConfig | undefined =>
  citiesRegistry.get(cityId);

const cityImportConfigs = new CitiesRegistry([BALAKOVO_BASE_CITY_CONFIG]);

export const getCityImportConfig = (cityId: string): CityConfig | undefined =>
  cityImportConfigs.get(cityId);

export const requireCityConfig = (cityId: string): CityConfig => {
  const city = getCityConfig(cityId);

  if (city === undefined) {
    throw new Error(`Unsupported cityId: ${cityId}`);
  }

  return city;
};

export const isCoordinateInsideCityCoverage = (
  city: CityConfig,
  latitude: number,
  longitude: number,
): boolean =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= city.coverageBounds.south &&
  latitude <= city.coverageBounds.north &&
  longitude >= city.coverageBounds.west &&
  longitude <= city.coverageBounds.east;
