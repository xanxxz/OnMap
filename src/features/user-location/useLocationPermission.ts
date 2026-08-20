import {
  useEffect,
  useState,
} from 'react';

import {
  LocationManager,
} from '@maplibre/maplibre-react-native';

export type LocationPermissionState =
  | 'loading'
  | 'granted'
  | 'denied';

export const useLocationPermission =
  (): LocationPermissionState => {
    const [state, setState] =
      useState<LocationPermissionState>(
        'loading',
      );

    useEffect(() => {
      let mounted = true;

      const request = async () => {
        try {
          const granted =
            await LocationManager.requestPermissions();

          if (!mounted) {
            return;
          }

          setState(
            granted
              ? 'granted'
              : 'denied',
          );
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

    return state;
  };