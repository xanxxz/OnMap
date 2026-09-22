import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import {
  roadEventRepository,
} from '../../../entities/road-event/api/httpRoadEventRepository';

import {
  RoadEventFeedbackInput,
} from '../../../entities/road-event/api/roadEventRepository';

import {
  RoadEventFeedbackAction,
} from '../../../entities/road-event/lib/roadEventFreshness';

import {
  upsertRealtimeRoadEvent,
} from '../../../entities/road-event/lib/roadEventRealtimeCache';

import { dpsActivitySummaryKey } from '../../../entities/road-event/model/useDpsActivitySummary';

import {
  ApiError,
} from '../../../shared/api/httpClient';

import {
  useRoadEventFeedbackStore,
} from './useRoadEventFeedbackStore';

interface DuplicateFeedbackBody {
  existingAction?: unknown;
}

const getExistingAction = (
  error: unknown,
):
  | RoadEventFeedbackAction
  | null => {
  if (
    !(error instanceof ApiError) ||
    error.status !== 409
  ) {
    return null;
  }

  if (
    typeof error.body !==
      'object' ||
    error.body === null
  ) {
    return null;
  }

  const body =
    error.body as
      DuplicateFeedbackBody;

  if (
    body.existingAction ===
      'CONFIRM' ||
    body.existingAction ===
      'REJECT'
  ) {
    return body.existingAction;
  }

  return null;
};

export const useRoadEventFeedback =
  () => {
    const queryClient =
      useQueryClient();

    const markFeedback =
      useRoadEventFeedbackStore(
        state =>
          state.markFeedback,
      );

    return useMutation({
      mutationFn:
        async (
          input:
            RoadEventFeedbackInput,
        ) => {
          return roadEventRepository.feedback(
            input,
          );
        },

      onSuccess: (
        event,
        variables,
      ) => {
        upsertRealtimeRoadEvent(
          queryClient,
          event,
        );

        if (event.type === 'ROAD_PATROL') {
          queryClient.invalidateQueries({
            queryKey: dpsActivitySummaryKey(variables.cityId),
          });
        }

        markFeedback(
          event.id,

          variables.action,
        );
      },

      onError: (
        error,
        variables,
      ) => {
        const existingAction =
          getExistingAction(
            error,
          );

        if (
          existingAction
        ) {
          markFeedback(
            variables.eventId,

            existingAction,
          );
        }
      },
    });
  };
