"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoadEventsController = void 0;
const common_1 = require("@nestjs/common");
const create_road_event_dto_1 = require("./dto/create-road-event.dto");
const feedback_road_event_dto_1 = require("./dto/feedback-road-event.dto");
const list_road_events_query_dto_1 = require("./dto/list-road-events-query.dto");
const road_events_service_1 = require("./road-events.service");
let RoadEventsController = class RoadEventsController {
    roadEventsService;
    constructor(roadEventsService) {
        this.roadEventsService = roadEventsService;
    }
    list(query) {
        return this.roadEventsService.list(query);
    }
    create(dto) {
        return this.roadEventsService.create(dto);
    }
    feedback(id, dto) {
        return this.roadEventsService.feedback(id, dto);
    }
};
exports.RoadEventsController = RoadEventsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_road_events_query_dto_1.ListRoadEventsQueryDto]),
    __metadata("design:returntype", void 0)
], RoadEventsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_road_event_dto_1.CreateRoadEventDto]),
    __metadata("design:returntype", void 0)
], RoadEventsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/feedback'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, feedback_road_event_dto_1.FeedbackRoadEventDto]),
    __metadata("design:returntype", void 0)
], RoadEventsController.prototype, "feedback", null);
exports.RoadEventsController = RoadEventsController = __decorate([
    (0, common_1.Controller)('road-events'),
    __metadata("design:paramtypes", [road_events_service_1.RoadEventsService])
], RoadEventsController);
//# sourceMappingURL=road-events.controller.js.map