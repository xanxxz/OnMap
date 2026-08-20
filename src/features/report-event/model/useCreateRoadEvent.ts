import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import {
  CreateRoadEventInput,
} from '../../../entities/road-event/api/roadEventRepository';

import {
  roadEventRepository,
} from '../../../entities/road-event/api/httpRoadEventRepository';

import {
  roadEventKeys,
} from '../../../entities/road-event/model/useRoadEvents';

export const useCreateRoadEvent =
  () => {
    const queryClient =
      useQueryClient();

    return useMutation({
      mutationFn: (
        input:
          CreateRoadEventInput,
      ) => {
        return roadEventRepository.create(
          input,
        );
      },

      onSuccess: () => {
        void queryClient.invalidateQueries(
          {
            queryKey:
              roadEventKeys.all,
          },
        );
      },
    });
  };