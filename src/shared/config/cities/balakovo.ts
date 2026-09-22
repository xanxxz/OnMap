import type {CityConfig} from './city.types';
import {balakovoDisplayBoundary} from './balakovo.display-boundary.geojson';

export const balakovoCity: CityConfig = {
  id: 'balakovo',

  name: 'Балаково',

  center: [47.8007, 52.0278],

  displayBoundary: balakovoDisplayBoundary,

  coverageBounds: {
    west: 47.5,
    south: 51.82,
    east: 48.2,
    north: 52.25,
  },

  // Technical OnMap coverage, not an administrative city boundary.
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
      aliases: [
        'быков отрог',
        'быковотрог',
      ],
      type: 'SETTLEMENT',
    },
  ],

  defaultZoom: 13,

  minZoom: 10.8,

  maxZoom: 19,
};
