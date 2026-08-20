import {balakovoCity} from './balakovo';

export * from './balakovo';

export const ACTIVE_CITY = balakovoCity;

export const cities = {
  balakovo: balakovoCity,
} as const;