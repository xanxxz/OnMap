"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoadEventsModule = void 0;
const common_1 = require("@nestjs/common");
const road_events_controller_1 = require("./road-events.controller");
const road_events_service_1 = require("./road-events.service");
const road_events_gateway_1 = require("./realtime/road-events.gateway");
let RoadEventsModule = class RoadEventsModule {
};
exports.RoadEventsModule = RoadEventsModule;
exports.RoadEventsModule = RoadEventsModule = __decorate([
    (0, common_1.Module)({
        controllers: [
            road_events_controller_1.RoadEventsController,
        ],
        providers: [
            road_events_service_1.RoadEventsService,
            road_events_gateway_1.RoadEventsGateway,
        ],
        exports: [
            road_events_service_1.RoadEventsService,
            road_events_gateway_1.RoadEventsGateway,
        ],
    })
], RoadEventsModule);
//# sourceMappingURL=road-events.module.js.map