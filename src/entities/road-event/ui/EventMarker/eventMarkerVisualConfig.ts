import {RoadEventReadType} from '../../model/roadEvent';

export type EventMarkerShape =
  | 'SHIELD'
  | 'DIAMOND'
  | 'WORK_SIGN'
  | 'BARRIER'
  | 'SOFT_TRIANGLE'
  | 'STACKED_ROAD'
  | 'ROAD_TILE'
  | 'TRAFFIC_LIGHT'
  | 'SERVICE_HEX'
  | 'PEBBLE';

export type EventMarkerGlyph =
  | 'BEACON'
  | 'IMPACT'
  | 'WORKS'
  | 'BLOCKED'
  | 'WARNING'
  | 'TRAFFIC'
  | 'ROAD'
  | 'SIGNAL'
  | 'SERVICE'
  | 'MORE';

export interface EventMarkerVisualConfig {
  shape: EventMarkerShape;
  color: string;
  glyph: EventMarkerGlyph;
  accessibilityName: string;
}

export const eventMarkerColors = {
  dps: '#376F8A',
  accident: '#C85F58',
  roadworks: '#BE8139',
  roadClosure: '#A55443',
  hazard: '#C59437',
  trafficJam: '#B96F45',
  roadState: '#4E786A',
  trafficLight: '#3F806D',
  roadService: '#4E7790',
  other: '#64726C',
} as const;

export const EVENT_MARKER_VISUAL_CONFIG: Record<
  RoadEventReadType,
  EventMarkerVisualConfig
> = {
  ROAD_PATROL: {
    shape: 'SHIELD',
    color: eventMarkerColors.dps,
    glyph: 'BEACON',
    accessibilityName: 'ДПС',
  },
  ACCIDENT: {
    shape: 'DIAMOND',
    color: eventMarkerColors.accident,
    glyph: 'IMPACT',
    accessibilityName: 'ДТП',
  },
  ROADWORKS: {
    shape: 'WORK_SIGN',
    color: eventMarkerColors.roadworks,
    glyph: 'WORKS',
    accessibilityName: 'Дорожные работы',
  },
  ROAD_CLOSURE: {
    shape: 'BARRIER',
    color: eventMarkerColors.roadClosure,
    glyph: 'BLOCKED',
    accessibilityName: 'Перекрытие дороги',
  },
  ROAD_HAZARD: {
    shape: 'SOFT_TRIANGLE',
    color: eventMarkerColors.hazard,
    glyph: 'WARNING',
    accessibilityName: 'Опасность на дороге',
  },
  HAZARD: {
    shape: 'SOFT_TRIANGLE',
    color: eventMarkerColors.hazard,
    glyph: 'WARNING',
    accessibilityName: 'Опасность на дороге',
  },
  TRAFFIC: {
    shape: 'STACKED_ROAD',
    color: eventMarkerColors.trafficJam,
    glyph: 'TRAFFIC',
    accessibilityName: 'Пробка',
  },
  TRAFFIC_JAM: {
    shape: 'STACKED_ROAD',
    color: eventMarkerColors.trafficJam,
    glyph: 'TRAFFIC',
    accessibilityName: 'Пробка',
  },
  TRAFFIC_LIGHT: {
    shape: 'TRAFFIC_LIGHT',
    color: eventMarkerColors.trafficLight,
    glyph: 'SIGNAL',
    accessibilityName: 'Светофор',
  },
  ROAD_SERVICE: {
    shape: 'SERVICE_HEX',
    color: eventMarkerColors.roadService,
    glyph: 'SERVICE',
    accessibilityName: 'Дорожная служба',
  },
  OTHER: {
    shape: 'PEBBLE',
    color: eventMarkerColors.other,
    glyph: 'MORE',
    accessibilityName: 'Дорожное событие',
  },
};

export const getEventMarkerVisualConfig = (
  type: RoadEventReadType,
): EventMarkerVisualConfig => EVENT_MARKER_VISUAL_CONFIG[type];
