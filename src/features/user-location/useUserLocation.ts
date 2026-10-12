import {useCurrentPosition} from '@maplibre/maplibre-react-native';
import {AppState} from 'react-native';
import {useEffect, useRef, useState} from 'react';

import {
  LocationPosition,
  QualifiedLocation,
  isLocationStale,
  qualifyLocation,
  mergeVisibleLocation,
} from './locationQuality';

import {
  LocationPermissionState,
  useLocationPermission,
} from './useLocationPermission';

interface UserLocationState {
  permission: LocationPermissionState;
  coordinate: [number, number] | null;
  accuracy: number | null;
  timestamp: number | null;
  stale: boolean;
  unavailable: boolean;
  refreshPermission: () => Promise<void>;
}

const POSITION_REFRESH_MS = 5_000;

export const useUserLocation = (screenEnabled = true): UserLocationState => {
  const {permission, refreshAfterSettings} = useLocationPermission();
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState !== 'background',
  );
  const trackingEnabled =
    screenEnabled && appIsActive && permission === 'granted';
  const position = useCurrentPosition({
    enabled: trackingEnabled,
    minDisplacement: 0,
  });
  const acceptedPosition = useRef<QualifiedLocation | null>(null);
  const [location, setLocation] = useState<QualifiedLocation | null>(null);
  const [now, setNow] = useState(Date.now());
  const [waitingTooLong, setWaitingTooLong] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setAppIsActive(state === 'active');
      if (state === 'active') {
        setNow(Date.now());
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (permission !== 'granted') {
      acceptedPosition.current = null;
      setLocation(null);
    }
  }, [permission]);

  useEffect(() => {
    if (!trackingEnabled || location) {
      setWaitingTooLong(false);
      return;
    }
    const timeout = setTimeout(() => setWaitingTooLong(true), 8_000);
    return () => clearTimeout(timeout);
  }, [location, trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled || !position) {
      return;
    }

    const qualified = qualifyLocation(
      position as LocationPosition,
      Date.now(),
    );

    if (qualified) {
      const visible = mergeVisibleLocation(acceptedPosition.current, qualified);
      acceptedPosition.current = visible;
      setLocation(visible);
    }
  }, [position, trackingEnabled]);

  useEffect(() => {
    if (!location || !trackingEnabled) {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), POSITION_REFRESH_MS);
    return () => clearInterval(timer);
  }, [location, trackingEnabled]);

  useEffect(() => {
    if (trackingEnabled) {
      setNow(Date.now());
    }
  }, [trackingEnabled]);

  const isStale =
    location !== null && isLocationStale(location.timestamp, now);

  return {
    permission,
    coordinate: location?.coordinate ?? null,
    accuracy: location?.accuracy ?? null,
    timestamp: location?.timestamp ?? null,
    stale: isStale,
    unavailable: trackingEnabled && !location && waitingTooLong,
    refreshPermission: refreshAfterSettings,
  };
};
