import { PrismaService } from '../database/prisma.service';
import { CreateRoadEventDto } from './dto/create-road-event.dto';
import { FeedbackRoadEventDto } from './dto/feedback-road-event.dto';
import { ListRoadEventsQueryDto } from './dto/list-road-events-query.dto';
import { RoadEventResponse } from './road-events.types';
import { RoadEventsGateway } from './realtime/road-events.gateway';
export declare class RoadEventsService {
    private readonly prisma;
    private readonly gateway;
    constructor(prisma: PrismaService, gateway: RoadEventsGateway);
    list(query: ListRoadEventsQueryDto): Promise<RoadEventResponse[]>;
    create(dto: CreateRoadEventDto): Promise<RoadEventResponse>;
    feedback(eventId: string, dto: FeedbackRoadEventDto): Promise<RoadEventResponse>;
    private refreshStatuses;
    private calculateConfidence;
    private deriveStatus;
    private validateCoordinate;
    private validateBounds;
    private toResponse;
    private toRealtimePayload;
}
