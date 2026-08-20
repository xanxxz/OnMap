import { CreateRoadEventDto } from './dto/create-road-event.dto';
import { FeedbackRoadEventDto } from './dto/feedback-road-event.dto';
import { ListRoadEventsQueryDto } from './dto/list-road-events-query.dto';
import { RoadEventsService } from './road-events.service';
export declare class RoadEventsController {
    private readonly roadEventsService;
    constructor(roadEventsService: RoadEventsService);
    list(query: ListRoadEventsQueryDto): Promise<import("./road-events.types").RoadEventResponse[]>;
    create(dto: CreateRoadEventDto): Promise<import("./road-events.types").RoadEventResponse>;
    feedback(id: string, dto: FeedbackRoadEventDto): Promise<import("./road-events.types").RoadEventResponse>;
}
