import {
  RoadEvent,
  RoadEventStatus,
  RoadEventType,
} from '../model/roadEvent';

export const ROAD_EVENT_REALTIME_EVENTS =
  {
    subscribe:
      'road-events:subscribe',

    unsubscribe:
      'road-events:unsubscribe',

    created:
      'road-event:created',

    updated:
      'road-event:updated',

    resolved:
      'road-event:resolved',
  } as const;

export interface RoadEventResolvedPayload {
  id: string;

  cityId: string;

  resolvedAt?: string;
}

const ROAD_EVENT_TYPES:
  RoadEventType[] = [
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

const ROAD_EVENT_STATUSES:
  RoadEventStatus[] = [
  'ACTIVE',
  'UNCONFIRMED',
  'STALE',
  'RESOLVED',
];

const isObject = (
  value: unknown,
): value is Record<
  string,
  unknown
> => {
  return (
    typeof value ===
      'object' &&
    value !== null
  );
};

const isRoadEventType = (
  value: unknown,
): value is RoadEventType => {
  return (
    typeof value ===
      'string' &&
    ROAD_EVENT_TYPES.includes(
      value as RoadEventType,
    )
  );
};

const isRoadEventStatus = (
  value: unknown,
): value is RoadEventStatus => {
  return (
    typeof value ===
      'string' &&
    ROAD_EVENT_STATUSES.includes(
      value as RoadEventStatus,
    )
  );
};

const isCoordinate = (
  value: unknown,
): value is [
  number,
  number,
] => {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] ===
      'number' &&
    typeof value[1] ===
      'number'
  );
};

export const isRoadEventPayload =
  (
    value: unknown,
  ): value is RoadEvent => {
    if (!isObject(value)) {
      return false;
    }

    return (
      typeof value.id ===
        'string' &&
      typeof value.cityId ===
        'string' &&
      isRoadEventType(
        value.type,
      ) &&
      isRoadEventStatus(
        value.status,
      ) &&
      typeof value.title ===
        'string' &&
      isCoordinate(
        value.coordinate,
      ) &&
      typeof value
        .confirmationCount ===
        'number' &&
      typeof value
        .rejectionCount ===
        'number' &&
      typeof value.confidence ===
        'number' &&
      typeof value.createdAt ===
        'string' &&
      typeof value.expiresAt ===
        'string'
    );
  };

export const isRoadEventResolvedPayload =
  (
    value: unknown,
  ): value is RoadEventResolvedPayload => {
    if (!isObject(value)) {
      return false;
    }

    return (
      typeof value.id ===
        'string' &&
      typeof value.cityId ===
        'string'
    );
  };