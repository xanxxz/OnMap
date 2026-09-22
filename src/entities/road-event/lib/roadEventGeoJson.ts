import {
  RoadEvent,
  RoadEventReadType,
  RoadEventStatus,
  PointRoadEvent,
  TelegramRoadEvent,
  TomTomRoadEvent,
  isPointRoadEvent,
} from '../model/roadEvent';

export interface RoadEventGeoJsonProperties {
  eventId: string;

  eventType: RoadEventReadType;

  source: 'USER' | 'TELEGRAM' | 'TOMTOM';

  status?: RoadEventStatus;

  confidence?: number;

  confirmationCount?: number;

  locationPrecision?: TelegramRoadEvent['locationPrecision'];
}

export interface RoadEventPointFeature {
  type: 'Feature';

  id: string;

  geometry: {
    type: 'Point';

    coordinates: [number, number];
  };

  properties: RoadEventGeoJsonProperties;
}

export interface RoadEventLineFeature {
  type: 'Feature';

  id: string;

  geometry:
    | {
        type: 'LineString';
        coordinates: Array<[number, number]>;
      }
    | {
        type: 'MultiLineString';
        coordinates: Array<Array<[number, number]>>;
      };

  properties: RoadEventGeoJsonProperties;
}

export interface RoadEventPointCollection {
  type: 'FeatureCollection';

  features: RoadEventPointFeature[];
}

export interface RoadEventLineCollection {
  type: 'FeatureCollection';

  features: RoadEventLineFeature[];
}

export const clusteredRoadEventsToGeoJson = (
  events: RoadEvent[],
): RoadEventPointCollection => {
  return {
    type: 'FeatureCollection',
    features: events
      .filter((event): event is PointRoadEvent => isPointRoadEvent(event))
      .map(event => ({
        type: 'Feature',
        id: event.id,
        geometry: event.geometry,
        properties: {
          eventId: event.id,
          eventType: event.type,
          source: event.source,
          status: event.status,
          ...(event.source === 'USER' && {
            confidence: event.confidence,
            confirmationCount: event.confirmationCount,
          }),
          ...(event.source === 'TELEGRAM' && {
            locationPrecision: event.locationPrecision,
          }),
        },
      })),
  };
};

export const tomTomPointEventsToGeoJson = (
  events: RoadEvent[],
): RoadEventPointCollection => {
  return {
    type: 'FeatureCollection',
    features: events
      .filter(
        (event): event is TomTomRoadEvent =>
          event.source === 'TOMTOM' && event.geometry.type === 'Point',
      )
      .map(event => ({
        type: 'Feature',
        id: event.id,
        geometry: event.geometry as Extract<
          TomTomRoadEvent['geometry'],
          { type: 'Point' }
        >,
        properties: {
          eventId: event.id,
          eventType: event.type,
          source: 'TOMTOM',
        },
      })),
  };
};

export const tomTomLineEventsToGeoJson = (
  events: RoadEvent[],
): RoadEventLineCollection => {
  return {
    type: 'FeatureCollection',
    features: events
      .filter(
        (event): event is TomTomRoadEvent =>
          event.source === 'TOMTOM' && event.geometry.type === 'LineString',
      )
      .map(event => ({
        type: 'Feature',
        id: event.id,
        geometry: event.geometry as Extract<
          TomTomRoadEvent['geometry'],
          { type: 'LineString' }
        >,
        properties: {
          eventId: event.id,
          eventType: event.type,
          source: 'TOMTOM',
        },
      })),
  };
};

export const telegramLineEventsToGeoJson = (
  events: RoadEvent[],
): RoadEventLineCollection => ({
  type: 'FeatureCollection',
  features: events
    .filter(
      (
        event,
      ): event is TelegramRoadEvent & {
        geometry: Exclude<TelegramRoadEvent['geometry'], { type: 'Point' }>;
      } => event.source === 'TELEGRAM' && event.geometry.type !== 'Point',
    )
    .map(event => ({
      type: 'Feature',
      id: event.id,
      geometry: event.geometry,
      properties: {
        eventId: event.id,
        eventType: event.type,
        source: 'TELEGRAM',
        status: event.status,
      },
    })),
});
