import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
export class OwnerListQuery {
  @IsOptional() @IsString() @Length(1, 64) cityId?: string;
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']) status?:
    'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
export class OwnerStatsQuery {
  @IsOptional() @IsIn(['7', '30', 'ALL']) period: '7' | '30' | 'ALL' = '7';
  @IsOptional() @IsString() @Length(1, 64) cityId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
export class OwnerContactDto {
  @IsOptional() @IsUUID() id?: string;
  @IsIn(['PHONE', 'EMAIL', 'WEBSITE', 'TELEGRAM', 'OTHER']) type!:
    'PHONE' | 'EMAIL' | 'WEBSITE' | 'TELEGRAM' | 'OTHER';
  @IsString() @Length(1, 80) label!: string;
  @IsString() @Length(1, 500) value!: string;
  @IsInt() @Min(0) @Max(100) displayOrder!: number;
}
export class OwnerPointDto {
  @IsString() @Length(1, 64) cityId!: string;
  @IsString() @Length(1, 160) title!: string;
  @IsString() @Length(1, 64) category!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsOptional() @IsString() @MaxLength(240) displayAddress?: string | null;
  @IsString() @Length(7, 7) backgroundColor!: string;
  @IsString() @Length(7, 7) textColor!: string;
  @IsOptional() @IsString() @MaxLength(32) promoCode?: string | null;
  @IsOptional() @IsString() @MaxLength(240) promoTerms?: string | null;
  @IsString() @Length(20, 40) startsAt!: string;
  @IsString() @Length(20, 40) endsAt!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OwnerContactDto)
  contacts!: OwnerContactDto[];
  @IsOptional() @IsString() @Length(20, 40) expectedUpdatedAt?: string;
}
export class OwnerBannerDto {
  @IsString() @Length(1, 160) title!: string;
  @IsString() @Length(1, 300) text!: string;
  @IsString() @Length(1, 80) buttonLabel!: string;
  @IsString() @Length(1, 2048) buttonUrl!: string;
  @IsUUID() partnerPointId!: string;
  @IsString() @Length(20, 40) startsAt!: string;
  @IsString() @Length(20, 40) endsAt!: string;
  @IsOptional() @IsString() @Length(20, 40) expectedUpdatedAt?: string;
}
