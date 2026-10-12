import {LocationManager} from '@maplibre/maplibre-react-native';

import {
  LocationPermissionState,
  requestLocationPermission,
} from './useLocationPermission';
import {
  GOOD_LOCATION_ACCURACY_METERS,
  LocationPosition,
  MAX_LOCATION_AGE_MS,
  MAX_FUTURE_LOCATION_SKEW_MS,
  MAX_USABLE_LOCATION_ACCURACY_METERS,
  locationTimestampMs,
} from './locationQuality';

export {GOOD_LOCATION_ACCURACY_METERS} from './locationQuality';

export const LOCATION_FIX_TIMEOUT_MS = 6_500;
export const LOCATION_FIX_REFINEMENT_WINDOW_MS = 900;
const EXCELLENT_LOCATION_ACCURACY_METERS = 15;

interface LocationManagerLike {
  requestPermissions: () => Promise<boolean>;
  addListener: (listener: (position: LocationPosition) => void) => void;
  removeListener: (listener: (position: LocationPosition) => void) => void;
}

export type FreshLocationResult =
  | {
      status: 'READY' | 'APPROXIMATE';
      coordinate: [number, number];
      accuracy: number;
    }
  | {status: 'PERMISSION_DENIED' | 'UNAVAILABLE'};

const isUsablePosition = (position: LocationPosition, now: number): boolean => {
  const {longitude, latitude, accuracy} = position.coords;
  const age = now - locationTimestampMs(position.timestamp, now);

  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    accuracy <= MAX_USABLE_LOCATION_ACCURACY_METERS &&
    age <= MAX_LOCATION_AGE_MS &&
    age >= -MAX_FUTURE_LOCATION_SKEW_MS
  );
};

export const requestFreshUserLocation = async (
  permission: LocationPermissionState,
  manager: LocationManagerLike = LocationManager,
  now: () => number = Date.now,
  timeoutMs = LOCATION_FIX_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<FreshLocationResult> => {
  if (signal?.aborted) {
    return {status: 'UNAVAILABLE'};
  }

  if (permission === 'denied') {
    return {status: 'PERMISSION_DENIED'};
  }

  if (permission !== 'granted') {
    const permissionResult =
      manager === LocationManager
        ? requestLocationPermission()
        : manager.requestPermissions();
    const granted = await permissionResult.catch(() => false);
    if (!granted) {
      return {status: 'PERMISSION_DENIED'};
    }
  }

  return new Promise(resolve => {
    let bestPosition: LocationPosition | null = null;
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let refinementTimeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (refinementTimeout) {
        clearTimeout(refinementTimeout);
      }
      try {
        manager.removeListener(handlePosition);
      } catch {
        // Native location services can disappear while the app is backgrounded.
      }
      signal?.removeEventListener('abort', handleAbort);
    };

    const finish = (result: FreshLocationResult) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      resolve(result);
    };

    const handleAbort = () => finish({status: 'UNAVAILABLE'});

    function handlePosition(position: LocationPosition) {
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
        if (position.coords.accuracy <= EXCELLENT_LOCATION_ACCURACY_METERS) {
          finish({
            status: 'READY',
            coordinate: [position.coords.longitude, position.coords.latitude],
            accuracy: position.coords.accuracy,
          });
          return;
        }

        if (!refinementTimeout) {
          refinementTimeout = setTimeout(() => {
            if (!bestPosition) {
              finish({status: 'UNAVAILABLE'});
              return;
            }

            finish({
              status:
                bestPosition.coords.accuracy <= GOOD_LOCATION_ACCURACY_METERS
                  ? 'READY'
                  : 'APPROXIMATE',
              coordinate: [
                bestPosition.coords.longitude,
                bestPosition.coords.latitude,
              ],
              accuracy: bestPosition.coords.accuracy,
            });
          }, LOCATION_FIX_REFINEMENT_WINDOW_MS);
        }
      }

    }

    signal?.addEventListener('abort', handleAbort, {once: true});
    try {
      manager.addListener(handlePosition);
    } catch {
      finish({status: 'UNAVAILABLE'});
      return;
    }

    if (finished) {
      return;
    }

    timeout = setTimeout(() => {
      if (!bestPosition) {
        finish({status: 'UNAVAILABLE'});
        return;
      }

      finish({
        status:
          bestPosition.coords.accuracy <= GOOD_LOCATION_ACCURACY_METERS
            ? 'READY'
            : 'APPROXIMATE',
        coordinate: [
          bestPosition.coords.longitude,
          bestPosition.coords.latitude,
        ],
        accuracy: bestPosition.coords.accuracy,
      });
    }, timeoutMs);
  });
};
