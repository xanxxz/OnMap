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
import { PushDevicesService } from './push-devices.service';

@Controller('push/devices')
@UseGuards(AnonymousIdentityGuard)
export class PushDevicesController {
  constructor(private readonly devices: PushDevicesService) {}

  @Post()
  register(
    @AnonymousIdentityId() identityId: string,
    @Body() input: RegisterPushDeviceDto,
  ) {
    return this.devices.register(identityId, input);
  }

  @Delete(':installationId')
  revoke(
    @AnonymousIdentityId() identityId: string,
    @Param('installationId', ParseUUIDPipe) installationId: string,
  ) {
    return this.devices.revoke(identityId, installationId);
  }
}
