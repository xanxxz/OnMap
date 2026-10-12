import { IsEnum, IsString, IsUUID, Length, Matches } from 'class-validator';

export enum PushClientPlatform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
}

export enum PushClientProvider {
  APNS = 'APNS',
  FCM = 'FCM',
}

export class RegisterPushDeviceDto {
  @IsUUID('4')
  installationId!: string;

  @IsString()
  @Length(1, 64)
  cityId!: string;

  @IsEnum(PushClientPlatform)
  platform!: PushClientPlatform;

  @IsEnum(PushClientProvider)
  provider!: PushClientProvider;

  @IsString()
  @Length(20, 512)
  @Matches(/^[A-Za-z0-9_:.-]+$/u)
  token!: string;
}
