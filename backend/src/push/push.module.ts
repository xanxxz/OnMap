import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PushDevicesController } from './push-devices.controller';
import { PushDevicesService } from './push-devices.service';
import { PushOutboxService } from './push-outbox.service';
import { PUSH_PROVIDER } from './push-provider';
import { ConfiguredPushProvider } from './configured-push-provider';
import { PushCampaignSchedulerService } from './push-campaign-scheduler.service';
import { PushOwnerPairingService } from './push-owner-pairing.service';

@Module({
  imports: [IdentityModule],
  controllers: [PushDevicesController],
  providers: [
    PushDevicesService,
    PushOutboxService,
    PushCampaignSchedulerService,
    PushOwnerPairingService,
    { provide: PUSH_PROVIDER, useClass: ConfiguredPushProvider },
  ],
  exports: [
    PushDevicesService,
    PushOutboxService,
    PushCampaignSchedulerService,
    PushOwnerPairingService,
  ],
})
export class PushModule {}
