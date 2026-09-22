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
});
