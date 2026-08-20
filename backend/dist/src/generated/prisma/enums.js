"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoadEventFeedbackAction = exports.RoadEventStatus = exports.RoadEventType = void 0;
exports.RoadEventType = {
    ACCIDENT: 'ACCIDENT',
    ROAD_CLOSURE: 'ROAD_CLOSURE',
    ROADWORKS: 'ROADWORKS',
    TRAFFIC: 'TRAFFIC',
    ROAD_HAZARD: 'ROAD_HAZARD',
    TRAFFIC_LIGHT: 'TRAFFIC_LIGHT',
    ROAD_SERVICE: 'ROAD_SERVICE',
    ROAD_PATROL: 'ROAD_PATROL',
    OTHER: 'OTHER'
};
exports.RoadEventStatus = {
    ACTIVE: 'ACTIVE',
    UNCONFIRMED: 'UNCONFIRMED',
    STALE: 'STALE',
    RESOLVED: 'RESOLVED'
};
exports.RoadEventFeedbackAction = {
    CONFIRM: 'CONFIRM',
    REJECT: 'REJECT'
};
//# sourceMappingURL=enums.js.map