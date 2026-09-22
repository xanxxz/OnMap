import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { TelegramCitySource } from './telegram.types';

export const TELEGRAM_DEFAULT_CITY_ID = 'balakovo';

@Injectable()
export class TelegramCitySourceRegistry {
  constructor(private readonly configService: ConfigService) {}

  getConfiguredSources(): readonly TelegramCitySource[] {
    const sourceChatId =
      this.configService.get<string>('TELEGRAM_SOURCE_CHAT_ID')?.trim() ?? '';

    if (sourceChatId.length === 0) {
      return [];
    }

    return [
      {
        cityId: TELEGRAM_DEFAULT_CITY_ID,
        sourceChatId,
      },
    ];
  }

  getPrimarySource(): TelegramCitySource | undefined {
    return this.getConfiguredSources()[0];
  }

  static findByChatId(
    sources: readonly TelegramCitySource[],
    sourceChatId: string,
  ): TelegramCitySource | undefined {
    return sources.find((source) => source.sourceChatId === sourceChatId);
  }
}
