import { Injectable } from '@nestjs/common';

import { TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';

import {
  TELEGRAM_CONNECTION_RETRIES,
  TELEGRAM_RECONNECT_RETRIES,
} from './telegram.constants';

export interface TelegramMtprotoConnectionConfig {
  readonly apiId: number;
  readonly apiHash: string;
  readonly session: string;
}

@Injectable()
export class TelegramMtprotoClientFactory {
  create(config: TelegramMtprotoConnectionConfig): TelegramClient {
    const client = new TelegramClient(
      new StringSession(config.session),
      config.apiId,
      config.apiHash,
      {
        autoReconnect: true,
        connectionRetries: TELEGRAM_CONNECTION_RETRIES,
        reconnectRetries: TELEGRAM_RECONNECT_RETRIES,
      },
    );

    client.setLogLevel(LogLevel.NONE);

    return client;
  }
}
