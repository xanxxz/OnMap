import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AnonymousIdentityId } from '../identity/anonymous-identity.decorator';
import { AnonymousIdentityGuard } from '../identity/anonymous-identity.guard';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { BindOwnerTestDeviceDto } from './dto/bind-owner-test-device.dto';
import { PushDevicesService } from './push-devices.service';
import { PushOwnerPairingService } from './push-owner-pairing.service';

@Controller('push/devices')
@UseGuards(AnonymousIdentityGuard)
export class PushDevicesController {
  constructor(
    private readonly devices: PushDevicesService,
    private readonly pairing: PushOwnerPairingService,
  ) {}

  @Post()
  register(
    @AnonymousIdentityId() identityId: string,
    @Body() input: RegisterPushDeviceDto,
  ) {
    return this.devices.register(identityId, input);
  }

  @Post('owner-test-pairing')
  bindOwnerTestDevice(
    @AnonymousIdentityId() identityId: string,
    @Body() input: BindOwnerTestDeviceDto,
  ) {
    return this.pairing.bindDevice(
      identityId,
      input.installationId,
      input.code,
    );
  }

  @Delete(':installationId')
  revoke(
    @AnonymousIdentityId() identityId: string,
    @Param('installationId', ParseUUIDPipe) installationId: string,
  ) {
    return this.devices.revoke(identityId, installationId);
  }
}
