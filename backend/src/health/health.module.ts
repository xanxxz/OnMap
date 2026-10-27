import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { TelegramIngestionRuntimeModule } from '../integrations/telegram/runtime/telegram-ingestion-runtime.module';

@Module({
  imports: [TelegramIngestionRuntimeModule],
  controllers: [HealthController],
})
export class HealthModule {}
