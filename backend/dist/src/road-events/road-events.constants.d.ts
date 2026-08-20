export declare const ROAD_EVENT_TYPES: readonly ["ACCIDENT", "ROAD_CLOSURE", "ROADWORKS", "TRAFFIC", "ROAD_HAZARD", "TRAFFIC_LIGHT", "ROAD_SERVICE", "ROAD_PATROL", "OTHER"];
export type RoadEventType = (typeof ROAD_EVENT_TYPES)[number];
export declare const ROAD_EVENT_STATUSES: readonly ["ACTIVE", "UNCONFIRMED", "STALE", "RESOLVED"];
export type RoadEventStatus = (typeof ROAD_EVENT_STATUSES)[number];
export declare const ROAD_EVENT_FEEDBACK_ACTIONS: readonly ["CONFIRM", "REJECT"];
export type RoadEventFeedbackAction = (typeof ROAD_EVENT_FEEDBACK_ACTIONS)[number];
export declare const ROAD_EVENT_TITLE_BY_TYPE: Record<RoadEventType, string>;
export declare const ROAD_EVENT_TTL_MINUTES: Record<RoadEventType, number>;
