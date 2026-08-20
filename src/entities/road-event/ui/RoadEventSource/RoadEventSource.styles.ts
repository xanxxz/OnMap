import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native';

import {
  colors,
} from '../../../../shared/theme';

export const clusterCirclePaint:
  CircleLayerSpecification['paint'] =
  {
    'circle-color':
      colors.textPrimary,

    'circle-radius': [
      'step',

      ['get', 'point_count'],

      19,

      4,
      21,

      8,
      23,

      16,
      26,

      30,
      29,
    ],

    'circle-stroke-width': 3,

    'circle-stroke-color':
      colors.surface,

    'circle-opacity': 0.96,
  };

export const clusterIconLayout:
  SymbolLayerSpecification['layout'] =
  {
    'icon-image':
      'road-event-cluster',

    'icon-size': 0.31,

    'icon-allow-overlap': true,

    'icon-ignore-placement': true,

    'icon-anchor': 'center',
  };

export const eventCirclePaint:
  CircleLayerSpecification['paint'] =
  {
    'circle-radius': 19,

    'circle-color': [
      'match',

      ['get', 'eventType'],

      'ACCIDENT',
      colors.accident,

      'ROAD_CLOSURE',
      colors.closure,

      'ROADWORKS',
      colors.roadworks,

      'TRAFFIC',
      colors.traffic,

      'ROAD_HAZARD',
      colors.hazard,

      'TRAFFIC_LIGHT',
      colors.trafficLight,

      'ROAD_SERVICE',
      colors.roadService,

      'ROAD_PATROL',
      colors.roadPatrol,

      colors.other,
    ],

    'circle-stroke-width': 3,

    'circle-stroke-color':
      colors.surface,

    'circle-opacity': [
      'match',

      ['get', 'status'],

      'STALE',
      0.42,

      'UNCONFIRMED',
      0.7,

      1,
    ],
  };

export const selectedEventPaint:
  CircleLayerSpecification['paint'] =
  {
    'circle-radius': 27,

    'circle-color':
      colors.primary,

    'circle-opacity': 0.13,

    'circle-stroke-width': 2,

    'circle-stroke-color':
      colors.primary,

    'circle-stroke-opacity':
      0.45,
  };

export const eventIconLayout:
  SymbolLayerSpecification['layout'] =
  {
    'icon-image': [
      'get',
      'iconName',
    ],

    'icon-size': [
      'match',

      ['get', 'status'],

      'STALE',
      0.29,

      0.34,
    ],

    'icon-allow-overlap': true,

    'icon-ignore-placement': true,

    'icon-anchor': 'center',
  };