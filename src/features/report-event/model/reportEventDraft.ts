import {RoadEventType} from '../../../entities/road-event/model/roadEvent';

export type ReportEventStep = 'TYPE' | 'CONFIRM';

export type ReportLocationSource =
  | 'CURRENT_LOCATION'
  | 'MAP_LONG_PRESS';

export interface ReportEventDraft {
  selectedType: RoadEventType | null;

  coordinate: [number, number] | null;

  locationSource: ReportLocationSource | null;
}