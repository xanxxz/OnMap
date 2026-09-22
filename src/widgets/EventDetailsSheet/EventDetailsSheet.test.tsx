import React from 'react';

import { Text } from 'react-native';

import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  RoadEvent,
  TelegramRoadEvent,
  TomTomRoadEvent,
} from '../../entities/road-event/model/roadEvent';

import {
  EventDetailsSheet,
  formatTomTomDelay,
  formatTomTomLength,
} from './EventDetailsSheet';

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');
  const shared = (initial: number) => ({
    get: () => initial,
    set: jest.fn(),
  });

  return {
    __esModule: true,
    default: {View: ReactNative.View},
    ReduceMotion: {System: 'system'},
    useSharedValue: shared,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withSpring: (value: number) => value,
  };
});

const event: RoadEvent = {
  id: 'event-1',
  source: 'USER',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП',
  coordinate: [47.8007, 52.0278],
  geometry: {
    type: 'Point',
    coordinates: [47.8007, 52.0278],
  },
  confirmationCount: 2,
  rejectionCount: 0,
  confidence: 0.75,
  createdAt: '2026-08-20T12:00:00.000Z',
  expiresAt: '2026-08-20T14:00:00.000Z',
};

const tomTomEvent: TomTomRoadEvent = {
  id: 'tomtom:line-1',
  source: 'TOMTOM',
  cityId: 'balakovo',
  type: 'TRAFFIC_JAM',
  title: 'Затруднение движения',
  description: 'Замедленное движение',
  geometry: {
    type: 'LineString',
    coordinates: [
      [47.79, 52.02],
      [47.81, 52.03],
    ],
  },
  from: 'ул. Комарова',
  to: 'ул. Менделеева',
  delaySeconds: 132,
  lengthMeters: 1_420,
  startTime: '2026-08-25T08:00:00.000Z',
  endTime: '2026-08-25T09:00:00.000Z',
  fetchedAt: '2026-08-25T08:20:00.000Z',
};

const telegramEvent: TelegramRoadEvent = {
  id: 'telegram:event-1',
  source: 'TELEGRAM',
  locationPrecision: 'LANDMARK',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП на Комарова',
  description: 'Возле перекрёстка',
  coordinate: [47.801, 52.021],
  geometry: {
    type: 'Point',
    coordinates: [47.801, 52.021],
  },
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2099-08-25T10:00:00.000Z',
};

describe('EventDetails feedback pending guard', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it('disables both feedback actions while one request is pending', () => {
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={event}
          isSubmitting
          pendingAction="CONFIRM"
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    const confirm = renderer.root.findByProps({
      accessibilityLabel: 'Подтвердить актуальность события',
    });
    const reject = renderer.root.findByProps({
      accessibilityLabel: 'Сообщить, что события уже нет',
    });

    expect(confirm.props.disabled).toBe(true);
    expect(reject.props.disabled).toBe(true);
  });

  it('keeps voting controls for a USER event', () => {
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={event}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        accessibilityLabel: 'Подтвердить актуальность события',
      }),
    ).toBeDefined();
  });

  it('opens TOMTOM details without any voting controls', () => {
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={tomTomEvent}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'tomtom-event-details',
      }),
    ).toBeDefined();
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'Подтвердить актуальность события',
      }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'Сообщить, что события уже нет',
      }),
    ).toHaveLength(0);
  });

  it('renders TOMTOM details when all optional fields are absent', () => {
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={{
            id: 'tomtom:minimal',
            source: 'TOMTOM',
            cityId: 'balakovo',
            type: 'OTHER',
            title: 'Дорожное событие',
            geometry: {
              type: 'Point',
              coordinates: [47.8, 52.02],
            },
            fetchedAt: '2026-08-25T08:20:00.000Z',
          }}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'tomtom-event-details',
      }),
    ).toBeDefined();
  });

  it('shows a TELEGRAM source badge and event details', () => {
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={telegramEvent}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'telegram-event-details' }),
    ).toBeDefined();
    expect(
      renderer.root.findByProps({ testID: 'telegram-source-badge' }),
    ).toBeDefined();
    expect(
      renderer.root
        .findAllByType(Text)
        .some(node => node.props.children === 'Telegram'),
    ).toBe(true);
  });

  it('shows source text and an approximate STREET warning', () => {
    const approximateEvent: TelegramRoadEvent = {
      ...telegramEvent,
      locationPrecision: 'STREET',
      locationLabel: 'Улица Комарова',
      sourceText: 'Комарова притерлись',
      geometry: {
        type: 'LineString',
        coordinates: [
          [47.79, 52.01],
          [47.8, 52.02],
        ],
      },
    };

    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={approximateEvent}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    const text = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children);

    expect(text).toEqual(
      expect.arrayContaining([
        'Улица Комарова',
        'Примерно на этой улице',
        'Точное место не указано',
        'Исходное сообщение',
        'Комарова притерлись',
      ]),
    );
  });

  it('does not render USER feedback or confidence for TELEGRAM', () => {
    const onFeedback = jest.fn();

    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={telegramEvent}
          isSubmitting={false}
          onFeedback={onFeedback}
          onClose={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'Подтвердить актуальность события',
      }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'Сообщить, что события уже нет',
      }),
    ).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType(Text)
        .some(node => node.props.children === 'доверие'),
    ).toBe(false);
    expect(onFeedback).not.toHaveBeenCalled();
  });

  it('allows feedback for Telegram DPS and explains a disputed marker', () => {
    const dpsEvent: TelegramRoadEvent = {
      ...telegramEvent,
      id: 'telegram:dps-1',
      type: 'ROAD_PATROL',
      title: 'ДПС',
      status: 'STALE',
      confirmationCount: 2,
      rejectionCount: 7,
      confidence: 0.3,
    };

    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={dpsEvent}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        accessibilityLabel: 'Подтвердить актуальность события',
      }),
    ).toBeDefined();
    expect(
      renderer.root
        .findAllByType(Text)
        .some(node => node.props.children === 'Актуальность под сомнением'),
    ).toBe(true);
  });
});

describe('TomTom presentation formatting', () => {
  it('formats delay in rounded minutes', () => {
    expect(formatTomTomDelay(132)).toBe('2 мин');
  });

  it('formats road length in metres and kilometres', () => {
    expect(formatTomTomLength(765.682)).toBe('766 м');
    expect(formatTomTomLength(1_420)).toBe('1,4 км');
  });
});
