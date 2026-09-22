import React from 'react';

import {act, create, ReactTestRenderer} from 'react-test-renderer';

import {motion} from '../../shared/theme';

import {AppLaunchGate} from './AppLaunchGate';
import {
  completeCurrentOnboarding,
  hasCompletedCurrentOnboarding,
} from './onboardingStorage';

jest.mock('./onboardingStorage', () => ({
  hasCompletedCurrentOnboarding: jest.fn(),
  completeCurrentOnboarding: jest.fn(),
}));

jest.mock('../../screens/LaunchScreen/LaunchScreen', () => {
  const ReactNative = require('react-native');
  return {LaunchScreen: () => <ReactNative.Text>launch</ReactNative.Text>};
});

jest.mock('../../screens/OnboardingScreen/OnboardingScreen', () => {
  const ReactNative = require('react-native');
  return {
    OnboardingScreen: ({onComplete}: {onComplete: () => Promise<void>}) => (
      <ReactNative.Pressable testID="complete-onboarding" onPress={onComplete}>
        <ReactNative.Text>onboarding</ReactNative.Text>
      </ReactNative.Pressable>
    ),
  };
});

jest.mock('../navigation/RootNavigator', () => {
  const ReactNative = require('react-native');
  return {RootNavigator: () => <ReactNative.Text>map</ReactNative.Text>};
});

const mockedHasCompleted = jest.mocked(hasCompletedCurrentOnboarding);
const mockedComplete = jest.mocked(completeCurrentOnboarding);

const flushLaunch = async () => {
  await act(async () => {
    jest.advanceTimersByTime(motion.launchMinimumVisibleMs);
    await Promise.resolve();
  });
};

describe('AppLaunchGate', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockedComplete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    jest.useRealTimers();
  });

  it('opens onboarding on first launch', async () => {
    mockedHasCompleted.mockResolvedValue(false);

    act(() => {
      renderer = create(<AppLaunchGate />);
    });

    expect(renderer.root.findByProps({children: 'launch'})).toBeTruthy();
    await flushLaunch();
    expect(renderer.root.findByProps({children: 'onboarding'})).toBeTruthy();
  });

  it('skips onboarding after the current version was completed', async () => {
    mockedHasCompleted.mockResolvedValue(true);

    act(() => {
      renderer = create(<AppLaunchGate />);
    });

    await flushLaunch();
    expect(renderer.root.findByProps({children: 'map'})).toBeTruthy();
  });

  it('persists completion before opening the map', async () => {
    mockedHasCompleted.mockResolvedValue(false);

    act(() => {
      renderer = create(<AppLaunchGate />);
    });
    await flushLaunch();

    await act(async () => {
      await renderer.root.findByProps({testID: 'complete-onboarding'}).props.onPress();
    });

    expect(mockedComplete).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({children: 'map'})).toBeTruthy();
  });

  it('returns to onboarding if storage cannot be read', async () => {
    mockedHasCompleted.mockRejectedValue(new Error('storage unavailable'));

    act(() => {
      renderer = create(<AppLaunchGate />);
    });

    await flushLaunch();
    expect(renderer.root.findByProps({children: 'onboarding'})).toBeTruthy();
  });
});
