import { TomTomIntegrationError } from './tomtom.errors';
import type {
  CityBounds,
  ExternalRoadEvent,
  ExternalRoadEventGeometry,
  ExternalRoadEventType,
  TomTomIncidentEventPayload,
  TomTomSearchCandidate,
} from './tomtom.types';

const TITLE_BY_TYPE: Record<ExternalRoadEventType, string> = {
  TRAFFIC_JAM: 'Затруднение движения',
  ACCIDENT: 'ДТП',
  ROADWORKS: 'Дорожные работы',
  ROAD_CLOSURE: 'Перекрытие дороги',
  HAZARD: 'Опасность на дороге',
  OTHER: 'Дорожное событие',
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
};

const asFiniteNumber = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const asNonNegativeNumber = (value: unknown): number | null => {
  const number = asFiniteNumber(value);

  return number !== null && number >= 0 ? number : null;
};

const readCoordinate = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const longitude = asFiniteNumber(value[0]);
  const latitude = asFiniteNumber(value[1]);

  if (
    longitude === null ||
    latitude === null ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }

  return [longitude, latitude];
};

const isPointInsideBounds = (
  coordinate: [number, number],
  bounds: CityBounds,
): boolean => {
  const [longitude, latitude] = coordinate;

  return (
    longitude >= bounds.west &&
    longitude <= bounds.east &&
    latitude >= bounds.south &&
    latitude <= bounds.north
  );
};

const lineIntersectsBounds = (
  coordinates: Array<[number, number]>,
  bounds: CityBounds,
): boolean => {
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);

  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);

  return !(
    east < bounds.west ||
    west > bounds.east ||
    north < bounds.south ||
    south > bounds.north
  );
};

export const mapTomTomGeometry = (
  value: unknown,
  bounds: CityBounds,
): ExternalRoadEventGeometry | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === 'Point') {
    const coordinate = readCoordinate(value.coordinates);

    if (!coordinate || !isPointInsideBounds(coordinate, bounds)) {
      return null;
    }

    return {
      type: 'Point',
      coordinates: coordinate,
    };
  }

  if (value.type === 'LineString') {
    if (!Array.isArray(value.coordinates)) {
      return null;
    }

    const coordinates = value.coordinates.map(readCoordinate);

    if (
      coordinates.length < 2 ||
      coordinates.some((coordinate) => coordinate === null)
    ) {
      return null;
    }

    const validCoordinates = coordinates as Array<[number, number]>;

    if (!lineIntersectsBounds(validCoordinates, bounds)) {
      return null;
    }

    return {
      type: 'LineString',
      coordinates: validCoordinates,
    };
  }

  return null;
};

export const mapTomTomEventType = (
  iconCategory: number | null,
): ExternalRoadEventType => {
  switch (iconCategory) {
    case 1:
      return 'ACCIDENT';
    case 3:
      return 'HAZARD';
    case 6:
      return 'TRAFFIC_JAM';
    case 7:
    case 8:
      return 'ROAD_CLOSURE';
    case 9:
      return 'ROADWORKS';
    default:
      return 'OTHER';
  }
};

const readIncidentEvents = (value: unknown): TomTomIncidentEventPayload[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
};

const readRawCategory = (
  properties: Record<string, unknown>,
  events: TomTomIncidentEventPayload[],
): number | null => {
  return (
    asFiniteNumber(properties.iconCategory) ??
    asFiniteNumber(events[0]?.iconCategory)
  );
};

export const mapTomTomIncidentResponse = (
  payload: unknown,
  bounds: CityBounds,
  fetchedAt: string,
): ExternalRoadEvent[] => {
  if (!isRecord(payload) || !Array.isArray(payload.incidents)) {
    throw new TomTomIntegrationError(
      'INVALID_RESPONSE',
      'TomTom Traffic returned an invalid response',
    );
  }

  const mapped: ExternalRoadEvent[] = [];

  for (const rawIncident of payload.incidents) {
    if (!isRecord(rawIncident) || !isRecord(rawIncident.properties)) {
      continue;
    }

    const properties = rawIncident.properties;
    const externalId = asNonEmptyString(properties.id);
    const geometry = mapTomTomGeometry(rawIncident.geometry, bounds);

    if (!externalId || !geometry) {
      continue;
    }

    const events = readIncidentEvents(properties.events);
    const rawCategory = readRawCategory(properties, events);
    const type = mapTomTomEventType(rawCategory);
    const eventDescription = events
      .map((event) => asNonEmptyString(event.description))
      .find((description) => description !== null);
    const title = TITLE_BY_TYPE[type];

    mapped.push({
      externalId,
      source: 'TOMTOM',
      type,
      geometry,
      title,
      description: eventDescription ?? title,
      from: asNonEmptyString(properties.from),
      to: asNonEmptyString(properties.to),
      startTime: asNonEmptyString(properties.startTime),
      endTime: asNonEmptyString(properties.endTime),
      timeValidity: asNonEmptyString(properties.timeValidity),
      probabilityOfOccurrence: asNonEmptyString(
        properties.probabilityOfOccurrence,
      ),
      numberOfReports: asNonNegativeNumber(properties.numberOfReports),
      delaySeconds: asNonNegativeNumber(properties.delay),
      lengthMeters: asNonNegativeNumber(properties.length),
      updatedAt: asNonEmptyString(properties.lastReportTime),
      fetchedAt,
      rawCategory,
    });
  }

  return mapped;
};

const distanceMeters = (
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number => {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(haversine))),
  );
};

export const mapTomTomSearchResponse = (
  payload: unknown,
  bounds: CityBounds,
  center: { latitude: number; longitude: number },
  limit: number,
): TomTomSearchCandidate[] => {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new TomTomIntegrationError(
      'INVALID_RESPONSE',
      'TomTom Search returned an invalid response',
    );
  }

  const candidates: TomTomSearchCandidate[] = [];

  for (const rawResult of payload.results) {
    if (!isRecord(rawResult) || !isRecord(rawResult.position)) {
      continue;
    }

    const externalId = asNonEmptyString(rawResult.id);
    const latitude = asFiniteNumber(rawResult.position.lat);
    const longitude = asFiniteNumber(rawResult.position.lon);

    if (
      !externalId ||
      latitude === null ||
      longitude === null ||
      !isPointInsideBounds([longitude, latitude], bounds)
    ) {
      continue;
    }

    const poi = isRecord(rawResult.poi) ? rawResult.poi : null;
    const address = isRecord(rawResult.address) ? rawResult.address : null;
    const freeformAddress = asNonEmptyString(address?.freeformAddress);
    const name =
      asNonEmptyString(poi?.name) ??
      asNonEmptyString(address?.streetName) ??
      freeformAddress;

    if (!name) {
      continue;
    }

    const position = {
      latitude,
      longitude,
    };
    const providedDistance = asNonNegativeNumber(rawResult.dist);

    candidates.push({
      externalId,
      source: 'TOMTOM',
      name,
      address: freeformAddress,
      position,
      type: asNonEmptyString(rawResult.type) ?? 'Unknown',
      score: asFiniteNumber(rawResult.score) ?? 0,
      distanceMeters: providedDistance ?? distanceMeters(center, position),
    });

    if (candidates.length >= limit) {
      break;
    }
  }

  return candidates;
};
