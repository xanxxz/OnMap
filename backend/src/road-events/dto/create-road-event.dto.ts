import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import * as roadEventsConstants from '../road-events.constants';

export class CreateRoadEventDto {
  @IsString()
  @Length(1, 64)
  cityId!: string;

  @IsIn([
    ...roadEventsConstants.ROAD_EVENT_TYPES,
  ])
  type!: roadEventsConstants.RoadEventType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber(
    {},
    {
      each: true,
    },
  )
  coordinate!: [
    number,
    number,
  ];
}
