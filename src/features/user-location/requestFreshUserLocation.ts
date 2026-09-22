import {LocationManager} from '@maplibre/maplibre-react-native';

import {LocationPermissionState} from './useLocationPermission';

export const GOOD_LOCATION_ACCURACY_METERS = 40;
export const MAX_USABLE_LOCATION_ACCURACY_METERS = 250;
export const MAX_LOCATION_AGE_MS = 15_000;
export const LOCATION_FIX_TIMEOUT_MS = 6_500;

interface Position {
  coords: {
    longitude: number;
    latitude: number;
    accuracy: number;
  };
  timestamp: number;
}

interface LocationManagerLike {
  requestPermissions: () => Promise<boolean>;
  addListener: (listener: (position: Position) => void) => void;
  removeListener: (listener: (position: Position) => void) => void;
}

export type FreshLocationResult =
  | {
      status: 'READY' | 'APPROXIMATE';
      coordinate: [number, number];
      accuracy: number;
    }
  | {status: 'PERMISSION_DENIED' | 'UNAVAILABLE'};

const isUsablePosition = (position: Position, now: number): boolean => {
  const {longitude, latitude, accuracy} = position.coords;

  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    accuracy <= MAX_USABLE_LOCATION_ACCURACY_METERS &&
    now - position.timestamp <= MAX_LOCATION_AGE_MS
  );
};

export const requestFreshUserLocation = async (
  permission: LocationPermissionState,
  manager: LocationManagerLike = LocationManager,
  now: () => number = Date.now,
  timeoutMs = LOCATION_FIX_TIMEOUT_MS,
): Promise<FreshLocationResult> => {
  if (permission !== 'granted') {
    const granted = await manager.requestPermissions().catch(() => false);
    if (!granted) {
      return {status: 'PERMISSION_DENIED'};
    }
  }

  return new Promise(resolve => {
    let bestPosition: Position | null = null;
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      manager.removeListener(handlePosition);
    };

    const finish = (result: FreshLocationResult) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      resolve(result);
    };

    function handlePosition(position: Position) {
      if (!isUsablePosition(position, now())) {
        return;
      }

      if (
        bestPosition === null ||
        position.coords.accuracy < bestPosition.coords.accuracy
      ) {
        bestPosition = position;
      }

      if (position.coords.accuracy <= GOOD_LOCATION_ACCURACY_METERS) {
        finish({
          status: 'READY',
          coordinate: [position.coords.longitude, position.coords.latitude],
          accuracy: position.coords.accuracy,
        });
      }
    }

    manager.addListener(handlePosition);

    if (finished) {
      return;
    }

    timeout = setTimeout(() => {
      if (!bestPosition) {
        finish({status: 'UNAVAILABLE'});
        return;
      }

      finish({
        status: 'APPROXIMATE',
        coordinate: [
          bestPosition.coords.longitude,
          bestPosition.coords.latitude,
        ],
        accuracy: bestPosition.coords.accuracy,
      });
    }, timeoutMs);
  });
};
