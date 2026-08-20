import {
  useQuery,
} from '@tanstack/react-query';

import {
  MapBounds,
} from '../../../shared/types/map';

import {
  roadEventRepository,
} from '../api/httpRoadEventRepository';

export const roadEventKeys = {
  all: [
    'road-events',
  ] as const,

  viewport: (
    cityId: string,
    bounds: MapBounds,
  ) =>
    [
      ...roadEventKeys.all,

      'viewport',

      cityId,

      ...bounds,
    ] as const,
};

export const useRoadEvents = (
  cityId: string,

  bounds:
    | MapBounds
    | null,
) => {
  return useQuery({
    queryKey: bounds
      ? roadEventKeys.viewport(
          cityId,
          bounds,
        )
      : [
          ...roadEventKeys.all,

          'viewport',

          cityId,

          'pending',
        ],

    enabled:
      bounds !== null,

    queryFn: async () => {
      if (!bounds) {
        return [];
      }

      return roadEventRepository.list(
        {
          cityId,

          bounds,
        },
      );
    },

    staleTime: 15_000,

    refetchInterval: 30_000,

    refetchIntervalInBackground:
      false,

    retry: 2,

    placeholderData:
      previousData =>
        previousData,
  });
};