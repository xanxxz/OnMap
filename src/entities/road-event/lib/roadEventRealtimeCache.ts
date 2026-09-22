import { QueryClient, QueryKey } from '@tanstack/react-query';

import { MapBounds } from '../../../shared/types/map';

import { isCoordinateWithinBounds } from '../../../shared/lib/map/mapBounds';

import {
  RoadEvent,
  TelegramRoadEvent,
  UserRoadEvent,
} from '../model/roadEvent';

type RealtimeRoadEvent = UserRoadEvent | TelegramRoadEvent;

const ROAD_EVENT_VIEWPORT_KEY = ['road-events', 'viewport'] as const;

interface ViewportQuery {
  cityId: string;

  bounds: MapBounds;
}

const parseViewportQueryKey = (queryKey: QueryKey): ViewportQuery | null => {
  if (
    queryKey.length !== 7 ||
    queryKey[0] !== 'road-events' ||
    queryKey[1] !== 'viewport'
  ) {
    return null;
  }

  const cityId = queryKey[2];

  const west = queryKey[3];

  const south = queryKey[4];

  const east = queryKey[5];

  const north = queryKey[6];

  if (
    typeof cityId !== 'string' ||
    typeof west !== 'number' ||
    typeof south !== 'number' ||
    typeof east !== 'number' ||
    typeof north !== 'number'
  ) {
    return null;
  }

  return {
    cityId,

    bounds: [west, south, east, north],
  };
};

const shouldEventBeVisible = (
  event: RealtimeRoadEvent,

  viewport: ViewportQuery,
): boolean => {
  if (event.cityId !== viewport.cityId) {
    return false;
  }

  if (event.status === 'RESOLVED') {
    return false;
  }

  if (new Date(event.expiresAt).getTime() <= Date.now()) {
    return false;
  }

  if (event.geometry.type === 'Point') {
    return isCoordinateWithinBounds(
      event.geometry.coordinates,
      viewport.bounds,
    );
  }

  const lines =
    event.geometry.type === 'LineString'
      ? [event.geometry.coordinates]
      : event.geometry.coordinates;

  return lines.some(lineIntersectsBounds(viewport.bounds));
};

const lineIntersectsBounds =
  (bounds: MapBounds) =>
  (line: Array<[number, number]>): boolean => {
    if (line.some(coordinate => isCoordinateWithinBounds(coordinate, bounds))) {
      return true;
    }

    return line.slice(1).some((end, index) => {
      const start = line[index];

      return start !== undefined && segmentIntersectsBounds(start, end, bounds);
    });
  };

const segmentIntersectsBounds = (
  [startLongitude, startLatitude]: [number, number],
  [endLongitude, endLatitude]: [number, number],
  [west, south, east, north]: MapBounds,
): boolean => {
  const longitudeDelta = endLongitude - startLongitude;
  const latitudeDelta = endLatitude - startLatitude;
  const checks: Array<[number, number]> = [
    [-longitudeDelta, startLongitude - west],
    [longitudeDelta, east - startLongitude],
    [-latitudeDelta, startLatitude - south],
    [latitudeDelta, north - startLatitude],
  ];
  let minimum = 0;
  let maximum = 1;

  for (const [direction, distance] of checks) {
    if (direction === 0) {
      if (distance < 0) return false;
      continue;
    }

    const ratio = distance / direction;

    if (direction < 0) {
      if (ratio > maximum) return false;
      minimum = Math.max(minimum, ratio);
    } else {
      if (ratio < minimum) return false;
      maximum = Math.min(maximum, ratio);
    }
  }

  return true;
};

const mergeRoadEvent = (
  current: RoadEvent,

  incoming: RealtimeRoadEvent,
): RealtimeRoadEvent => {
  if (incoming.source === 'TELEGRAM') {
    return incoming;
  }

  return {
    ...incoming,

    viewerRelation:
      incoming.viewerRelation !== undefined
        ? incoming.viewerRelation
        : current.source === 'USER'
        ? current.viewerRelation
        : undefined,
  };
};

export const upsertRealtimeRoadEvent = (
  queryClient: QueryClient,

  event: RealtimeRoadEvent,
) => {
  const queries = queryClient.getQueriesData<RoadEvent[]>({
    queryKey: ROAD_EVENT_VIEWPORT_KEY,
  });

  queries.forEach(([queryKey, currentEvents]) => {
    if (!currentEvents) {
      return;
    }

    const viewport = parseViewportQueryKey(queryKey);

    if (!viewport) {
      return;
    }

    const existing = currentEvents.find(current => current.id === event.id);

    const visible = shouldEventBeVisible(event, viewport);

    if (!visible) {
      if (!existing) {
        return;
      }

      queryClient.setQueryData<RoadEvent[]>(
        queryKey,

        current => current?.filter(item => item.id !== event.id) ?? [],
      );

      return;
    }

    queryClient.setQueryData<RoadEvent[]>(
      queryKey,

      current => {
        const items = current ?? [];

        const index = items.findIndex(item => item.id === event.id);

        if (index < 0) {
          return [event, ...items];
        }

        return items.map(item =>
          item.id === event.id ? mergeRoadEvent(item, event) : item,
        );
      },
    );
  });
};

export const removeRealtimeRoadEvent = (
  queryClient: QueryClient,

  eventId: string,
) => {
  const queries = queryClient.getQueriesData<RoadEvent[]>({
    queryKey: ROAD_EVENT_VIEWPORT_KEY,
  });

  queries.forEach(([queryKey, currentEvents]) => {
    if (!currentEvents?.some(event => event.id === eventId)) {
      return;
    }

    queryClient.setQueryData<RoadEvent[]>(
      queryKey,

      current => current?.filter(event => event.id !== eventId) ?? [],
    );
  });
};
