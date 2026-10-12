import { Global, Module } from '@nestjs/common';
import { TelegramSingletonLockService } from './telegram-singleton-lock.service';

@Global()
@Module({
  providers: [TelegramSingletonLockService],
  exports: [TelegramSingletonLockService],
})
export class TelegramSingletonLockModule {}
