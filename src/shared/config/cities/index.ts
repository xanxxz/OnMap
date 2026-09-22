import { balakovoCity } from './balakovo';
import type { CityConfig } from './city.types';

export * from './balakovo';
export * from './city.types';

export const ACTIVE_CITY = balakovoCity;

export class CitiesRegistry {
  private readonly configs: ReadonlyMap<string, CityConfig>;

  constructor(configs: readonly CityConfig[]) {
    this.configs = new Map(configs.map(config => [config.id, config]));
  }

  get(cityId: string): CityConfig | undefined {
    return this.configs.get(cityId);
  }

  list(): readonly CityConfig[] {
    return [...this.configs.values()];
  }
}

export const citiesRegistry = new CitiesRegistry([balakovoCity]);

export const getCityConfig = (cityId: string): CityConfig | undefined =>
  citiesRegistry.get(cityId);

export const getAvailableCities = (): readonly CityConfig[] =>
  citiesRegistry.list();
