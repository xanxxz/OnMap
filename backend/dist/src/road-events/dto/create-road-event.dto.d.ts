import * as roadEventsConstants from '../road-events.constants';
export declare class CreateRoadEventDto {
    cityId: string;
    type: roadEventsConstants.RoadEventType;
    title?: string;
    description?: string;
    coordinate: [
        number,
        number
    ];
    installationId: string;
}
