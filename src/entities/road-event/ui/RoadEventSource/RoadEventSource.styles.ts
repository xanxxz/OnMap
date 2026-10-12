import type {
  CircleLayerSpecification,
  LineLayerSpecification,
} from '@maplibre/maplibre-react-native';

import {colors} from '../../../../shared/theme';
import {eventMarkerColors} from '../EventMarker/eventMarkerVisualConfig';

export const approximateAreaHaloPaint: CircleLayerSpecification['paint'] = {
  'circle-radius': [
    'interpolate', ['linear'], ['zoom'], 10, 18, 13, 30, 16, 44,
  ],
  'circle-color': colors.primary,
  'circle-opacity': 0.045,
  'circle-stroke-width': 1,
  'circle-stroke-color': colors.primary,
  'circle-stroke-opacity': 0.12,
  'circle-blur': 0.55,
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

const approximateEventColor: NonNullable<
  LineLayerSpecification['paint']
>['line-color'] = [
  'match', ['get', 'eventType'],
  'ROAD_PATROL', eventMarkerColors.dps,
  'ACCIDENT', eventMarkerColors.accident,
  'ROAD_CLOSURE', eventMarkerColors.roadClosure,
  'ROADWORKS', eventMarkerColors.roadworks,
  'TRAFFIC', eventMarkerColors.trafficJam,
  'ROAD_HAZARD', eventMarkerColors.hazard,
  eventMarkerColors.roadState,
];

export const telegramApproximateLinePaint: LineLayerSpecification['paint'] = {
  'line-color': approximateEventColor,
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 3.4, 17, 4.8],
  'line-opacity': 0.5,
  'line-dasharray': [1.8, 1.6],
};

export const telegramApproximateOuterLinePaint: LineLayerSpecification['paint'] = {
  'line-color': approximateEventColor,
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 7, 17, 9],
  'line-opacity': 0.065,
  'line-blur': 1.2,
};

export const selectedTelegramApproximateLinePaint: LineLayerSpecification['paint'] = {
  'line-color': colors.textPrimary,
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 9, 17, 11],
  'line-opacity': 0.17,
};
