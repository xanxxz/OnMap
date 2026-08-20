export declare const RoadEventType: {
    readonly ACCIDENT: "ACCIDENT";
    readonly ROAD_CLOSURE: "ROAD_CLOSURE";
    readonly ROADWORKS: "ROADWORKS";
    readonly TRAFFIC: "TRAFFIC";
    readonly ROAD_HAZARD: "ROAD_HAZARD";
    readonly TRAFFIC_LIGHT: "TRAFFIC_LIGHT";
    readonly ROAD_SERVICE: "ROAD_SERVICE";
    readonly ROAD_PATROL: "ROAD_PATROL";
    readonly OTHER: "OTHER";
};
export type RoadEventType = (typeof RoadEventType)[keyof typeof RoadEventType];
export declare const RoadEventStatus: {
    readonly ACTIVE: "ACTIVE";
    readonly UNCONFIRMED: "UNCONFIRMED";
    readonly STALE: "STALE";
    readonly RESOLVED: "RESOLVED";
};
export type RoadEventStatus = (typeof RoadEventStatus)[keyof typeof RoadEventStatus];
export declare const RoadEventFeedbackAction: {
    readonly CONFIRM: "CONFIRM";
    readonly REJECT: "REJECT";
};
export type RoadEventFeedbackAction = (typeof RoadEventFeedbackAction)[keyof typeof RoadEventFeedbackAction];
