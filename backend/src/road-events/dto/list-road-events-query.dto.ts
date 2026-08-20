import {
  Type,
} from 'class-transformer';

import {
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ListRoadEventsQueryDto {
  @IsString()
  @Length(1, 64)
  cityId!: string;

  @IsString()
  @Length(16, 128)
  installationId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  west!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  south!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  east!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  north!: number;
}