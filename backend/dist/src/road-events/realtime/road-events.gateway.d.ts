import { Socket } from 'socket.io';
import { RoadEventRealtimePayload, RoadEventResolvedPayload } from '../road-events.types';
interface RoadEventsSubscriptionPayload {
    cityId: string;
}
export declare class RoadEventsGateway {
    private server;
    subscribe(client: Socket, payload: RoadEventsSubscriptionPayload): Promise<{
        success: boolean;
        cityId?: undefined;
    } | {
        success: boolean;
        cityId: string;
    }>;
    unsubscribe(client: Socket, payload: RoadEventsSubscriptionPayload): Promise<{
        success: boolean;
        cityId?: undefined;
    } | {
        success: boolean;
        cityId: string;
    }>;
    broadcastCreated(event: RoadEventRealtimePayload): void;
    broadcastUpdated(event: RoadEventRealtimePayload): void;
    broadcastResolved(payload: RoadEventResolvedPayload): void;
}
export {};
