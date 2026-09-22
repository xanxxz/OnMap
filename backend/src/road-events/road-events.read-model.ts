import type {
  CityBounds,
  ExternalRoadEvent,
  ExternalRoadEventGeometry,
} from '../integrations/tomtom/tomtom.types';

import type {
  RoadEventResponse,
  TelegramRoadEventListItem,
  TomTomRoadEventListItem,
  UserRoadEventListItem,
} from './road-events.types';

const isPointInsideBounds = (
  [longitude, latitude]: [number, number],
  bounds: CityBounds,
): boolean => {
  return (
    longitude >= bounds.west &&
    longitude <= bounds.east &&
    latitude >= bounds.south &&
    latitude <= bounds.north
  );
};

const segmentIntersectsBounds = (
  [startLongitude, startLatitude]: [number, number],
  [endLongitude, endLatitude]: [number, number],
  bounds: CityBounds,
): boolean => {
  const longitudeDelta = endLongitude - startLongitude;
  const latitudeDelta = endLatitude - startLatitude;
  const checks: Array<[number, number]> = [
    [-longitudeDelta, startLongitude - bounds.west],
    [longitudeDelta, bounds.east - startLongitude],
    [-latitudeDelta, startLatitude - bounds.south],
    [latitudeDelta, bounds.north - startLatitude],
  ];
  let minimum = 0;
  let maximum = 1;

  for (const [direction, distance] of checks) {
    if (direction === 0) {
      if (distance < 0) {
        return false;
      }

      continue;
    }

    const ratio = distance / direction;

    if (direction < 0) {
      if (ratio > maximum) {
        return false;
      }

      minimum = Math.max(minimum, ratio);
    } else {
      if (ratio < minimum) {
        return false;
      }

      maximum = Math.min(maximum, ratio);
    }
  }

  return true;
};

export const geometryIntersectsBounds = (
  geometry: ExternalRoadEventGeometry,
  bounds: CityBounds,
): boolean => {
  if (geometry.type === 'Point') {
    return isPointInsideBounds(geometry.coordinates, bounds);
  }

  const lines =
    geometry.type === 'LineString'
      ? [geometry.coordinates]
      : geometry.coordinates;

  if (
    lines.some((line) =>
      line.some((coordinate) => isPointInsideBounds(coordinate, bounds)),
    )
  ) {
    return true;
  }

  return lines.some((line) =>
    line.slice(1).some((end, index) => {
      const start = line[index];

      return start ? segmentIntersectsBounds(start, end, bounds) : false;
    }),
  );
};

export const toUserRoadEventListItem = (
  event: RoadEventResponse,
): UserRoadEventListItem => {
  return {
    ...event,
    source: 'USER',
    geometry: {
      type: 'Point',
      coordinates: event.coordinate,
    },
  };
};

export const toTelegramRoadEventListItem = (
  event: RoadEventResponse,
): TelegramRoadEventListItem => {
  const geometry = event.geometry ?? {
    type: 'Point' as const,
    coordinates: event.coordinate,
  };

  return {
    ...event,
    source: 'TELEGRAM',
    geometry,
    locationPrecision: event.locationPrecision ?? 'EXACT',
    ...(event.sourceText ? { sourceText: event.sourceText } : {}),
    ...(event.locationLabel ? { locationLabel: event.locationLabel } : {}),
  };
};

export const toTomTomRoadEventListItem = (
  cityId: string,
  incident: ExternalRoadEvent,
): TomTomRoadEventListItem => {
  return {
    id: `tomtom:${incident.externalId}`,
    source: 'TOMTOM',
    cityId,
    type: incident.type,
    geometry: incident.geometry,
    title: incident.title,
    description: incident.description,
    from: incident.from,
    to: incident.to,
    startTime: incident.startTime,
    endTime: incident.endTime,
    timeValidity: incident.timeValidity,
    updatedAt: incident.updatedAt,
    fetchedAt: incident.fetchedAt,
    delaySeconds: incident.delaySeconds,
    lengthMeters: incident.lengthMeters,
  };
};
