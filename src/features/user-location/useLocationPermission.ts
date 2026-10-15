import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {check, PERMISSIONS, requestMultiple, RESULTS} from 'react-native-permissions';

import {
  LocationManager,
} from '@maplibre/maplibre-react-native';

export type LocationPermissionState =
  | 'loading'
  | 'granted'
  | 'notDetermined'
  | 'denied'
  | 'blocked'
  | 'unavailable';

const LOCATION_REQUESTED_KEY = 'onmap:location-permission-requested:v1';
const LOCATION_BLOCKED_KEY = 'onmap:location-permission-blocked:v1';
let permissionRequestInFlight: Promise<boolean> | null = null;

export const requestLocationPermission = (): Promise<boolean> => {
  if (!permissionRequestInFlight) {
    permissionRequestInFlight = (async () => {
      const current = await getLocationPermissionState();
      if (current === 'granted') return true;
      if (current === 'blocked' || current === 'unavailable' || current === 'loading') return false;

      await AsyncStorage.setItem(LOCATION_REQUESTED_KEY, 'true').catch(() => undefined);
      if (Platform.OS === 'android') {
        const results = await requestMultiple([
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
        ]);
        const statuses = [
          results[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION],
          results[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION],
        ];
        const granted = statuses.some(result => result === RESULTS.GRANTED);
        if (statuses.some(result => result === RESULTS.BLOCKED)) {
          await AsyncStorage.setItem(LOCATION_BLOCKED_KEY, 'true').catch(() => undefined);
        }
        return granted;
      }
      await LocationManager.requestPermissions();
      // MapLibre's iOS method resolves once the OS request was issued, not when
      // Core Location actually granted access. Always re-read the OS status.
      return (await getLocationPermissionState()) === 'granted';
    })().finally(() => {
      permissionRequestInFlight = null;
    });
  }

  return permissionRequestInFlight;
};

export const getLocationPermissionState = async (): Promise<LocationPermissionState> => {
  try {
    if (Platform.OS === 'android') {
      const results = await Promise.all([
        check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION),
        check(PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION),
      ]);
      if (results.some(result => result === RESULTS.GRANTED || result === RESULTS.LIMITED)) return 'granted';
      const requested = await AsyncStorage.getItem(LOCATION_REQUESTED_KEY);
      if (requested !== 'true') return 'notDetermined';
      const blocked = await AsyncStorage.getItem(LOCATION_BLOCKED_KEY);
      return blocked === 'true' ? 'blocked' : 'denied';
    } else {
      const result = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
      if (result === RESULTS.GRANTED || result === RESULTS.LIMITED) return 'granted';
      if (result === RESULTS.UNAVAILABLE) return 'unavailable';
      if (result === RESULTS.BLOCKED) return 'blocked';
      if (result === RESULTS.DENIED) {
        const requested = await AsyncStorage.getItem(LOCATION_REQUESTED_KEY);
        return requested === 'true' ? 'blocked' : 'notDetermined';
      }
    }
    return 'unavailable';
  } catch {
    return 'unavailable';
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
          const status = await getLocationPermissionState();

          if (!mounted) {
            return;
          }

          setState(status);
        } catch {
          if (mounted) {
            setState('unavailable');
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
        setState(await getLocationPermissionState());
      } catch {
        setState('unavailable');
      }
    }, []);

    return {permission: state, refreshAfterSettings};
  };
