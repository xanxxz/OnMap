import {RoadEventType} from '../../../entities/road-event/model/roadEvent';

export type ReportEventStep = 'TYPE' | 'CONFIRM';

export type ReportLocationSource =
  | 'CURRENT_LOCATION'
  | 'MAP_LONG_PRESS';

export type ReportLocationStatus =
  | 'IDLE'
  | 'LOCATING'
  | 'READY'
  | 'APPROXIMATE'
  | 'PERMISSION_DENIED'
  | 'UNAVAILABLE'
  | 'MANUAL';

export interface ReportEventDraft {
  selectedType: RoadEventType | null;

  coordinate: [number, number] | null;

  locationSource: ReportLocationSource | null;

  locationStatus: ReportLocationStatus;

  locationAccuracy: number | null;
}
