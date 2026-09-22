import type {
  CircleLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native';

import { colors } from '../../../../shared/theme';

import { eventMarkerColors } from '../EventMarker/eventMarkerVisualConfig';

export const REGULAR_EVENT_MARKER_RADIUS = 16;
export const DPS_EVENT_MARKER_RADIUS = 19;

export const clusterCirclePaint: CircleLayerSpecification['paint'] = {
  'circle-color': colors.brandForest,

  'circle-radius': [
    'step',

    ['get', 'point_count'],

    17,

    4,
    19,

    8,
    21,

    16,
    24,

    30,
    27,
  ],

  'circle-stroke-width': 2,

  'circle-stroke-color': colors.surface,

  'circle-opacity': 0.96,
};

export const clusterIconLayout: SymbolLayerSpecification['layout'] = {
  'icon-image': 'road-event-cluster',

  'icon-size': 0.31,

  'icon-allow-overlap': true,

  'icon-ignore-placement': true,

  'icon-anchor': 'center',
};

export const eventCirclePaint: CircleLayerSpecification['paint'] = {
  'circle-radius': [
    'match',
    ['get', 'eventType'],
    'ROAD_PATROL',
    DPS_EVENT_MARKER_RADIUS,
    REGULAR_EVENT_MARKER_RADIUS,
  ],

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

  'circle-stroke-width': 2,

  'circle-stroke-color': colors.surface,

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

export const selectedEventBodyPaint: CircleLayerSpecification['paint'] = {
  ...eventCirclePaint,
  'circle-radius': [
    'match',
    ['get', 'eventType'],
    'ROAD_PATROL',
    DPS_EVENT_MARKER_RADIUS + 3,
    REGULAR_EVENT_MARKER_RADIUS + 3,
  ],
  'circle-stroke-width': 2.5,
  'circle-opacity': 1,
};

export const selectedEventPaint: CircleLayerSpecification['paint'] = {
  'circle-radius': ['match', ['get', 'eventType'], 'ROAD_PATROL', 28, 24],

  'circle-color': colors.primary,

  'circle-opacity': 0.085,

  'circle-stroke-width': 2,

  'circle-stroke-color': colors.primary,

  'circle-stroke-opacity': 0.34,
};

export const dpsHaloPaint: CircleLayerSpecification['paint'] = {
  'circle-radius': 23,
  'circle-color': colors.roadPatrol,
  'circle-opacity': 0.07,
  'circle-blur': 0.7,
};

export const staleDpsWarningPaint: CircleLayerSpecification['paint'] = {
  'circle-radius': DPS_EVENT_MARKER_RADIUS + 5,
  'circle-color': 'rgba(0,0,0,0)',
  'circle-opacity': 0,
  'circle-stroke-width': 2,
  'circle-stroke-color': '#D94348',
  'circle-stroke-opacity': 0.72,
};

export const approximateAreaHaloPaint: CircleLayerSpecification['paint'] = {
  'circle-radius': [
    'interpolate',
    ['linear'],
    ['zoom'],
    10,
    18,
    13,
    30,
    16,
    44,
  ],
  'circle-color': colors.primary,
  'circle-opacity': 0.045,
  'circle-stroke-width': 1,
  'circle-stroke-color': colors.primary,
  'circle-stroke-opacity': 0.12,
  'circle-blur': 0.55,
};

export const eventIconLayout: SymbolLayerSpecification['layout'] = {
  'icon-image': ['get', 'iconName'],

  'icon-size': [
    'match',
    ['get', 'eventType'],
    'ROAD_PATROL',
    ['match', ['get', 'status'], 'STALE', 0.31, 0.36],
    ['match', ['get', 'status'], 'STALE', 0.26, 0.3],
  ],

  'icon-allow-overlap': true,

  'icon-ignore-placement': true,

  'icon-anchor': 'center',
};

export const selectedEventIconLayout: SymbolLayerSpecification['layout'] = {
  ...eventIconLayout,
  'icon-size': ['match', ['get', 'eventType'], 'ROAD_PATROL', 0.4, 0.34],
};

export const tomTomPointPaint: CircleLayerSpecification['paint'] = {
  'circle-radius': 15,

  'circle-color': [
    'match',

    ['get', 'eventType'],

    'ACCIDENT',
    colors.accident,

    'ROAD_CLOSURE',
    colors.closure,

    'ROADWORKS',
    colors.roadworks,

    'TRAFFIC_JAM',
    colors.traffic,

    'HAZARD',
    colors.hazard,

    colors.other,
  ],

  'circle-stroke-width': 1.75,

  'circle-stroke-color': colors.textPrimary,

  'circle-opacity': 0.92,
};

export const tomTomPointIconLayout: SymbolLayerSpecification['layout'] = {
  'icon-image': ['get', 'iconName'],

  'icon-size': 0.28,

  'icon-allow-overlap': true,

  'icon-ignore-placement': true,

  'icon-anchor': 'center',
};

export const tomTomLinePaint: LineLayerSpecification['paint'] = {
  'line-color': colors.traffic,

  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 4.5, 17, 6],

  'line-opacity': 0.7,

  'line-blur': 0.35,
};

export const selectedTomTomLinePaint: LineLayerSpecification['paint'] = {
  'line-color': colors.primary,

  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 10, 17, 13],

  'line-opacity': 0.28,
};

export const telegramApproximateLinePaint: LineLayerSpecification['paint'] = {
  'line-color': [
    'match',
    ['get', 'eventType'],
    'ROAD_PATROL',
    eventMarkerColors.dps,
    'ACCIDENT',
    eventMarkerColors.accident,
    'ROAD_CLOSURE',
    eventMarkerColors.roadClosure,
    'ROADWORKS',
    eventMarkerColors.roadworks,
    'TRAFFIC',
    eventMarkerColors.trafficJam,
    'ROAD_HAZARD',
    eventMarkerColors.hazard,
    eventMarkerColors.roadState,
  ],
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 3.4, 17, 4.8],
  'line-opacity': 0.5,
  'line-dasharray': [1.8, 1.6],
};

export const telegramApproximateOuterLinePaint: LineLayerSpecification['paint'] =
  {
    'line-color': [
    'match',
    ['get', 'eventType'],
    'ROAD_PATROL',
      eventMarkerColors.dps,
      'ACCIDENT',
      eventMarkerColors.accident,
      'ROAD_CLOSURE',
      eventMarkerColors.roadClosure,
      'ROADWORKS',
      eventMarkerColors.roadworks,
      'TRAFFIC',
      eventMarkerColors.trafficJam,
      'ROAD_HAZARD',
      eventMarkerColors.hazard,
      eventMarkerColors.roadState,
    ],
    'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 7, 17, 9],
    'line-opacity': 0.065,
    'line-blur': 1.2,
  };

export const selectedTelegramApproximateLinePaint: LineLayerSpecification['paint'] =
  {
    'line-color': colors.textPrimary,
    'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 9, 17, 11],
    'line-opacity': 0.17,
  };
