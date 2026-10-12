jest.mock(
  '../../shared/ui/BottomSheet/BottomSheet',
  () => ({
    BottomSheet: ({
      children,
    }: {
      children: unknown;
    }) => children,
  }),
);

import {
  canSubmitReportEvent,
} from './ReportEventSheet';

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

import React from 'react';
import {StyleSheet} from 'react-native';
import {act, create} from 'react-test-renderer';
import {ReportEventSheet} from './ReportEventSheet';
import {styles} from './ReportEventSheet.styles';

describe('ReportEvent pending guard', () => {
  it('shows DPS first as a full-width choice and the other eight in four columns', () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(ReportEventSheet, {
        visible: true, step: 'TYPE', selectedType: null, coordinate: null,
        locationSource: null, locationStatus: 'UNAVAILABLE', locationValid: false,
        isSubmitting: false, onClose: jest.fn(), onBack: jest.fn(),
        onSelect: jest.fn(), onSubmit: jest.fn(), onOpenSettings: jest.fn(),
      }));
    });
    const choices = renderer!.root.findAll(node =>
      node.props.accessibilityRole === 'button' && node.props.accessibilityLabel !== undefined,
    );
    expect(choices[0].props.accessibilityLabel).toBe('ДПС');
    expect(new Set(choices.map(choice => choice.props.accessibilityLabel)).size).toBe(9);
    expect(StyleSheet.flatten(styles.item).width).toBe('23.5%');
    expect(StyleSheet.flatten(styles.patrolItem).borderColor).toBe(StyleSheet.flatten(styles.item).borderColor);
    expect(StyleSheet.flatten(styles.patrolItem).borderRadius).toBe(StyleSheet.flatten(styles.item).borderRadius);
    act(() => renderer!.unmount());
  });
  it('disables repeated create submission while a request is pending', () => {
    const input = {
      selectedType:
        'ACCIDENT' as const,
      coordinate: [
        47.8007,
        52.0278,
      ] as [number, number],
      locationValid: true,
    };

    expect(
      canSubmitReportEvent({
        ...input,
        isSubmitting: false,
      }),
    ).toBe(true);

    expect(
      canSubmitReportEvent({
        ...input,
        isSubmitting: true,
      }),
    ).toBe(false);
  });
});
