import { Module } from '@nestjs/common';
import { RoadEventsModule } from '../../../road-events/road-events.module';
import { TelegramModerationBotService } from './telegram-moderation-bot.service';
import { TelegramSingletonLockModule } from '../telegram-singleton-lock.module';
import { PartnerBotService } from '../../../partner-placements/partner-bot.service';

@Module({
  imports: [RoadEventsModule, TelegramSingletonLockModule],
  providers: [TelegramModerationBotService, PartnerBotService],
})
export class TelegramModerationBotModule {}
