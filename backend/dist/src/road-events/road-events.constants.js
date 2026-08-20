"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROAD_EVENT_TTL_MINUTES = exports.ROAD_EVENT_TITLE_BY_TYPE = exports.ROAD_EVENT_FEEDBACK_ACTIONS = exports.ROAD_EVENT_STATUSES = exports.ROAD_EVENT_TYPES = void 0;
exports.ROAD_EVENT_TYPES = [
    'ACCIDENT',
    'ROAD_CLOSURE',
    'ROADWORKS',
    'TRAFFIC',
    'ROAD_HAZARD',
    'TRAFFIC_LIGHT',
    'ROAD_SERVICE',
    'ROAD_PATROL',
    'OTHER',
];
exports.ROAD_EVENT_STATUSES = [
    'ACTIVE',
    'UNCONFIRMED',
    'STALE',
    'RESOLVED',
];
exports.ROAD_EVENT_FEEDBACK_ACTIONS = [
    'CONFIRM',
    'REJECT',
];
exports.ROAD_EVENT_TITLE_BY_TYPE = {
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
exports.ROAD_EVENT_TTL_MINUTES = {
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
//# sourceMappingURL=road-events.constants.js.map