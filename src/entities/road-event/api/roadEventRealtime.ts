import {
  RoadEvent,
  RoadEventGeometry,
  LocationPrecision,
  RoadEventStatus,
  RoadEventType,
  RoadEventViewerRelation,
  TelegramRoadEvent,
  TomTomRoadEvent,
  TomTomRoadEventType,
  UserRoadEvent,
} from '../model/roadEvent';

export const ROAD_EVENT_REALTIME_EVENTS = {
  subscribe: 'road-events:subscribe',
  unsubscribe: 'road-events:unsubscribe',
  created: 'road-event:created',
  updated: 'road-event:updated',
  resolved: 'road-event:resolved',
} as const;

export interface RoadEventResolvedPayload {
  id: string;

  cityId: string;

  resolvedAt?: string;
}

const USER_ROAD_EVENT_TYPES: RoadEventType[] = [
  'ACCIDENT',
  'ROAD_CLOSURE',
  'ROADWORKS',
  'TRAFFIC',
  'ROAD_HAZARD',
  'TRAFFIC_LIGHT',
  'ROAD_SERVICE',
  'ROAD_PATROL',
  'OTHER',
];

const TOMTOM_ROAD_EVENT_TYPES: TomTomRoadEventType[] = [
  'TRAFFIC_JAM',
  'ACCIDENT',
  'ROADWORKS',
  'ROAD_CLOSURE',
  'HAZARD',
  'OTHER',
];

const ROAD_EVENT_STATUSES: RoadEventStatus[] = [
  'ACTIVE',
  'UNCONFIRMED',
  'STALE',
  'RESOLVED',
];

const LOCATION_PRECISIONS: LocationPrecision[] = [
  'EXACT',
  'INTERSECTION',
  'LANDMARK',
  'STREET',
  'AREA',
  'SETTLEMENT',
];

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isCoordinate = (value: unknown): value is [number, number] => {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
};

const parseGeometry = (value: unknown): RoadEventGeometry | null => {
  if (!isObject(value)) {
    return null;
  }

  if (value.type === 'Point' && isCoordinate(value.coordinates)) {
    return {
      type: 'Point',
      coordinates: value.coordinates,
    };
  }

  if (
    value.type === 'LineString' &&
    Array.isArray(value.coordinates) &&
    value.coordinates.length >= 2 &&
    value.coordinates.every(isCoordinate)
  ) {
    return {
      type: 'LineString',
      coordinates: value.coordinates,
    };
  }

  if (
    value.type === 'MultiLineString' &&
    Array.isArray(value.coordinates) &&
    value.coordinates.length > 0 &&
    value.coordinates.every(
      segment =>
        Array.isArray(segment) &&
        segment.length >= 2 &&
        segment.every(isCoordinate),
    )
  ) {
    return {
      type: 'MultiLineString',
      coordinates: value.coordinates,
    };
  }

  return null;
};

const isOptionalString = (
  value: unknown,
): value is string | null | undefined => {
  return value === undefined || value === null || typeof value === 'string';
};

const isOptionalNumber = (
  value: unknown,
): value is number | null | undefined => {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && Number.isFinite(value))
  );
};

const optionalString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const optionalNumber = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
};

const parseUserRoadEvent = (
  value: Record<string, unknown>,
): UserRoadEvent | null => {
  if (
    (value.source !== undefined && value.source !== 'USER') ||
    typeof value.id !== 'string' ||
    typeof value.cityId !== 'string' ||
    !USER_ROAD_EVENT_TYPES.includes(value.type as RoadEventType) ||
    !ROAD_EVENT_STATUSES.includes(value.status as RoadEventStatus) ||
    typeof value.title !== 'string' ||
    !isCoordinate(value.coordinate) ||
    typeof value.confirmationCount !== 'number' ||
    typeof value.rejectionCount !== 'number' ||
    typeof value.confidence !== 'number' ||
    typeof value.createdAt !== 'string' ||
    typeof value.expiresAt !== 'string'
  ) {
    return null;
  }

  const coordinate = value.coordinate;

  return {
    ...(value as Omit<UserRoadEvent, 'source' | 'geometry' | 'coordinate'>),
    source: 'USER',
    geometry: {
      type: 'Point',
      coordinates: coordinate,
    },
    coordinate,
  };
};

const parseTelegramRoadEvent = (
  value: Record<string, unknown>,
): TelegramRoadEvent | null => {
  const explicitGeometry = parseGeometry(value.geometry);

  if (
    value.source !== 'TELEGRAM' ||
    typeof value.id !== 'string' ||
    typeof value.cityId !== 'string' ||
    !USER_ROAD_EVENT_TYPES.includes(value.type as RoadEventType) ||
    !ROAD_EVENT_STATUSES.includes(value.status as RoadEventStatus) ||
    typeof value.title !== 'string' ||
    !isOptionalString(value.description) ||
    !isCoordinate(value.coordinate) ||
    !isOptionalString(value.lastConfirmedAt) ||
    typeof value.createdAt !== 'string' ||
    typeof value.expiresAt !== 'string'
  ) {
    return null;
  }

  const coordinate = value.coordinate;
  const geometry = explicitGeometry ?? {
    type: 'Point' as const,
    coordinates: coordinate,
  };
  const locationPrecision = LOCATION_PRECISIONS.includes(
    value.locationPrecision as LocationPrecision,
  )
    ? (value.locationPrecision as LocationPrecision)
    : 'EXACT';

  return {
    id: value.id,
    source: 'TELEGRAM',
    cityId: value.cityId,
    type: value.type as RoadEventType,
    status: value.status as RoadEventStatus,
    title: value.title,
    ...(optionalString(value.description) && {
      description: optionalString(value.description),
    }),
    coordinate,
    geometry,
    locationPrecision,
    ...(optionalString(value.sourceText) && {
      sourceText: optionalString(value.sourceText),
    }),
    ...(optionalString(value.locationLabel) && {
      locationLabel: optionalString(value.locationLabel),
    }),
    ...(optionalString(value.lastConfirmedAt) && {
      lastConfirmedAt: optionalString(value.lastConfirmedAt),
    }),
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    ...(optionalNumber(value.confirmationCount) !== undefined && {
      confirmationCount: optionalNumber(value.confirmationCount),
    }),
    ...(optionalNumber(value.rejectionCount) !== undefined && {
      rejectionCount: optionalNumber(value.rejectionCount),
    }),
    ...(optionalNumber(value.confidence) !== undefined && {
      confidence: optionalNumber(value.confidence),
    }),
    ...(['CREATOR', 'CONFIRM', 'REJECT'].includes(
      String(value.viewerRelation),
    ) && {
      viewerRelation: value.viewerRelation as RoadEventViewerRelation,
    }),
  };
};

const parseTomTomRoadEvent = (
  value: Record<string, unknown>,
): TomTomRoadEvent | null => {
  const geometry = parseGeometry(value.geometry);

  if (
    value.source !== 'TOMTOM' ||
    typeof value.id !== 'string' ||
    !value.id.startsWith('tomtom:') ||
    typeof value.cityId !== 'string' ||
    !TOMTOM_ROAD_EVENT_TYPES.includes(value.type as TomTomRoadEventType) ||
    typeof value.title !== 'string' ||
    !geometry ||
    !isOptionalString(value.description) ||
    !isOptionalString(value.from) ||
    !isOptionalString(value.to) ||
    !isOptionalString(value.startTime) ||
    !isOptionalString(value.endTime) ||
    !isOptionalString(value.timeValidity) ||
    !isOptionalString(value.updatedAt) ||
    typeof value.fetchedAt !== 'string' ||
    !isOptionalNumber(value.delaySeconds) ||
    !isOptionalNumber(value.lengthMeters)
  ) {
    return null;
  }

  return {
    id: value.id,
    source: 'TOMTOM',
    cityId: value.cityId,
    type: value.type as TomTomRoadEventType,
    geometry,
    title: value.title,
    ...(optionalString(value.description) && {
      description: optionalString(value.description),
    }),
    ...(optionalString(value.from) && { from: optionalString(value.from) }),
    ...(optionalString(value.to) && { to: optionalString(value.to) }),
    ...(optionalString(value.startTime) && {
      startTime: optionalString(value.startTime),
    }),
    ...(optionalString(value.endTime) && {
      endTime: optionalString(value.endTime),
    }),
    ...(optionalString(value.timeValidity) && {
      timeValidity: optionalString(value.timeValidity),
    }),
    ...(optionalString(value.updatedAt) && {
      updatedAt: optionalString(value.updatedAt),
    }),
    fetchedAt: value.fetchedAt,
    ...(optionalNumber(value.delaySeconds) !== undefined && {
      delaySeconds: optionalNumber(value.delaySeconds),
    }),
    ...(optionalNumber(value.lengthMeters) !== undefined && {
      lengthMeters: optionalNumber(value.lengthMeters),
    }),
  };
};

export const parseRoadEventPayload = (value: unknown): RoadEvent | null => {
  if (!isObject(value)) {
    return null;
  }

  switch (value.source) {
    case 'TOMTOM':
      return parseTomTomRoadEvent(value);

    case 'TELEGRAM':
      return parseTelegramRoadEvent(value);

    case 'USER':
    case undefined:
      return parseUserRoadEvent(value);

    default:
      return null;
  }
};

export const isRoadEventResolvedPayload = (
  value: unknown,
): value is RoadEventResolvedPayload => {
  if (!isObject(value)) {
    return false;
  }

  return typeof value.id === 'string' && typeof value.cityId === 'string';
};
