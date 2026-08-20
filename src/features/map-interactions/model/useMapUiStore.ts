import {
  create,
} from 'zustand';

interface MapUiState {
  selectedEventId:
    | string
    | null;

  selectEvent: (
    eventId: string,
  ) => void;

  clearSelectedEvent:
    () => void;
}

export const useMapUiStore =
  create<MapUiState>(
    set => ({
      selectedEventId:
        null,

      selectEvent:
        eventId =>
          set({
            selectedEventId:
              eventId,
          }),

      clearSelectedEvent:
        () =>
          set({
            selectedEventId:
              null,
          }),
    }),
  );