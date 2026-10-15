import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LocationManager} from '@maplibre/maplibre-react-native';
import {check, PERMISSIONS, requestMultiple, RESULTS} from 'react-native-permissions';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {Platform, Text} from 'react-native';
import {getLocationPermissionState, requestLocationPermission, useLocationPermission} from './useLocationPermission';

const Probe = () => {
  const {permission} = useLocationPermission();
  return <Text>{permission}</Text>;
};

describe('location permission after onboarding', () => {
  let renderer: ReactTestRenderer;
  const originalPlatform = Platform.OS;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    if (renderer) act(() => renderer.unmount());
    Object.defineProperty(Platform, 'OS', {value: originalPlatform, configurable: true});
    jest.restoreAllMocks();
  });

  it('requests iOS permission only once and reuses an existing grant', async () => {
    jest.mocked(check).mockResolvedValueOnce(RESULTS.DENIED).mockResolvedValue(RESULTS.GRANTED);
    jest.mocked(LocationManager.requestPermissions).mockResolvedValue(true);
    expect(await requestLocationPermission()).toBe(true);
    expect(await requestLocationPermission()).toBe(true);
    expect(LocationManager.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('does not reopen the system request after a prior refusal', async () => {
    await AsyncStorage.setItem('onmap:location-permission-requested:v1', 'true');
    jest.mocked(check).mockResolvedValue(RESULTS.DENIED);
    expect(await requestLocationPermission()).toBe(false);
    expect(LocationManager.requestPermissions).not.toHaveBeenCalled();
  });

  it('uses Android permission API instead of the MapLibre no-op', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
    jest.mocked(check).mockResolvedValue(RESULTS.DENIED);
    jest.mocked(requestMultiple).mockResolvedValue({
      [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION]: RESULTS.DENIED,
      [PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION]: RESULTS.GRANTED,
    } as Awaited<ReturnType<typeof requestMultiple>>);
    expect(await requestLocationPermission()).toBe(true);
    expect(requestMultiple).toHaveBeenCalledWith([
      PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
      PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
    ]);
    expect(LocationManager.requestPermissions).not.toHaveBeenCalled();
  });

  it('reads an existing grant without opening a second system prompt', async () => {
    jest.mocked(check).mockResolvedValue(RESULTS.GRANTED);
    await act(async () => { renderer = create(<Probe />); });
    expect(renderer.root.findByType(Text).props.children).toBe('granted');
    expect(LocationManager.requestPermissions).not.toHaveBeenCalled();
  });

  it('preserves a prior refusal and leaves the map usable', async () => {
    await AsyncStorage.setItem('onmap:location-permission-requested:v1', 'true');
    jest.mocked(check).mockResolvedValue(RESULTS.DENIED);
    await act(async () => { renderer = create(<Probe />); });
    expect(renderer.root.findByType(Text).props.children).toBe('blocked');
    expect(LocationManager.requestPermissions).not.toHaveBeenCalled();
  });

  it('keeps an Android permission retryable while the OS allows another request', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
    await AsyncStorage.setItem('onmap:location-permission-requested:v1', 'true');
    jest.mocked(check).mockResolvedValue(RESULTS.DENIED);
    expect(await getLocationPermissionState()).toBe('denied');
  });

  it('stores a blocked Android request so the next tap can offer settings instead of looping', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
    jest.mocked(check).mockResolvedValue(RESULTS.DENIED);
    jest.mocked(requestMultiple).mockResolvedValue({
      [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION]: RESULTS.BLOCKED,
      [PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION]: RESULTS.BLOCKED,
    } as Awaited<ReturnType<typeof requestMultiple>>);
    await expect(requestLocationPermission()).resolves.toBe(false);
    await expect(getLocationPermissionState()).resolves.toBe('blocked');
  });

  it('reports system/service unavailability distinctly from a user denial', async () => {
    jest.mocked(check).mockResolvedValue(RESULTS.UNAVAILABLE);
    expect(await getLocationPermissionState()).toBe('unavailable');
  });
});
