import { IsString, IsUUID, Matches } from 'class-validator';

export class BindOwnerTestDeviceDto {
  @IsUUID()
  installationId!: string;

  @IsString()
  @Matches(/^[A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4}-?[A-Fa-f0-9]{4}$/u)
  code!: string;
}
