import { Module } from '@nestjs/common';

import { TelegramMtprotoClientFactory } from './telegram-mtproto-client.factory';
import { TelegramCitySourceRegistry } from './telegram-city-source.registry';
import { TelegramMtprotoClient } from './telegram-mtproto.client';
import { TelegramMtprotoSource } from './telegram-mtproto.source';

@Module({
  providers: [
    TelegramMtprotoClientFactory,
    TelegramCitySourceRegistry,
    TelegramMtprotoClient,
    TelegramMtprotoSource,
  ],
  exports: [TelegramMtprotoSource],
})
export class TelegramModule {}
