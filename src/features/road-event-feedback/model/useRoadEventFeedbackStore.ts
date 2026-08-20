import {
  createAsyncStorage,
} from '@react-native-async-storage/async-storage';

import {
  create,
} from 'zustand';

import {
  createJSONStorage,
  persist,
} from 'zustand/middleware';

import {
  RoadEventFeedbackAction,
} from '../../../entities/road-event/lib/roadEventFreshness';

const feedbackStorage =
  createAsyncStorage(
    'roadradarFeedback',
  );

const zustandStorage = {
  getItem: (
    name: string,
  ) => {
    return feedbackStorage.getItem(
      name,
    );
  },

  setItem: (
    name: string,
    value: string,
  ) => {
    return feedbackStorage.setItem(
      name,
      value,
    );
  },

  removeItem: (
    name: string,
  ) => {
    return feedbackStorage.removeItem(
      name,
    );
  },
};

interface RoadEventFeedbackState {
  feedbackByEventId: Record<
    string,
    RoadEventFeedbackAction
  >;

  markFeedback: (
    eventId: string,

    action:
      RoadEventFeedbackAction,
  ) => void;
}

export const useRoadEventFeedbackStore =
  create<RoadEventFeedbackState>()(
    persist(
      set => ({
        feedbackByEventId:
          {},

        markFeedback: (
          eventId,
          action,
        ) =>
          set(state => ({
            feedbackByEventId: {
              ...state.feedbackByEventId,

              [eventId]:
                action,
            },
          })),
      }),

      {
        name:
          'road-event-feedback',

        storage:
          createJSONStorage(
            () =>
              zustandStorage,
          ),

        partialize:
          state => ({
            feedbackByEventId:
              state.feedbackByEventId,
          }),
      },
    ),
  );