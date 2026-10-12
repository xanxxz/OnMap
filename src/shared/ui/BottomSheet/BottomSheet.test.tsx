import React from 'react';
import {Pressable, Text} from 'react-native';
import {act, create, ReactTestRenderer} from 'react-test-renderer';

import {BottomSheet} from './BottomSheet';

jest.mock('react-native-gesture-handler', () => {
  const ReactNative = require('react-native');
  const ReactModule = require('react');
  return {
    GestureDetector: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(ReactNative.View, {testID: 'sheet-gesture-area'}, children),
    usePanGesture: jest.fn(() => ({})),
    GestureHandlerRootView: ReactNative.View,
  };
});

jest.mock('react-native-worklets', () => ({scheduleOnRN: (fn: () => void) => fn()}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 47, bottom: 34, left: 0, right: 0}),
}));

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');
  return {
    __esModule: true,
    default: {View: ReactNative.View},
    useSharedValue: (value: number) => ({value, get: () => value, set: jest.fn()}),
    useReducedMotion: () => false,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    interpolate: () => 0,
    withSpring: (value: number) => value,
    withTiming: jest.fn((value: number, _config: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return value;
    }),
  };
});

describe('BottomSheet backdrop', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('closes on an outside press and keeps inside presses independent', () => {
    const onClose = jest.fn();
    const onInsidePress = jest.fn();
    act(() => {
      renderer = create(
        <BottomSheet visible onClose={onClose}>
          <Pressable testID="inside-action" onPress={onInsidePress}>
            <Text>Действие</Text>
          </Pressable>
        </BottomSheet>,
      );
    });

    act(() => {
      renderer.root.findByProps({testID: 'inside-action'}).props.onPress();
    });
    expect(onInsidePress).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({testID: 'sheet-gesture-area'})
      .findByProps({testID: 'inside-action'})).toBeDefined();

    act(() => {
      renderer.root.findByProps({accessibilityLabel: 'Закрыть'})
        .props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses a deliberate downward swipe but ignores a short gesture', () => {
    const onClose = jest.fn();
    act(() => {
      renderer = create(<BottomSheet visible onClose={onClose}><Text>Содержимое</Text></BottomSheet>);
    });
    const pan = require('react-native-gesture-handler').usePanGesture as jest.Mock;
    const config = pan.mock.calls[pan.mock.calls.length - 1][0];
    act(() => config.onDeactivate({translationY: 20, velocityY: 100}));
    expect(onClose).not.toHaveBeenCalled();
    act(() => config.onDeactivate({translationY: 120, velocityY: 100}));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('unmounts a parent modal only after its sheet exit completes', () => {
    const onClosed = jest.fn();
    act(() => {
      renderer = create(<BottomSheet visible onClose={jest.fn()} onClosed={onClosed}><Text>Города</Text></BottomSheet>);
    });
    expect(onClosed).not.toHaveBeenCalled();
    act(() => {
      renderer.update(<BottomSheet visible={false} onClose={jest.fn()} onClosed={onClosed}><Text>Города</Text></BottomSheet>);
    });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
