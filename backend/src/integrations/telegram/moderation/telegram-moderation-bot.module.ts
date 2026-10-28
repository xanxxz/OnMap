import { Module } from '@nestjs/common';
import { RoadEventsModule } from '../../../road-events/road-events.module';
import { TelegramModerationBotService } from './telegram-moderation-bot.service';
import { TelegramSingletonLockModule } from '../telegram-singleton-lock.module';
import { PartnerBotService } from '../../../partner-placements/partner-bot.service';
import { PushCampaignBotService } from '../../../push/push-campaign-bot.service';
import { TelegramOwnerPanelService } from './telegram-owner-panel.service';
import { PushModule } from '../../../push/push.module';
import { OwnerAdminModule } from '../../../owner-admin/owner-admin.module';

@Module({
  imports: [
    RoadEventsModule,
    TelegramSingletonLockModule,
    PushModule,
    OwnerAdminModule,
  ],
  providers: [
    TelegramModerationBotService,
    PartnerBotService,
    PushCampaignBotService,
    TelegramOwnerPanelService,
  ],
})
export class TelegramModerationBotModule {}
