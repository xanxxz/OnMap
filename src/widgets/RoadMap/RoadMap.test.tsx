import React from 'react';

import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text } from 'react-native';

import { ACTIVE_CITY } from '../../shared/config/cities';

import { RoadEvent } from '../../entities/road-event/model/roadEvent';

import { RoadMap } from './RoadMap';

jest.mock('../../shared/config/env', () => ({
  env: {
    mapStyles: {
      primary: {
        id: 'maptiler',

        styleUrl: 'https://primary.example/style.json',
      },

      fallback: {
        id: 'openfreemap',

        styleUrl: 'https://fallback.example/style.json',
      },

      initial: {
        id: 'maptiler',

        styleUrl: 'https://primary.example/style.json',
      },
    },
  },
}));

jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactModule = require('react');

  const ReactNative = require('react-native');

  return {
    Camera: (props: Record<string, unknown>) => (
      <ReactNative.View {...props} testID="road-map-camera" />
    ),

    Layer: (props: Record<string, unknown>) => (
      <ReactNative.View {...props} testID="coverage-boundary-line" />
    ),
    LayerAnnotation: (props: Record<string, unknown> & {children?: React.ReactNode}) => (
      <ReactNative.View {...props} testID="layer-annotation" />
    ),
    Marker: ({children, ...props}: Record<string, unknown> & {children?: React.ReactNode}) => (
      <ReactNative.View {...props} testID="native-marker">{children}</ReactNative.View>
    ),

    Map: ReactModule.forwardRef(
      (
        props: Record<string, unknown>,
        ref: React.Ref<typeof ReactNative.View>,
      ) => <ReactNative.View {...props} ref={ref} />,
    ),

    GeoJSONSource: ({
      children,
      ...props
    }: Record<string, unknown> & {
      children?: React.ReactNode;
    }) => (
      <ReactNative.View {...props} testID="coverage-boundary-source">
        {children}
      </ReactNative.View>
    ),
  };
});

jest.mock(
  '../../entities/road-event/ui/RoadEventSource/RoadEventSource',
  () => {
    const ReactNative = require('react-native');

    return {
      RoadEventSource: () => <ReactNative.View testID="road-event-source" />,
    };
  },
);

jest.mock(
  '../../features/report-event/ui/DraftLocationMarker/DraftLocationMarker',
  () => ({
    DraftLocationMarker: () => null,
  }),
);

describe('RoadMap provider lifecycle', () => {
  let renderer: ReactTestRenderer;

  const renderMap = (
    events: RoadEvent[] = [],
    city = ACTIVE_CITY,
    liveUserLocation: {
      coordinate: [number, number];
      accuracy: number | null;
      stale: boolean;
    } | null = null,
  ) => {
    act(() => {
      renderer = create(
        <SafeAreaProvider
          initialMetrics={{
            frame: {
              x: 0,
              y: 0,
              width: 390,
              height: 844,
            },
            insets: {
              top: 47,
              right: 0,
              bottom: 34,
              left: 0,
            },
          }}
        >
          <RoadMap
            city={city}
            events={events}
            draftCoordinate={null}
            liveUserLocation={liveUserLocation}
            onEventPress={jest.fn()}
            onLongPressCoordinate={jest.fn()}
            onViewportChange={jest.fn()}
          />
        </SafeAreaProvider>,
      );
    });
  };

  const nativeMap = () =>
    renderer.root.findByProps({
      testID: 'road-map-native',
    });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it('activates fallback when primary style loading fails without crashing', () => {
    renderMap();

    expect(nativeMap().props.mapStyle).toBe(
      'https://primary.example/style.json',
    );

    act(() => {
      nativeMap().props.onDidFailLoadingMap();
    });

    expect(nativeMap().props.mapStyle).toBe(
      'https://fallback.example/style.json',
    );

    expect(
      renderer.root.findByProps({
        testID: 'road-map-loading',
      }),
    ).toBeTruthy();

    act(() => {
      nativeMap().props.onDidFinishLoadingStyle();
    });

    expect(
      renderer.root.findAllByProps({
        testID: 'road-map-error',
      }),
    ).toHaveLength(0);
  });

  it('keeps the real city contour distinct from the visible working-area edge', () => {
    renderMap();

    const source = renderer.root.findByProps({
      id: 'city-coverage-boundary-source',
    });

    expect(source.props.data).toBe(ACTIVE_CITY.displayBoundary);
    expect(source.props.data).not.toBe(ACTIVE_CITY.coverageBoundary);
    const cameraBounds = renderer.root.findByProps({ testID: 'road-map-camera' }).props.maxBounds;
    expect(cameraBounds[0]).toBeLessThan(ACTIVE_CITY.coverageBounds.west);
    expect(cameraBounds[1]).toBeLessThan(ACTIVE_CITY.coverageBounds.south);
    expect(cameraBounds[2]).toBeGreaterThan(ACTIVE_CITY.coverageBounds.east);
    expect(cameraBounds[3]).toBeGreaterThan(ACTIVE_CITY.coverageBounds.north);
    expect(renderer.root.findByProps({id: 'working-area-edge-source'}).props.data)
      .toEqual(ACTIVE_CITY.coverageBoundary);
    expect(
      renderer.root.findByProps({ id: 'city-coverage-boundary-fill' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ id: 'city-coverage-boundary-glow' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ id: 'city-coverage-boundary-line' }),
    ).toBeTruthy();
  });

  it('never falls back to the technical rectangle when display geometry is absent', () => {
    renderMap([], { ...ACTIVE_CITY, displayBoundary: undefined });
    expect(
      renderer.root.findAllByProps({ id: 'city-coverage-boundary-source' }),
    ).toHaveLength(0);
  });

  it('renders a distinct stale-aware live location marker', () => {
    renderMap([], ACTIVE_CITY, {
      coordinate: [47.81, 52.01],
      accuracy: 92,
      stale: true,
    });

    const marker = renderer.root.findByProps({id: 'onmap-live-user-location'});
    expect(renderer.root.findByProps({testID: 'native-marker'}).props.id)
      .toBe('onmap-live-user-location');
    expect(marker.props.lngLat).toEqual([47.81, 52.01]);
    expect(marker.props.offset).toEqual([0, -11]);
    expect(renderer.root.findAllByType(Text).some(node =>
      node.props.children === 'Последняя позиция',
    )).toBe(true);
  });

  it('shows a map-specific error after both providers fail and retries once requested', () => {
    renderMap();

    act(() => {
      nativeMap().props.onDidFailLoadingMap();
    });

    act(() => {
      nativeMap().props.onDidFailLoadingMap();
    });

    expect(
      renderer.root.findByProps({
        testID: 'road-map-error',
      }),
    ).toBeTruthy();

    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'Повторить загрузку событий',
      }),
    ).toHaveLength(0);

    const retry = renderer.root.findByProps({
      accessibilityLabel: 'Повторить загрузку карты',
    });

    act(() => {
      retry.props.onPress();
    });

    expect(nativeMap().props.mapStyle).toBe(
      'https://primary.example/style.json',
    );

    expect(
      renderer.root.findAllByProps({
        testID: 'road-map-error',
      }),
    ).toHaveLength(0);
  });

  it('shows TomTom attribution only while external traffic data is displayed', () => {
    renderMap([
      {
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
      },
    ]);

    expect(
      renderer.root
        .findByProps({
          testID: 'map-attribution',
        })
        .findByType(Text).props.children,
    ).toBe('© MapTiler · © OpenStreetMap contributors · TomTom');
  });

  it('disables MapLibre logo and built-in attribution ornaments', () => {
    renderMap();

    expect(nativeMap().props.logo).toBe(false);
    expect(nativeMap().props.attribution).toBe(false);
  });

  it('shows one compact provider attribution without TomTom by default', () => {
    renderMap();

    expect(
      renderer.root
        .findByProps({
          testID: 'map-attribution',
        })
        .findByType(Text).props.children,
    ).toBe('© MapTiler · © OpenStreetMap contributors');
    expect(
      renderer.root.findAllByProps({
        testID: 'tomtom-attribution',
      }),
    ).toHaveLength(0);
  });

  it('changes attribution when the map falls back to OpenFreeMap', () => {
    renderMap();

    act(() => {
      nativeMap().props.onDidFailLoadingMap();
    });

    expect(
      renderer.root
        .findByProps({
          testID: 'map-attribution',
        })
        .findByType(Text).props.children,
    ).toBe('© OpenFreeMap · © OpenStreetMap contributors');
  });

  it('takes camera bounds and coverage boundary from the active city config', () => {
    renderMap();

    expect(
      renderer.root.findByProps({
        id: 'city-coverage-boundary-source',
      }).props.data,
    ).toEqual(ACTIVE_CITY.displayBoundary);
    expect(renderer.root.findByProps({id: 'working-area-edge-source'}).props.data)
      .toEqual(ACTIVE_CITY.coverageBoundary);
    expect(nativeMap().props.compass).toBe(false);
    expect(
      renderer.root.findByProps({
        testID: 'road-map-camera',
      }).props.initialViewState,
    ).toEqual({
      center: ACTIVE_CITY.center,
      zoom: ACTIVE_CITY.defaultZoom,
    });
  });

  it('commits a placement point only after a user-driven camera move', () => {
    const onPlacementCenterChange = jest.fn();
    act(() => {
      renderer = create(
        <SafeAreaProvider initialMetrics={{
          frame: {x: 0, y: 0, width: 390, height: 844},
          insets: {top: 47, right: 0, bottom: 34, left: 0},
        }}>
          <RoadMap
            city={ACTIVE_CITY}
            events={[]}
            draftCoordinate={[47.8, 52.02]}
            placementType="ACCIDENT"
            liveUserLocation={null}
            onEventPress={jest.fn()}
            onLongPressCoordinate={jest.fn()}
            onViewportChange={jest.fn()}
            onPlacementCenterChange={onPlacementCenterChange}
          />
        </SafeAreaProvider>,
      );
    });
    expect(renderer.root.findByProps({testID: 'report-placement-target'})).toBeTruthy();
    const region = {center: [47.81, 52.03], bounds: [47.7, 52, 47.9, 52.1]};
    act(() => nativeMap().props.onRegionDidChange({nativeEvent: {...region, userInteraction: false}}));
    expect(onPlacementCenterChange).not.toHaveBeenCalled();
    act(() => nativeMap().props.onRegionDidChange({nativeEvent: {...region, userInteraction: true}}));
    expect(onPlacementCenterChange).toHaveBeenCalledWith([47.81, 52.03]);
  });

  it('renders event markers after the coverage boundary layer', () => {
    renderMap();

    const nodes = nativeMap().findAll(
      node =>
        node.props.testID === 'coverage-boundary-source' ||
        node.props.testID === 'road-event-source',
    );

    const renderedIds = nodes.map(node => node.props.testID);

    expect(renderedIds.indexOf('coverage-boundary-source')).toBeLessThan(
      renderedIds.indexOf('road-event-source'),
    );
  });
});
