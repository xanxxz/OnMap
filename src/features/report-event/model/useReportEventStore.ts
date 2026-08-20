import {create} from 'zustand';

import {RoadEventType} from '../../../entities/road-event/model/roadEvent';

import {
  ReportEventStep,
  ReportLocationSource,
} from './reportEventDraft';

interface ReportEventState {
  isOpen: boolean;

  step: ReportEventStep;

  selectedType: RoadEventType | null;

  coordinate: [number, number] | null;

  locationSource: ReportLocationSource | null;

  openFromCurrentLocation: (
    coordinate: [number, number] | null,
  ) => void;

  openFromMap: (
    coordinate: [number, number],
  ) => void;

  selectType: (
    type: RoadEventType,
  ) => void;

  backToType: () => void;

  close: () => void;

  complete: () => void;
}

const createInitialState = () => ({
  isOpen: false,
  step: 'TYPE' as const,
  selectedType: null,
  coordinate: null,
  locationSource: null,
});

export const useReportEventStore =
  create<ReportEventState>(set => ({
    ...createInitialState(),

    openFromCurrentLocation: coordinate =>
      set({
        isOpen: true,
        step: 'TYPE',
        selectedType: null,
        coordinate,
        locationSource:
          'CURRENT_LOCATION',
      }),

    openFromMap: coordinate =>
      set({
        isOpen: true,
        step: 'TYPE',
        selectedType: null,
        coordinate,
        locationSource:
          'MAP_LONG_PRESS',
      }),

    selectType: type =>
      set({
        selectedType: type,
        step: 'CONFIRM',
      }),

    backToType: () =>
      set({
        step: 'TYPE',
      }),

    close: () =>
      set(createInitialState()),

    complete: () =>
      set(createInitialState()),
  }));