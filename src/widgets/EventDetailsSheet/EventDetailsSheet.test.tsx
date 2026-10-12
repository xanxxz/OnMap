import React from 'react';

import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

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
  shouldCaptureEventSheetDismiss,
  shouldDismissEventSheet,
} from './EventDetailsSheet';
import { styles as sheetStyles } from './EventDetailsSheet.styles';

jest.mock('@sbaiahmed1/react-native-blur', () => ({
  BlurView: require('react-native').View,
}));

jest.mock('../../features/road-event-feedback/model/useRoadEventReport', () => ({
  useRoadEventReport: () => ({
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
  }),
}));

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');
  const shared = (initial: number) => ({
    get: () => initial,
    set: jest.fn(),
  });

  return {
    __esModule: true,
    default: { View: ReactNative.View },
    ReduceMotion: { System: 'system' },
    useSharedValue: shared,
    useReducedMotion: () => false,
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

  it('extends the selected-event sheet to screen edges and keeps content above the safe area', () => {
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={event}
          bottomInset={34}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({ testID: 'user-event-details' }),
    ).toBeDefined();
    const style = StyleSheet.flatten(sheetStyles.container);

    expect(style.left).toBe(0);
    expect(style.right).toBe(0);
    expect(style.bottom).toBe(0);
    expect(style.borderTopLeftRadius).toBeGreaterThan(0);
    expect(style.borderTopRightRadius).toBeGreaterThan(0);
    expect(style.paddingBottom).toBe(20);
  });

  it('closes on the backdrop, but not when pressing an action inside the sheet', () => {
    const onClose = jest.fn();
    const onFeedback = jest.fn();
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
      start: callback => callback?.({ finished: true }),
    } as Animated.CompositeAnimation);
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={event}
          isSubmitting={false}
          onFeedback={onFeedback}
          onClose={onClose}
        />,
      );
    });

    act(() => {
      renderer.root
        .findByProps({
          accessibilityLabel: 'Подтвердить актуальность события',
        })
        .props.onPress();
    });
    expect(onFeedback).toHaveBeenCalledWith('CONFIRM');
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      renderer.root
        .findByProps({ testID: 'event-details-backdrop' })
        .props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(timing).toHaveBeenCalledTimes(1);
    timing.mockRestore();
  });

  it('uses the same exit animation for the close button', () => {
    const onClose = jest.fn();
    let complete: ((result: { finished: boolean }) => void) | undefined;
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
      start: callback => {
        complete = callback;
      },
    } as Animated.CompositeAnimation);
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={event}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={onClose}
        />,
      );
    });
    act(() =>
      renderer.root
        .findByProps({ accessibilityLabel: 'Закрыть' })
        .props.onPress(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(timing).toHaveBeenCalledTimes(1);
    act(() => complete?.({ finished: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    timing.mockRestore();
  });

  it('renders the server percentage instead of deriving one from legacy confidence', () => {
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={{ ...event, confidence: 0.67, confidencePercent: 40 }}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    const texts = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(texts).toContain('40%');
    expect(texts).not.toContain('67%');
  });

  it('only captures a downward dismiss gesture when scrolled to the top', () => {
    expect(shouldCaptureEventSheetDismiss(0, 15, 0)).toBe(true);
    expect(shouldCaptureEventSheetDismiss(20, 50, 0)).toBe(false);
    expect(shouldCaptureEventSheetDismiss(0, -50, 0)).toBe(false);
    expect(shouldCaptureEventSheetDismiss(0, 15, 30)).toBe(false);
    expect(shouldDismissEventSheet(50, 0.2)).toBe(false);
    expect(shouldDismissEventSheet(110, 0.2)).toBe(true);
    expect(shouldDismissEventSheet(65, 1.3)).toBe(true);
  });

  it('animates a sufficient downward swipe before closing the selected event', () => {
    const onClose = jest.fn();
    let handlers: Parameters<typeof PanResponder.create>[0] | null = null;
    const createPan = jest
      .spyOn(PanResponder, 'create')
      .mockImplementation(config => {
        handlers = config;
        return { panHandlers: {} } as ReturnType<typeof PanResponder.create>;
      });
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
      start: callback => callback?.({ finished: true }),
    } as Animated.CompositeAnimation);

    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={event}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={onClose}
        />,
      );
    });

    expect(handlers).not.toBeNull();
    const activeHandlers = handlers as unknown as Parameters<
      typeof PanResponder.create
    >[0];
    expect(
      activeHandlers.onMoveShouldSetPanResponderCapture?.(
        {} as never,
        { dy: 15, dx: 0 } as never,
      ),
    ).toBe(true);
    const scroll = renderer.root.findByType(ScrollView);
    act(() => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 42 } } });
    });
    expect(
      activeHandlers.onMoveShouldSetPanResponderCapture?.(
        {} as never,
        { dy: 120, dx: 0 } as never,
      ),
    ).toBe(false);
    act(() => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    act(() => {
      activeHandlers.onPanResponderRelease?.(
        {} as never,
        { dy: 110, vy: 0.2 } as never,
      );
    });
    expect(timing).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    timing.mockRestore();
    createPan.mockRestore();
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
    expect(renderer.root.findByProps({
      accessibilityLabel: 'Пожаловаться на событие',
    })).toBeDefined();
  });

  it('does not offer a report action for a resolved event', () => {
    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={{...event, status: 'RESOLVED'}}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(renderer.root.findAllByProps({
      accessibilityLabel: 'Пожаловаться на событие',
    })).toHaveLength(0);
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
      coordinate: [47.81, 52.01],
      geometry: {type: 'Point', coordinates: [47.81, 52.01]},
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
        'Примерное место',
        'Точное место не указано',
        'Исходное сообщение',
        'Комарова притерлись',
      ]),
    );
  });

  it('shows useful Telegram context with server-redacted contact data', () => {
    const safeEvent: TelegramRoadEvent = {
      ...telegramEvent,
      sourceText: 'ДПС на Комарова, звоните [телефон скрыт]',
    };

    act(() => {
      renderer = create(
        <EventDetailsSheet
          event={safeEvent}
          isSubmitting={false}
          onFeedback={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root
        .findAllByType(Text)
        .some(node => node.props.children === safeEvent.sourceText),
    ).toBe(true);
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
