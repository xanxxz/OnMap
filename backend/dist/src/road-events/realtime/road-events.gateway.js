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
exports.RoadEventsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const createCityRoom = (cityId) => {
    return `road-events:${cityId}`;
};
let RoadEventsGateway = class RoadEventsGateway {
    server;
    async subscribe(client, payload) {
        if (!payload ||
            typeof payload.cityId !==
                'string' ||
            payload.cityId.length === 0) {
            return {
                success: false,
            };
        }
        const room = createCityRoom(payload.cityId);
        await client.join(room);
        return {
            success: true,
            cityId: payload.cityId,
        };
    }
    async unsubscribe(client, payload) {
        if (!payload ||
            typeof payload.cityId !==
                'string' ||
            payload.cityId.length === 0) {
            return {
                success: false,
            };
        }
        const room = createCityRoom(payload.cityId);
        await client.leave(room);
        return {
            success: true,
            cityId: payload.cityId,
        };
    }
    broadcastCreated(event) {
        this.server
            .to(createCityRoom(event.cityId))
            .emit('road-event:created', event);
    }
    broadcastUpdated(event) {
        this.server
            .to(createCityRoom(event.cityId))
            .emit('road-event:updated', event);
    }
    broadcastResolved(payload) {
        this.server
            .to(createCityRoom(payload.cityId))
            .emit('road-event:resolved', payload);
    }
};
exports.RoadEventsGateway = RoadEventsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RoadEventsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('road-events:subscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoadEventsGateway.prototype, "subscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('road-events:unsubscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoadEventsGateway.prototype, "unsubscribe", null);
exports.RoadEventsGateway = RoadEventsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    })
], RoadEventsGateway);
//# sourceMappingURL=road-events.gateway.js.map