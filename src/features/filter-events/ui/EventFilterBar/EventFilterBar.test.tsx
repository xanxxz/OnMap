import React from 'react';

import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { useRoadEventFilterStore } from '../../model/useRoadEventFilterStore';

import { EventFilterBar } from './EventFilterBar';

describe('EventFilterBar', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    useRoadEventFilterStore.setState({ activeTypes: [] });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('keeps the existing type filtering behavior', () => {
    act(() => {
      renderer = create(<EventFilterBar />);
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'ДТП' }).props.onPress();
    });

    expect(useRoadEventFilterStore.getState().activeTypes).toEqual([
      'ACCIDENT',
    ]);

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Все события' })
        .props.onPress();
    });

    expect(useRoadEventFilterStore.getState().activeTypes).toEqual([]);
  });

  it('places DPS immediately after the all-events filter', () => {
    act(() => {
      renderer = create(<EventFilterBar />);
    });

    const labels = renderer.root
      .findAllByProps({accessibilityRole: 'button'})
      .map(button => button.props.accessibilityLabel);
    const uniqueLabels = labels.filter(
      (label, index) => labels.indexOf(label) === index,
    );

    expect(uniqueLabels.slice(0, 2)).toEqual(['Все события', 'ДПС']);
  });
});
