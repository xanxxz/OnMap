import {getRoadEventFilterType} from './roadEventMeta';

import {
  TomTomRoadEvent,
  TelegramRoadEvent,
  UserRoadEvent,
} from './roadEvent';

const userAccident: UserRoadEvent = {
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

const externalEvent = (
  type: TomTomRoadEvent['type'],
): TomTomRoadEvent => ({
  id: `tomtom:${type}`,
  source: 'TOMTOM',
  cityId: 'balakovo',
  type,
  title: type,
  geometry: {
    type: 'Point',
    coordinates: [47.8, 52.02],
  },
  fetchedAt: '2026-08-25T08:20:00.000Z',
});

const telegramRoadworks: TelegramRoadEvent = {
  id: 'telegram-1',
  source: 'TELEGRAM',
  locationPrecision: 'LANDMARK',
  cityId: 'balakovo',
  type: 'ROADWORKS',
  status: 'ACTIVE',
  title: 'Дорожные работы',
  coordinate: [47.8, 52.02],
  geometry: {
    type: 'Point',
    coordinates: [47.8, 52.02],
  },
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2099-08-25T10:00:00.000Z',
};

describe('RoadEvent filter categories', () => {
  it('keeps USER filtering unchanged', () => {
    expect(getRoadEventFilterType(userAccident)).toBe('ACCIDENT');
  });

  it('maps TomTom traffic and hazard categories to existing filter chips', () => {
    expect(getRoadEventFilterType(externalEvent('TRAFFIC_JAM'))).toBe(
      'TRAFFIC',
    );
    expect(getRoadEventFilterType(externalEvent('HAZARD'))).toBe(
      'ROAD_HAZARD',
    );
  });

  it('uses the native event type for TELEGRAM filters', () => {
    expect(getRoadEventFilterType(telegramRoadworks)).toBe('ROADWORKS');
  });
});
