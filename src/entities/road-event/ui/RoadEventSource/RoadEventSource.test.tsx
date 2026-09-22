import React from 'react';

import {act, create, ReactTestRenderer} from 'react-test-renderer';

import {TelegramRoadEvent, TomTomRoadEvent, UserRoadEvent} from '../../model/roadEvent';

import {
  buildEventMarkerAccessibilityLabel,
  RoadEventSource,
} from './RoadEventSource';

jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactNative = require('react-native');

  return {
    GeoJSONSource: (props: Record<string, unknown> & {children?: React.ReactNode}) => (
      <ReactNative.View testID={props.id} sourceProps={props}>
        {props.children}
      </ReactNative.View>
    ),
    Layer: (props: Record<string, unknown>) => (
      <ReactNative.View {...props} testID={props.id} />
    ),
    Marker: (props: Record<string, unknown> & {children?: React.ReactNode}) => (
      <ReactNative.View testID={props.id} markerProps={props}>
        {props.children}
      </ReactNative.View>
    ),
  };
});

jest.mock('../EventMarker/EventMarker', () => ({
  EventMarker: (props: Record<string, unknown>) => {
    const {View} = require('react-native');
    return <View testID={`visual-${props.type}`} visualProps={props} />;
  },
}));

const userEvent: UserRoadEvent = {
  id: 'user-1',
  source: 'USER',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП',
  coordinate: [47.8, 52.02],
  geometry: {type: 'Point', coordinates: [47.8, 52.02]},
  confirmationCount: 2,
  rejectionCount: 0,
  confidence: 0.75,
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2026-08-25T10:00:00.000Z',
};

const telegramLine: TelegramRoadEvent = {
  id: 'telegram-line-1',
  source: 'TELEGRAM',
  cityId: 'balakovo',
  type: 'ROAD_PATROL',
  status: 'STALE',
  title: 'ДПС',
  coordinate: [47.8, 52.02],
  locationPrecision: 'STREET',
  locationLabel: 'Улица Комарова',
  geometry: {
    type: 'LineString',
    coordinates: [
      [47.79, 52.01],
      [47.8, 52.02],
    ],
  },
  confirmationCount: 1,
  rejectionCount: 3,
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2026-08-25T10:00:00.000Z',
};

const tomTomLine: TomTomRoadEvent = {
  id: 'tomtom-line-1',
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

describe('RoadEventSource marker system', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('renders point and approximate-line events as custom vector marker views', () => {
    act(() => {
      renderer = create(
        <RoadEventSource
          events={[userEvent, telegramLine, tomTomLine]}
          selectedEventId={userEvent.id}
          onEventPress={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({testID: 'road-event-marker-user-1'}),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({testID: 'road-event-marker-telegram-line-1'}),
    ).toBeTruthy();
    expect(
      renderer.root.findAllByProps({testID: 'road-event-marker-tomtom-line-1'}),
    ).toHaveLength(0);

    expect(
      renderer.root.findByProps({testID: 'visual-ACCIDENT'}).props.visualProps
        .selected,
    ).toBe(true);
    expect(
      renderer.root.findByProps({testID: 'visual-ROAD_PATROL'}).props.visualProps
        .doubtful,
    ).toBe(true);
  });

  it('selects a line event through the existing map callback', () => {
    const onEventPress = jest.fn();
    act(() => {
      renderer = create(
        <RoadEventSource events={[tomTomLine]} onEventPress={onEventPress} />,
      );
    });

    const source = renderer.root.findByProps({
      testID: 'tomtom-road-event-lines-source',
    });
    act(() => {
      source.props.sourceProps.onPress({
        stopPropagation: jest.fn(),
        nativeEvent: {
          features: [{properties: {eventId: tomTomLine.id}}],
        },
      });
    });

    expect(onEventPress).toHaveBeenCalledWith(tomTomLine);
  });

  it('keeps the approximate AREA halo as a quiet map layer', () => {
    act(() => {
      renderer = create(
        <RoadEventSource events={[userEvent]} onEventPress={jest.fn()} />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'road-events-approximate-area-halo',
      }),
    ).toBeTruthy();
  });

  it('builds a semantic accessibility label with local time and no date', () => {
    const label = buildEventMarkerAccessibilityLabel(userEvent);

    expect(label).toContain('ДТП');
    expect(label).toMatch(/\d{2}:\d{2}$/);
    expect(label).not.toContain('2026');
    expect(label).not.toContain('25.08');
  });
});
