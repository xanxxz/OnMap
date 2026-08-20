import {ROAD_EVENT_ICON_NAME_BY_TYPE} from './roadEventIcons';

import {
  RoadEvent,
  RoadEventStatus,
  RoadEventType,
} from '../model/roadEvent';

export interface RoadEventGeoJsonProperties {
  eventId: string;

  eventType: RoadEventType;

  status: RoadEventStatus;

  iconName: string;

  confidence: number;

  confirmationCount: number;
}

export interface RoadEventGeoJsonFeature {
  type: 'Feature';

  id: string;

  geometry: {
    type: 'Point';

    coordinates: [
      number,
      number,
    ];
  };

  properties:
    RoadEventGeoJsonProperties;
}

export interface RoadEventGeoJsonCollection {
  type: 'FeatureCollection';

  features:
    RoadEventGeoJsonFeature[];
}

export const roadEventsToGeoJson = (
  events: RoadEvent[],
): RoadEventGeoJsonCollection => {
  return {
    type: 'FeatureCollection',

    features: events.map(event => ({
      type: 'Feature',

      id: event.id,

      geometry: {
        type: 'Point',

        coordinates:
          event.coordinate,
      },

      properties: {
        eventId: event.id,

        eventType: event.type,

        status: event.status,

        iconName:
          ROAD_EVENT_ICON_NAME_BY_TYPE[
            event.type
          ],

        confidence:
          event.confidence,

        confirmationCount:
          event.confirmationCount,
      },
    })),
  };
};