import {create} from 'zustand';

import {RoadEventType} from '../../../entities/road-event/model/roadEvent';

import {
  ReportLocationStatus,
  ReportEventStep,
  ReportLocationSource,
} from './reportEventDraft';

interface ReportEventState {
  isOpen: boolean;

  step: ReportEventStep;

  selectedType: RoadEventType | null;

  coordinate: [number, number] | null;

  locationSource: ReportLocationSource | null;

  locationStatus: ReportLocationStatus;

  locationAccuracy: number | null;

  openForLocationLookup: () => void;

  setCurrentLocation: (
    coordinate: [number, number],
    accuracy: number,
    status: 'READY' | 'APPROXIMATE',
  ) => void;

  setLocationFailure: (
    status: 'PERMISSION_DENIED' | 'UNAVAILABLE',
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
  locationStatus: 'IDLE' as const,
  locationAccuracy: null,
});

export const useReportEventStore =
  create<ReportEventState>(set => ({
    ...createInitialState(),

    openForLocationLookup: () =>
      set({
        isOpen: true,
        step: 'TYPE',
        selectedType: null,
        coordinate: null,
        locationSource: 'CURRENT_LOCATION',
        locationStatus: 'LOCATING',
        locationAccuracy: null,
      }),

    setCurrentLocation: (coordinate, accuracy, status) =>
      set({
        coordinate,
        locationSource: 'CURRENT_LOCATION',
        locationStatus: status,
        locationAccuracy: accuracy,
      }),

    setLocationFailure: locationStatus =>
      set({
        coordinate: null,
        locationSource: 'CURRENT_LOCATION',
        locationStatus,
        locationAccuracy: null,
      }),

    openFromMap: coordinate =>
      set(state => ({
        isOpen: true,
        step: state.isOpen ? state.step : 'TYPE',
        selectedType: state.isOpen ? state.selectedType : null,
        coordinate,
        locationSource: 'MAP_LONG_PRESS',
        locationStatus: 'MANUAL',
        locationAccuracy: null,
      })),

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
