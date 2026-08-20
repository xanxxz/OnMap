export const ROAD_EVENT_TYPES = [
  'ACCIDENT',
  'ROAD_CLOSURE',
  'ROADWORKS',
  'TRAFFIC',
  'ROAD_HAZARD',
  'TRAFFIC_LIGHT',
  'ROAD_SERVICE',
  'ROAD_PATROL',
  'OTHER',
] as const;

export type RoadEventType =
  (typeof ROAD_EVENT_TYPES)[number];

export const ROAD_EVENT_STATUSES = [
  'ACTIVE',
  'UNCONFIRMED',
  'STALE',
  'RESOLVED',
] as const;

export type RoadEventStatus =
  (typeof ROAD_EVENT_STATUSES)[number];

export const ROAD_EVENT_FEEDBACK_ACTIONS = [
  'CONFIRM',
  'REJECT',
] as const;

export type RoadEventFeedbackAction =
  (typeof ROAD_EVENT_FEEDBACK_ACTIONS)[number];

export const ROAD_EVENT_TITLE_BY_TYPE: Record<
  RoadEventType,
  string
> = {
  ACCIDENT: 'ДТП',
  ROAD_CLOSURE: 'Перекрытие',
  ROADWORKS: 'Дорожные работы',
  TRAFFIC: 'Пробка',
  ROAD_HAZARD: 'Опасность',
  TRAFFIC_LIGHT: 'Светофор',
  ROAD_SERVICE: 'Дорожная служба',
  ROAD_PATROL: 'ДПС',
  OTHER: 'Дорожное событие',
};

export const ROAD_EVENT_TTL_MINUTES: Record<
  RoadEventType,
  number
> = {
  ACCIDENT: 120,
  ROAD_CLOSURE: 360,
  ROADWORKS: 720,
  TRAFFIC: 45,
  ROAD_HAZARD: 180,
  TRAFFIC_LIGHT: 120,
  ROAD_SERVICE: 60,
  ROAD_PATROL: 45,
  OTHER: 90,
};