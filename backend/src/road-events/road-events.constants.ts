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

export type RoadEventType = (typeof ROAD_EVENT_TYPES)[number];

export const ROAD_EVENT_STATUSES = [
  'ACTIVE',
  'UNCONFIRMED',
  'STALE',
  'RESOLVED',
] as const;

export type RoadEventStatus = (typeof ROAD_EVENT_STATUSES)[number];

export const ROAD_EVENT_FEEDBACK_ACTIONS = ['CONFIRM', 'REJECT'] as const;

export type RoadEventFeedbackAction =
  (typeof ROAD_EVENT_FEEDBACK_ACTIONS)[number];

export const ROAD_EVENT_TITLE_BY_TYPE: Record<RoadEventType, string> = {
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

export const ROAD_EVENT_TTL_MINUTES: Record<RoadEventType, number> = {
  ACCIDENT: 120,
  ROAD_CLOSURE: 360,
  ROADWORKS: 720,
  TRAFFIC: 45,
  ROAD_HAZARD: 180,
  TRAFFIC_LIGHT: 120,
  ROAD_SERVICE: 60,
  ROAD_PATROL: 20,
  OTHER: 90,
};

export const TELEGRAM_EVENT_TTL_MS: Readonly<
  Partial<Record<RoadEventType, number>>
> = {
  ACCIDENT: 3 * 60 * 60_000,
  TRAFFIC: 60 * 60_000,
  ROAD_CLOSURE: 6 * 60 * 60_000,
  ROADWORKS: 12 * 60 * 60_000,
  ROAD_HAZARD: 2 * 60 * 60_000,
  ROAD_PATROL: 20 * 60_000,
  OTHER: 2 * 60 * 60_000,
};

export const ROAD_PATROL_LIFECYCLE = {
  rollingTtlMs: 20 * 60_000,
  maxLifetimeMs: 75 * 60_000,
  staleAfterMs: 12 * 60_000,
  staleRejectionCount: 3,
  resolveRejectionCount: 10,
} as const;

export const ROAD_EVENT_LIFECYCLE_INTERVAL_MS = 60_000;

export const ROAD_EVENT_CREATE_RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 10 * 60_000,
} as const;

export const ROAD_EVENT_FEEDBACK_RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 60_000,
} as const;

export const ROAD_EVENT_RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;

export const ROAD_EVENT_DEDUPLICATION = {
  radiusMeters: 150,
  windowMs: 30 * 60_000,
  boundingBoxRadiusDegrees: 0.003,
} as const;
