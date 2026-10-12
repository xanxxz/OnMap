export const GOOD_LOCATION_ACCURACY_METERS = 40;
export const MAX_USABLE_LOCATION_ACCURACY_METERS = 250;
export const MAX_LOCATION_AGE_MS = 15_000;
export const MAX_FUTURE_LOCATION_SKEW_MS = 5_000;
// CoreLocation may not emit a new fix while the device is stationary.
export const LOCATION_STALE_AFTER_MS = 90_000;
export const MIN_VISIBLE_MOVEMENT_METERS = 5;

export interface LocationPosition {
  coords: {
    longitude: number;
    latitude: number;
    accuracy: number;
  };
  timestamp: number;
}

export interface QualifiedLocation {
  coordinate: [number, number];
  accuracy: number;
  timestamp: number;
}

/** MapLibre iOS reports Unix seconds; Android reports Unix milliseconds. */
export const locationTimestampMs = (timestamp: number, now: number): number =>
  now >= 1_000_000_000_000 && timestamp < 100_000_000_000
    ? timestamp * 1000
    : timestamp;

export const isLocationStale = (timestamp: number, now: number): boolean =>
  now - timestamp > LOCATION_STALE_AFTER_MS;

export const qualifyLocation = (
  position: LocationPosition,
  now: number,
): QualifiedLocation | null => {
  const {longitude, latitude, accuracy} = position.coords;
  const timestamp = locationTimestampMs(position.timestamp, now);
  const age = now - timestamp;

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > MAX_USABLE_LOCATION_ACCURACY_METERS ||
    !Number.isFinite(age) ||
    age > MAX_LOCATION_AGE_MS ||
    age < -MAX_FUTURE_LOCATION_SKEW_MS
  ) {
    return null;
  }

  return {
    coordinate: [longitude, latitude],
    accuracy,
    timestamp,
  };
};

const distanceMeters = (
  first: [number, number],
  second: [number, number],
): number => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const [firstLongitude, firstLatitude] = first;
  const [secondLongitude, secondLatitude] = second;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const firstLatitudeRadians = radians(firstLatitude);
  const secondLatitudeRadians = radians(secondLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

/** Suppresses small GPS wander, while allowing a materially better fix to correct position. */
export const shouldAcceptLocationUpdate = (
  previous: QualifiedLocation | null,
  next: QualifiedLocation,
): boolean => {
  if (!previous) {
    return true;
  }

  const accuracyImproved =
    previous.accuracy - next.accuracy >= Math.max(15, previous.accuracy * 0.35);

  if (accuracyImproved) {
    return true;
  }

  const jitterThreshold = Math.max(
    MIN_VISIBLE_MOVEMENT_METERS,
    Math.min(previous.accuracy, next.accuracy) * 0.25,
  );

  return distanceMeters(previous.coordinate, next.coordinate) >= jitterThreshold;
};

/** Freshen a stationary fix without moving the visible marker for GPS noise. */
export const mergeVisibleLocation = (
  previous: QualifiedLocation | null,
  next: QualifiedLocation,
): QualifiedLocation =>
  shouldAcceptLocationUpdate(previous, next) || !previous
    ? next
    : {...next, coordinate: previous.coordinate};
