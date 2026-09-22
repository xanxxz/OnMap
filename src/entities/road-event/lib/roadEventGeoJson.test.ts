import {
  clusteredRoadEventsToGeoJson,
  telegramLineEventsToGeoJson,
  tomTomLineEventsToGeoJson,
  tomTomPointEventsToGeoJson,
} from './roadEventGeoJson';

import {
  TomTomRoadEvent,
  TelegramRoadEvent,
  UserRoadEvent,
} from '../model/roadEvent';

const userEvent: UserRoadEvent = {
  id: 'user-1',
  source: 'USER',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП',
  coordinate: [47.8, 52.02],
  geometry: {
    type: 'Point',
    coordinates: [47.8, 52.02],
  },
  confirmationCount: 2,
  rejectionCount: 0,
  confidence: 0.75,
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2026-08-25T10:00:00.000Z',
};

const tomTomPoint: TomTomRoadEvent = {
  id: 'tomtom:point-1',
  source: 'TOMTOM',
  cityId: 'balakovo',
  type: 'ROADWORKS',
  title: 'Дорожные работы',
  geometry: {
    type: 'Point',
    coordinates: [47.81, 52.03],
  },
  fetchedAt: '2026-08-25T08:20:00.000Z',
};

const telegramPoint: TelegramRoadEvent = {
  id: 'telegram-1',
  source: 'TELEGRAM',
  locationPrecision: 'LANDMARK',
  cityId: 'balakovo',
  type: 'ROADWORKS',
  status: 'ACTIVE',
  title: 'Дорожные работы',
  coordinate: [47.805, 52.025],
  geometry: {
    type: 'Point',
    coordinates: [47.805, 52.025],
  },
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2099-08-25T10:00:00.000Z',
};

const tomTomLine: TomTomRoadEvent = {
  id: 'tomtom:line-1',
  source: 'TOMTOM',
  cityId: 'balakovo',
  type: 'TRAFFIC_JAM',
  title: 'Затруднение движения',
  geometry: {
    type: 'LineString',
    coordinates: [
      [47.79, 52.02],
      [47.81, 52.03],
    ],
  },
  fetchedAt: '2026-08-25T08:20:00.000Z',
};

const telegramMultiLine: TelegramRoadEvent = {
  ...telegramPoint,
  id: 'telegram-multiline-1',
  type: 'ROAD_PATROL',
  locationPrecision: 'STREET',
  coordinate: [47.8, 52.02],
  geometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [47.79, 52.01],
        [47.8, 52.02],
      ],
      [
        [47.81, 52.03],
        [47.82, 52.04],
      ],
    ],
  },
};

describe('RoadEvent GeoJSON sources', () => {
  const events = [userEvent, telegramPoint, tomTomPoint, tomTomLine];

  it('keeps USER and TELEGRAM points in the shared cluster collection', () => {
    const collection = clusteredRoadEventsToGeoJson(events);

    expect(collection.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'user-1',
          geometry: userEvent.geometry,
          properties: expect.objectContaining({
            source: 'USER',
            confirmationCount: 2,
          }),
        }),
        expect.objectContaining({
          id: 'telegram-1',
          geometry: telegramPoint.geometry,
          properties: expect.objectContaining({
            source: 'TELEGRAM',
            iconName: 'road-event-roadworks',
            locationPrecision: 'LANDMARK',
          }),
        }),
      ]),
    );
    expect(collection.features).toHaveLength(2);
  });

  it('does not expose USER confidence properties on a TELEGRAM marker', () => {
    const [telegramFeature] = clusteredRoadEventsToGeoJson([
      telegramPoint,
    ]).features;

    expect(telegramFeature.properties).not.toHaveProperty('confidence');
    expect(telegramFeature.properties).not.toHaveProperty('confirmationCount');
  });

  it('puts TOMTOM Point incidents in the external point source', () => {
    const collection = tomTomPointEventsToGeoJson(events);

    expect(collection.features).toEqual([
      expect.objectContaining({
        id: 'tomtom:point-1',
        geometry: tomTomPoint.geometry,
        properties: expect.objectContaining({
          source: 'TOMTOM',
          iconName: 'road-event-roadworks',
        }),
      }),
    ]);
  });

  it('puts a TOMTOM traffic jam in the line source with full geometry', () => {
    const collection = tomTomLineEventsToGeoJson(events);

    expect(collection.features).toEqual([
      expect.objectContaining({
        id: 'tomtom:line-1',
        geometry: tomTomLine.geometry,
        properties: expect.objectContaining({
          eventType: 'TRAFFIC_JAM',
          source: 'TOMTOM',
        }),
      }),
    ]);
  });

  it('never includes a TOMTOM LineString in either point collection', () => {
    expect(clusteredRoadEventsToGeoJson(events).features).toHaveLength(2);
    expect(tomTomPointEventsToGeoJson(events).features).toHaveLength(1);
  });

  it('keeps all segments of one TELEGRAM MultiLineString as one logical feature', () => {
    const collection = telegramLineEventsToGeoJson([telegramMultiLine]);

    expect(collection.features).toEqual([
      expect.objectContaining({
        id: telegramMultiLine.id,
        geometry: telegramMultiLine.geometry,
        properties: expect.objectContaining({
          eventId: telegramMultiLine.id,
          eventType: 'ROAD_PATROL',
          source: 'TELEGRAM',
        }),
      }),
    ]);
  });
});
