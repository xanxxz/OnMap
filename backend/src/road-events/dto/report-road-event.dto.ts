import { IsIn } from 'class-validator';

export const ROAD_EVENT_REPORT_REASONS = [
  'WRONG_TYPE',
  'WRONG_LOCATION',
  'DUPLICATE',
  'OTHER_ABUSE',
] as const;

export type RoadEventReportReason = (typeof ROAD_EVENT_REPORT_REASONS)[number];

export class ReportRoadEventDto {
  @IsIn([...ROAD_EVENT_REPORT_REASONS])
  reason!: RoadEventReportReason;
}
