import React from 'react';

import { View } from 'react-native';

import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { balakovoCity } from '../../shared/config/cities';

import { MapHeader } from './MapHeader';

jest.mock('../../shared/ui/BottomSheet/BottomSheet', () => {
  const ReactNative = require('react-native');

  return {
    BottomSheet: ({ children }: { children: React.ReactNode }) => (
      <ReactNative.View>{children}</ReactNative.View>
    ),
  };
});

const secondCity = {
  ...balakovoCity,
  id: 'second-city',
  name: 'Второй город',
};

describe('MapHeader', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('shows the city and selects another registry entry', () => {
    const onSelectCity = jest.fn();

    act(() => {
      renderer = create(
        <MapHeader
          city={balakovoCity}
          cities={[balakovoCity, secondCity]}
          dpsActivity={{ cityId: 'balakovo', onMap: 2, unlocated: 1, total: 3 }}
          eventCount={0}
          realtimeStatus="connected"
          onSelectCity={onSelectCity}
        />,
      );
    });

    act(() => {
      renderer.root
        .findByProps({ testID: 'city-header-button' })
        .props.onPress();
    });

    const option = renderer.root.findByProps({
      accessibilityLabel: 'Второй город',
    });

    act(() => option.props.onPress());

    expect(onSelectCity).toHaveBeenCalledWith('second-city');
  });

  it('shows the citywide DPS total including unlocated reports', () => {
    act(() => {
      renderer = create(
        <MapHeader
          city={balakovoCity}
          cities={[balakovoCity]}
          dpsActivity={{ cityId: 'balakovo', onMap: 2, unlocated: 1, total: 3 }}
          eventCount={0}
          realtimeStatus="connected"
          onSelectCity={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root
        .findAllByType(View)
        .filter(node => node.props.testID === 'dps-activity-card'),
    ).toHaveLength(1);

    const text = renderer.root
      .findAllByType(require('react-native').Text)
      .map(node => node.props.children)
      .join(' ');

    expect(text).toContain('3');
    expect(text).toContain('2 на карте\n1 без точки');
  });
});
