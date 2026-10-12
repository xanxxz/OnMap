import React from 'react';

import {Image, StyleSheet} from 'react-native';

import {act, create, ReactTestRenderer} from 'react-test-renderer';

import {RoadEventType} from '../../model/roadEvent';

import {EventMarker} from './EventMarker';
import {getEventMarkerVisualConfig} from './eventMarkerVisualConfig';

describe('EventMarker illustrations', () => {
  let renderer: ReactTestRenderer;

  const eventTypes: RoadEventType[] = [
    'ACCIDENT',
    'ROAD_CLOSURE',
    'ROADWORKS',
    'TRAFFIC',
    'ROAD_HAZARD',
    'TRAFFIC_LIGHT',
    'ROAD_SERVICE',
    'ROAD_PATROL',
    'OTHER',
  ];

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('renders the registered PNG with contain scaling and the existing accessible press action', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <EventMarker
          type="TRAFFIC"
          accessibilityLabel="Пробка, 12:30"
          onPress={onPress}
        />,
      );
    });

    const image = renderer.root.findByType(Image);
    const imageStyle = StyleSheet.flatten(image.props.style);
    const pressable = renderer.root.findByProps({accessibilityRole: 'button'});

    expect(image.props.source).toBe(
      getEventMarkerVisualConfig('TRAFFIC').source,
    );
    expect(image.props.resizeMode).toBe('contain');
    expect(imageStyle).toMatchObject({
      width: getEventMarkerVisualConfig('TRAFFIC').width,
      height: getEventMarkerVisualConfig('TRAFFIC').height,
      opacity: 1,
    });
    expect(pressable.props.accessibilityLabel).toBe('Пробка, 12:30');

    act(() => pressable.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps stale, selected, and doubtful states on the illustrated marker', () => {
    act(() => {
      renderer = create(
        <EventMarker
          type="ROAD_PATROL"
          status="STALE"
          selected
          doubtful
          accessibilityLabel="ДПС, Улица Мира"
        />,
      );
    });

    const image = renderer.root.findByType(Image);
    const imageStyle = StyleSheet.flatten(image.props.style);

    expect(imageStyle).toMatchObject({
      width: getEventMarkerVisualConfig('ROAD_PATROL').width,
      height: getEventMarkerVisualConfig('ROAD_PATROL').height,
      opacity: 0.58,
    });
    expect(
      renderer.root.findByProps({testID: 'event-marker-doubtful'}),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({testID: 'event-marker-ROAD_PATROL'}),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({accessibilityLabel: 'ДПС, Улица Мира'}),
    ).toBeTruthy();
  });

  it('dims unconfirmed illustrations without adding a colored marker backing', () => {
    act(() => {
      renderer = create(
        <EventMarker
          type="TRAFFIC_LIGHT"
          status="UNCONFIRMED"
          accessibilityLabel="Светофор"
        />,
      );
    });

    const image = renderer.root.findByType(Image);
    const imageStyle = StyleSheet.flatten(image.props.style);
    const markerStyle = StyleSheet.flatten(
      renderer.root.findByProps({testID: 'event-marker-TRAFFIC_LIGHT'}).props
        .style,
    );

    expect(imageStyle).toMatchObject({
      width: getEventMarkerVisualConfig('TRAFFIC_LIGHT').width,
      height: getEventMarkerVisualConfig('TRAFFIC_LIGHT').height,
      opacity: 0.76,
    });
    expect(markerStyle.justifyContent).toBe('flex-end');
    expect(
      renderer.root.findAllByProps({accessibilityRole: 'button'}),
    ).toHaveLength(0);
  });

  it('renders all nine illustrations at their configured artwork dimensions', () => {
    act(() => {
      renderer = create(
        <>
          {eventTypes.map(type => (
            <EventMarker
              key={type}
              type={type}
              accessibilityLabel={type}
            />
          ))}
        </>,
      );
    });

    const images = renderer.root.findAllByType(Image);

    expect(images).toHaveLength(eventTypes.length);
    images.forEach((image, index) => {
      const type = eventTypes[index];
      const imageStyle = StyleSheet.flatten(image.props.style);

      expect(image.props.source).toBe(getEventMarkerVisualConfig(type).source);
      expect(imageStyle.width).toBe(getEventMarkerVisualConfig(type).width);
      expect(imageStyle.height).toBe(getEventMarkerVisualConfig(type).height);
      expect(image.props.resizeMode).toBe('contain');
    });
  });
});
