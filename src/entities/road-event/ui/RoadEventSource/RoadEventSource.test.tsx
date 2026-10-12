import React from 'react';

import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  TelegramRoadEvent,
  TomTomRoadEvent,
  UserRoadEvent,
} from '../../model/roadEvent';

import {
  buildEventMarkerAccessibilityLabel,
  RoadEventSource,
} from './RoadEventSource';

jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactNative = require('react-native');

  return {
    GeoJSONSource: (
      props: Record<string, unknown> & { children?: React.ReactNode },
    ) => (
      <ReactNative.View testID={props.id} sourceProps={props}>
        {props.children}
      </ReactNative.View>
    ),
    Layer: (props: Record<string, unknown>) => (
      <ReactNative.View {...props} testID={props.id} />
    ),
    Marker: (
      props: Record<string, unknown> & { children?: React.ReactNode },
    ) => (
      <ReactNative.View testID={props.id} markerProps={props}>
        {props.children}
      </ReactNative.View>
    ),
  };
});

jest.mock('../EventMarker/EventMarker', () => ({
  EventMarker: (props: Record<string, unknown>) => {
    const { View } = require('react-native');
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
  geometry: { type: 'Point', coordinates: [47.8, 52.02] },
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

const approximateStreetPoint: TelegramRoadEvent = {
  ...telegramLine,
  id: 'telegram-street-point',
  locationPrecision: 'STREET',
  geometry: { type: 'Point', coordinates: [47.81, 52.01] },
  coordinate: [47.81, 52.01],
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

  it('renders point and approximate-line events as custom illustrated marker views', () => {
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
      renderer.root.findByProps({ testID: 'road-event-marker-user-1' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({
        testID: 'road-event-marker-telegram-line-1',
      }),
    ).toBeTruthy();
    expect(
      renderer.root.findAllByProps({
        testID: 'road-event-marker-tomtom-line-1',
      }),
    ).toHaveLength(0);

    expect(
      renderer.root.findByProps({ testID: 'visual-ACCIDENT' }).props.visualProps
        .selected,
    ).toBe(true);
    expect(
      renderer.root.findByProps({ testID: 'visual-ROAD_PATROL' }).props
        .visualProps.doubtful,
    ).toBe(true);
  });

  it('uses server status, not local vote arithmetic, for the disputed marker', () => {
    const stale = {
      ...userEvent,
      id: 'stale',
      status: 'STALE' as const,
      rejectionCount: 0,
    };
    const active = { ...userEvent, id: 'active', rejectionCount: 7 };
    act(() => {
      renderer = create(
        <RoadEventSource events={[stale, active]} onEventPress={jest.fn()} />,
      );
    });
    const markers = renderer.root.findAllByProps({ testID: 'visual-ACCIDENT' });
    const visuals = markers.map(marker => marker.props.visualProps);
    expect(visuals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'STALE', doubtful: true }),
        expect.objectContaining({ status: 'ACTIVE', doubtful: false }),
      ]),
    );
  });

  it('keeps wide traffic centered and anchors the tall traffic-light artwork at its base', () => {
    const traffic: UserRoadEvent = {
      ...userEvent,
      id: 'traffic-wide',
      type: 'TRAFFIC',
      title: 'Пробка',
    };
    const trafficLight: UserRoadEvent = {
      ...userEvent,
      id: 'traffic-light-tall',
      type: 'TRAFFIC_LIGHT',
      title: 'Светофор',
    };

    act(() => {
      renderer = create(
        <RoadEventSource
          events={[traffic, trafficLight]}
          onEventPress={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        testID: 'road-event-marker-traffic-wide',
      }).props.markerProps.anchor,
    ).toBe('center');
    expect(
      renderer.root.findByProps({
        testID: 'road-event-marker-traffic-light-tall',
      }).props.markerProps.anchor,
    ).toBe('bottom');
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
          features: [{ properties: { eventId: tomTomLine.id } }],
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

  it('renders partial street resolution as one point on the resolved street without an area halo', () => {
    act(() => {
      renderer = create(
        <RoadEventSource
          events={[approximateStreetPoint]}
          onEventPress={jest.fn()}
        />,
      );
    });

    const marker = renderer.root.findByProps({
      testID: 'road-event-marker-telegram-street-point',
    });
    expect(marker.props.markerProps.lngLat).toEqual([47.81, 52.01]);
    const halo = renderer.root.findByProps({
      testID: 'road-events-approximate-area-halo',
    });
    expect(halo.props.filter).toEqual([
      'all',
      ['has', 'eventId'],
      ['==', ['get', 'source'], 'TELEGRAM'],
      ['==', ['get', 'locationPrecision'], 'AREA'],
    ]);
  });

  it('builds a semantic accessibility label with local time and no date', () => {
    const label = buildEventMarkerAccessibilityLabel(userEvent);

    expect(label).toContain('ДТП');
    expect(label).toMatch(/\d{2}:\d{2}$/);
    expect(label).not.toContain('2026');
    expect(label).not.toContain('25.08');
  });
});
