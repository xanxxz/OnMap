import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {PermissionsAndroid, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {check, PERMISSIONS, RESULTS} from 'react-native-permissions';

import {
  LocationManager,
} from '@maplibre/maplibre-react-native';

export type LocationPermissionState =
  | 'loading'
  | 'granted'
  | 'notDetermined'
  | 'denied';

const LOCATION_REQUESTED_KEY = 'onmap:location-permission-requested:v1';
let permissionRequestInFlight: Promise<boolean> | null = null;

export const requestLocationPermission = (): Promise<boolean> => {
  if (!permissionRequestInFlight) {
    permissionRequestInFlight = (async () => {
      const current = await checkLocationPermission();
      if (current === 'granted') return true;
      if (current === 'denied') return false;

      await AsyncStorage.setItem(LOCATION_REQUESTED_KEY, 'true').catch(() => undefined);
      if (Platform.OS === 'android') {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);
        return [
          results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION],
          results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION],
        ].some(result => result === PermissionsAndroid.RESULTS.GRANTED);
      }
      return LocationManager.requestPermissions();
    })().finally(() => {
      permissionRequestInFlight = null;
    });
  }

  return permissionRequestInFlight;
};

const checkLocationPermission = async (): Promise<LocationPermissionState> => {
  try {
    if (Platform.OS === 'android') {
      const [fine, coarse] = await Promise.all([
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION),
      ]);
      if (fine || coarse) return 'granted';
    } else {
      const result = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
      if (result === RESULTS.GRANTED || result === RESULTS.LIMITED) return 'granted';
      if (result === RESULTS.BLOCKED || result === RESULTS.UNAVAILABLE) return 'denied';
    }
    const requested = await AsyncStorage.getItem(LOCATION_REQUESTED_KEY);
    return requested === 'true' ? 'denied' : 'notDetermined';
  } catch {
    return 'denied';
  }
};

export const useLocationPermission =
  (): {
    permission: LocationPermissionState;
    refreshAfterSettings: () => Promise<void>;
  } => {
    const [state, setState] =
      useState<LocationPermissionState>(
        'loading',
      );

    useEffect(() => {
      let mounted = true;

      const request = async () => {
        try {
          const status = await checkLocationPermission();

          if (!mounted) {
            return;
          }

          setState(status);
        } catch {
          if (mounted) {
            setState('denied');
          }
        }
      };

      request();

      return () => {
        mounted = false;
      };
    }, []);

    const refreshAfterSettings = useCallback(async () => {
      try {
        setState(await checkLocationPermission());
      } catch {
        setState('denied');
      }
    }, []);

    return {permission: state, refreshAfterSettings};
  };
