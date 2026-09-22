import { QueryClient } from '@tanstack/react-query';

import { TelegramRoadEvent, UserRoadEvent } from '../model/roadEvent';

import {
  removeRealtimeRoadEvent,
  upsertRealtimeRoadEvent,
} from './roadEventRealtimeCache';

const bounds: [number, number, number, number] = [47.64, 51.9, 48.04, 52.16];

const telegramEvent: TelegramRoadEvent = {
  id: 'telegram:event-1',
  source: 'TELEGRAM',
  locationPrecision: 'LANDMARK',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП',
  coordinate: [47.8, 52.02],
  geometry: {
    type: 'Point',
    coordinates: [47.8, 52.02],
  },
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2099-08-25T10:00:00.000Z',
};

const userEvent: UserRoadEvent = {
  id: 'user-1',
  source: 'USER',
  cityId: 'balakovo',
  type: 'ROADWORKS',
  status: 'ACTIVE',
  title: 'Дорожные работы',
  coordinate: [47.81, 52.03],
  geometry: {
    type: 'Point',
    coordinates: [47.81, 52.03],
  },
  confirmationCount: 2,
  rejectionCount: 0,
  confidence: 0.75,
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2099-08-25T10:00:00.000Z',
  viewerRelation: 'CONFIRM',
};

describe('TELEGRAM realtime cache', () => {
  let queryClient: QueryClient;
  const queryKey = ['road-events', 'viewport', 'balakovo', ...bounds] as const;

  beforeEach(() => {
    queryClient = new QueryClient();
    queryClient.setQueryData(queryKey, [userEvent]);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('adds a created TELEGRAM event to the visible viewport', () => {
    upsertRealtimeRoadEvent(queryClient, telegramEvent);

    expect(queryClient.getQueryData(queryKey)).toEqual([
      telegramEvent,
      userEvent,
    ]);
  });

  it('adds a crossing TELEGRAM MultiLineString even when its vertices are outside', () => {
    const crossingEvent: TelegramRoadEvent = {
      ...telegramEvent,
      id: 'telegram:crossing-street',
      locationPrecision: 'STREET',
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [47.6, 52.02],
            [48.08, 52.02],
          ],
        ],
      },
    };

    upsertRealtimeRoadEvent(queryClient, crossingEvent);

    expect(queryClient.getQueryData(queryKey)).toEqual([
      crossingEvent,
      userEvent,
    ]);
  });

  it('updates an existing TELEGRAM event by id', () => {
    queryClient.setQueryData(queryKey, [telegramEvent, userEvent]);

    upsertRealtimeRoadEvent(queryClient, {
      ...telegramEvent,
      status: 'STALE',
      title: 'ДТП — уточнение',
    });

    expect(
      queryClient.getQueryData<TelegramRoadEvent[]>(queryKey)?.[0],
    ).toMatchObject({
      id: telegramEvent.id,
      status: 'STALE',
      title: 'ДТП — уточнение',
    });
  });

  it('removes a resolved TELEGRAM event by id', () => {
    queryClient.setQueryData(queryKey, [telegramEvent, userEvent]);

    removeRealtimeRoadEvent(queryClient, telegramEvent.id);

    expect(queryClient.getQueryData(queryKey)).toEqual([userEvent]);
  });

  it('does not duplicate an event received again after reconnect', () => {
    queryClient.setQueryData(queryKey, [telegramEvent, userEvent]);

    upsertRealtimeRoadEvent(queryClient, telegramEvent);

    const events =
      queryClient.getQueryData<Array<{ id: string }>>(queryKey) ?? [];
    expect(events.filter(event => event.id === telegramEvent.id)).toHaveLength(
      1,
    );
  });

  it('keeps existing USER viewer relation on USER updates', () => {
    upsertRealtimeRoadEvent(queryClient, {
      ...userEvent,
      title: 'Обновлённые работы',
      viewerRelation: undefined,
    });

    expect(
      queryClient.getQueryData<UserRoadEvent[]>(queryKey)?.[0],
    ).toMatchObject({
      title: 'Обновлённые работы',
      viewerRelation: 'CONFIRM',
    });
  });

  it('does not mix realtime events between city-scoped caches', () => {
    const otherCityKey = [
      'road-events',
      'viewport',
      'test-city',
      ...bounds,
    ] as const;
    const otherCityEvent = {
      ...telegramEvent,
      id: 'telegram:other-city',
      cityId: 'test-city',
    };
    queryClient.setQueryData(otherCityKey, [otherCityEvent]);

    upsertRealtimeRoadEvent(queryClient, telegramEvent);

    expect(queryClient.getQueryData(otherCityKey)).toEqual([otherCityEvent]);
  });
});
