import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PushDevicesController } from './push-devices.controller';
import { PushDevicesService } from './push-devices.service';
import { PushOutboxService } from './push-outbox.service';
import { PUSH_PROVIDER } from './push-provider';
import { ConfiguredPushProvider } from './configured-push-provider';

@Module({
  imports: [IdentityModule],
  controllers: [PushDevicesController],
  providers: [
    PushDevicesService,
    PushOutboxService,
    { provide: PUSH_PROVIDER, useClass: ConfiguredPushProvider },
  ],
  exports: [PushDevicesService, PushOutboxService],
})
export class PushModule {}
