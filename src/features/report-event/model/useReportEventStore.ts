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

  setManualLocation: (coordinate: [number, number]) => void;

  beginLocationLookup: () => void;

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
      set(state =>
        state.isOpen && state.locationSource === 'CURRENT_LOCATION'
          ? {
              coordinate,
              locationSource: 'CURRENT_LOCATION',
              locationStatus: status,
              locationAccuracy: accuracy,
            }
          : state,
      ),

    setLocationFailure: locationStatus =>
      set(state =>
        state.isOpen && state.locationSource === 'CURRENT_LOCATION'
          ? {
              coordinate: null,
              locationSource: 'CURRENT_LOCATION',
              locationStatus,
              locationAccuracy: null,
            }
          : state,
      ),

    setManualLocation: coordinate =>
      set(state =>
        state.isOpen
          ? {
              coordinate,
              locationSource: 'MAP_LONG_PRESS',
              locationStatus: 'MANUAL',
              locationAccuracy: null,
            }
          : state,
      ),

    beginLocationLookup: () =>
      set(state =>
        state.isOpen
          ? {
              coordinate: null,
              locationSource: 'CURRENT_LOCATION',
              locationStatus: 'LOCATING',
              locationAccuracy: null,
            }
          : state,
      ),

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
