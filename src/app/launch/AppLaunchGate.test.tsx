import React from 'react';

import {act, create, ReactTestRenderer} from 'react-test-renderer';

import {motion} from '../../shared/theme';

import {AppLaunchGate} from './AppLaunchGate';
import {
  completeCurrentOnboarding,
  hasCompletedCurrentOnboarding,
} from './onboardingStorage';
import {requestLocationPermission} from '../../features/user-location/useLocationPermission';
import {requestNotificationPermissionOnce} from '../../features/notifications/notificationPermission';

jest.mock('./onboardingStorage', () => ({
  hasCompletedCurrentOnboarding: jest.fn(),
  completeCurrentOnboarding: jest.fn(),
}));
jest.mock('../../features/user-location/useLocationPermission', () => ({
  requestLocationPermission: jest.fn(),
}));
jest.mock('../../features/notifications/notificationPermission', () => ({
  requestNotificationPermissionOnce: jest.fn(),
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
    jest.mocked(requestLocationPermission).mockResolvedValue(true);
    jest.mocked(requestNotificationPermissionOnce).mockResolvedValue('granted');
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
    expect(requestLocationPermission).not.toHaveBeenCalled();
    expect(requestNotificationPermissionOnce).not.toHaveBeenCalled();
  });

  it('waits for the location decision before requesting notifications', async () => {
    mockedHasCompleted.mockResolvedValue(false);
    let settleLocation: (granted: boolean) => void = () => undefined;
    jest.mocked(requestLocationPermission).mockImplementation(() => new Promise(resolve => {
      settleLocation = resolve;
    }));
    act(() => { renderer = create(<AppLaunchGate />); });
    await flushLaunch();

    let completion: Promise<void> = Promise.resolve();
    act(() => {
      completion = renderer.root.findByProps({testID: 'complete-onboarding'}).props.onPress();
    });
    expect(requestLocationPermission).toHaveBeenCalledTimes(1);
    expect(requestNotificationPermissionOnce).not.toHaveBeenCalled();
    await act(async () => {
      settleLocation(false);
      await completion;
    });
    expect(requestNotificationPermissionOnce).toHaveBeenCalledTimes(1);
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
    expect(requestLocationPermission).toHaveBeenCalledTimes(1);
    expect(requestNotificationPermissionOnce).toHaveBeenCalledTimes(1);
    expect(jest.mocked(requestLocationPermission).mock.invocationCallOrder[0])
      .toBeLessThan(jest.mocked(requestNotificationPermissionOnce).mock.invocationCallOrder[0]);
    expect(renderer.root.findByProps({children: 'map'})).toBeTruthy();
  });

  it('enters the map when both permissions are denied', async () => {
    mockedHasCompleted.mockResolvedValue(false);
    jest.mocked(requestLocationPermission).mockResolvedValue(false);
    jest.mocked(requestNotificationPermissionOnce).mockResolvedValue('denied');
    act(() => { renderer = create(<AppLaunchGate />); });
    await flushLaunch();
    await act(async () => {
      await renderer.root.findByProps({testID: 'complete-onboarding'}).props.onPress();
    });
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
