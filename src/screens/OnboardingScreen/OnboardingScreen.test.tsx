import React from 'react';

import {act, create, ReactTestRenderer} from 'react-test-renderer';

import {motion} from '../../shared/theme';

import {OnboardingScreen} from './OnboardingScreen';

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');
  const entering = {
    duration: () => entering,
    easing: () => entering,
  };

  return {
    __esModule: true,
    default: {View: ReactNative.View},
    Easing: {out: (value: unknown) => value, cubic: 'cubic'},
    FadeInDown: entering,
    useReducedMotion: () => true,
  };
});

jest.mock('../../shared/ui/OnMapBrand', () => {
  const ReactNative = require('react-native');

  return {
    OnMapBrand: () => <ReactNative.Text>OnMap</ReactNative.Text>,
  };
});

describe('OnboardingScreen', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    jest.useRealTimers();
  });

  it('requires the minimum reading time on every slide', () => {
    act(() => {
      renderer = create(<OnboardingScreen onComplete={jest.fn()} />);
    });

    const button = renderer.root.findByProps({accessibilityLabel: 'Далее'});
    expect(button.props.accessibilityState.disabled).toBe(true);

    act(() => {
      jest.advanceTimersByTime(motion.onboardingMinimumVisibleMs);
    });

    expect(
      renderer.root.findByProps({accessibilityLabel: 'Далее'}).props
        .accessibilityState.disabled,
    ).toBe(false);
  });

  it('cannot finish before all five screens were viewed', async () => {
    const onComplete = jest.fn().mockResolvedValue(undefined);

    act(() => {
      renderer = create(<OnboardingScreen onComplete={onComplete} />);
    });

    for (let index = 0; index < 4; index += 1) {
      act(() => {
        jest.advanceTimersByTime(motion.onboardingMinimumVisibleMs);
      });
      act(() => {
        renderer.root.findByProps({accessibilityLabel: 'Далее'}).props.onPress();
      });
      expect(onComplete).not.toHaveBeenCalled();
    }

    expect(
      renderer.root.findByProps({accessibilityLabel: 'Открыть карту'}),
    ).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(motion.onboardingMinimumVisibleMs);
    });

    await act(async () => {
      await renderer.root.findByProps({accessibilityLabel: 'Открыть карту'}).props.onPress();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
