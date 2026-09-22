import type { CityConfig } from '../city.types';
import {
  loadAppliedCityGeoDataset,
  mergeCityLocations,
} from '../city-geo-dataset';
import { BALAKOVO_LOCATION_DICTIONARY } from '../../integrations/telegram/parser/balakovo-location.dictionary';

export const BALAKOVO_BASE_CITY_CONFIG: CityConfig = {
  id: 'balakovo',
  name: 'Балаково',
  center: {
    latitude: 52.0278,
    longitude: 47.8007,
  },
  defaultZoom: 13,
  coverageBounds: {
    west: 47.5,
    south: 51.82,
    east: 48.2,
    north: 52.25,
  },
  // Technical RoadRadar coverage, not an administrative city boundary.
  coverageBoundary: {
    type: 'Polygon',
    coordinates: [
      [
        [47.5, 51.82],
        [48.2, 51.82],
        [48.2, 52.25],
        [47.5, 52.25],
        [47.5, 51.82],
      ],
    ],
  },
  nearbyAreas: [
    {
      id: 'natalyino',
      name: 'Натальино',
      aliases: ['натальино'],
      type: 'SETTLEMENT',
    },
    {
      id: 'ivanovka',
      name: 'Ивановка',
      aliases: ['ивановка'],
      type: 'SETTLEMENT',
    },
    {
      id: 'podsosenki',
      name: 'Подсосенки',
      aliases: ['подсосенки'],
      type: 'SETTLEMENT',
    },
    {
      id: 'bykov-otrog',
      name: 'Быков Отрог',
      aliases: ['быков отрог', 'быковотрог'],
      type: 'SETTLEMENT',
    },
  ],
  locations: BALAKOVO_LOCATION_DICTIONARY,
};

const appliedDataset = loadAppliedCityGeoDataset('balakovo');

export const BALAKOVO_CITY_CONFIG: CityConfig = {
  ...BALAKOVO_BASE_CITY_CONFIG,
  locations:
    appliedDataset === null
      ? BALAKOVO_LOCATION_DICTIONARY
      : mergeCityLocations(
          BALAKOVO_LOCATION_DICTIONARY,
          appliedDataset.locations,
        ),
};

export const BALAKOVO_APPLIED_GEO_MANIFEST = appliedDataset?.manifest ?? null;
