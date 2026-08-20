import {create} from 'zustand';

import {
  RoadEventType,
} from '../../../entities/road-event/model/roadEvent';

interface RoadEventFilterState {
  activeTypes:
    RoadEventType[];

  toggleType: (
    type: RoadEventType,
  ) => void;

  showAll: () => void;
}

export const useRoadEventFilterStore =
  create<RoadEventFilterState>(
    set => ({
      activeTypes: [],

      toggleType: type =>
        set(state => {
          const alreadyActive =
            state.activeTypes.includes(
              type,
            );

          if (alreadyActive) {
            return {
              activeTypes:
                state.activeTypes.filter(
                  item =>
                    item !== type,
                ),
            };
          }

          return {
            activeTypes: [
              ...state.activeTypes,
              type,
            ],
          };
        }),

      showAll: () =>
        set({
          activeTypes: [],
        }),
    }),
  );