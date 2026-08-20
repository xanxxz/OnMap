import {
  useCurrentPosition,
} from '@maplibre/maplibre-react-native';

import {
  LocationPermissionState,
  useLocationPermission,
} from './useLocationPermission';

interface UserLocationState {
  permission:
    LocationPermissionState;

  coordinate:
    | [number, number]
    | null;

  accuracy: number | null;
}

export const useUserLocation =
  (): UserLocationState => {
    const permission =
      useLocationPermission();

    const position =
      useCurrentPosition();

    if (
      permission !== 'granted' ||
      !position
    ) {
      return {
        permission,
        coordinate: null,
        accuracy: null,
      };
    }

    return {
      permission,

      coordinate: [
        position.coords.longitude,
        position.coords.latitude,
      ],

      accuracy:
        position.coords.accuracy ??
        null,
    };
  };