import {
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';

import {
  MapBounds,
} from '../../../shared/types/map';

import {
  isCoordinateWithinBounds,
} from '../../../shared/lib/map/mapBounds';

import {
  RoadEvent,
} from '../model/roadEvent';

const ROAD_EVENT_VIEWPORT_KEY = [
  'road-events',
  'viewport',
] as const;

interface ViewportQuery {
  cityId: string;

  bounds:
    MapBounds;
}

const parseViewportQueryKey = (
  queryKey:
    QueryKey,
): ViewportQuery | null => {
  if (
    queryKey.length !== 7 ||
    queryKey[0] !==
      'road-events' ||
    queryKey[1] !==
      'viewport'
  ) {
    return null;
  }

  const cityId =
    queryKey[2];

  const west =
    queryKey[3];

  const south =
    queryKey[4];

  const east =
    queryKey[5];

  const north =
    queryKey[6];

  if (
    typeof cityId !==
      'string' ||
    typeof west !==
      'number' ||
    typeof south !==
      'number' ||
    typeof east !==
      'number' ||
    typeof north !==
      'number'
  ) {
    return null;
  }

  return {
    cityId,

    bounds: [
      west,
      south,
      east,
      north,
    ],
  };
};

const shouldEventBeVisible = (
  event:
    RoadEvent,

  viewport:
    ViewportQuery,
): boolean => {
  if (
    event.cityId !==
    viewport.cityId
  ) {
    return false;
  }

  if (
    event.status ===
    'RESOLVED'
  ) {
    return false;
  }

  if (
    new Date(
      event.expiresAt,
    ).getTime() <= Date.now()
  ) {
    return false;
  }

  return isCoordinateWithinBounds(
    event.coordinate,

    viewport.bounds,
  );
};

const mergeRoadEvent = (
  current:
    RoadEvent,

  incoming:
    RoadEvent,
): RoadEvent => {
  return {
    ...incoming,

    viewerRelation:
      incoming.viewerRelation !==
      undefined
        ? incoming.viewerRelation
        : current.viewerRelation,
  };
};

export const upsertRealtimeRoadEvent = (
  queryClient:
    QueryClient,

  event:
    RoadEvent,
) => {
  const queries =
    queryClient.getQueriesData<
      RoadEvent[]
    >({
      queryKey:
        ROAD_EVENT_VIEWPORT_KEY,
    });

  queries.forEach(
    ([
      queryKey,
      currentEvents,
    ]) => {
      if (!currentEvents) {
        return;
      }

      const viewport =
        parseViewportQueryKey(
          queryKey,
        );

      if (!viewport) {
        return;
      }

      const existing =
        currentEvents.find(
          current =>
            current.id ===
            event.id,
        );

      const visible =
        shouldEventBeVisible(
          event,
          viewport,
        );

      if (!visible) {
        if (!existing) {
          return;
        }

        queryClient.setQueryData<
          RoadEvent[]
        >(
          queryKey,

          current =>
            current?.filter(
              item =>
                item.id !==
                event.id,
            ) ?? [],
        );

        return;
      }

      queryClient.setQueryData<
        RoadEvent[]
      >(
        queryKey,

        current => {
          const items =
            current ?? [];

          const index =
            items.findIndex(
              item =>
                item.id ===
                event.id,
            );

          if (index < 0) {
            return [
              event,
              ...items,
            ];
          }

          return items.map(
            item =>
              item.id ===
              event.id
                ? mergeRoadEvent(
                    item,
                    event,
                  )
                : item,
          );
        },
      );
    },
  );
};

export const removeRealtimeRoadEvent = (
  queryClient:
    QueryClient,

  eventId: string,
) => {
  const queries =
    queryClient.getQueriesData<
      RoadEvent[]
    >({
      queryKey:
        ROAD_EVENT_VIEWPORT_KEY,
    });

  queries.forEach(
    ([
      queryKey,
      currentEvents,
    ]) => {
      if (
        !currentEvents?.some(
          event =>
            event.id ===
            eventId,
        )
      ) {
        return;
      }

      queryClient.setQueryData<
        RoadEvent[]
      >(
        queryKey,

        current =>
          current?.filter(
            event =>
              event.id !==
              eventId,
          ) ?? [],
      );
    },
  );
};