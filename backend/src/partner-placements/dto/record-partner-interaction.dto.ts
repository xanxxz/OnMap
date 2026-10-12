import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum PartnerInteractionAction {
  POINT_OPEN = 'POINT_OPEN',
  CONTACT_CLICK = 'CONTACT_CLICK',
  BANNER_IMPRESSION = 'BANNER_IMPRESSION',
  BANNER_CLICK = 'BANNER_CLICK',
}

export class RecordPartnerInteractionDto {
  @IsEnum(PartnerInteractionAction)
  action!: PartnerInteractionAction;

  @IsUUID()
  targetId!: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;
}
