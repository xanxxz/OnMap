import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LocationManager} from '@maplibre/maplibre-react-native';
import {check, RESULTS} from 'react-native-permissions';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {PermissionsAndroid, Platform, Text} from 'react-native';
import {requestLocationPermission, useLocationPermission} from './useLocationPermission';

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
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const androidResults = {
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: PermissionsAndroid.RESULTS.DENIED,
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: PermissionsAndroid.RESULTS.GRANTED,
    } as unknown as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>;
    const requestMultiple = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(androidResults);
    expect(await requestLocationPermission()).toBe(true);
    expect(requestMultiple).toHaveBeenCalledWith([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
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
    expect(renderer.root.findByType(Text).props.children).toBe('denied');
    expect(LocationManager.requestPermissions).not.toHaveBeenCalled();
  });
});
