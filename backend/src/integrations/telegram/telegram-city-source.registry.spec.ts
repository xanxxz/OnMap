import type { ConfigService } from '@nestjs/config';

import {
  TELEGRAM_DEFAULT_CITY_ID,
  TelegramCitySourceRegistry,
} from './telegram-city-source.registry';

describe('TelegramCitySourceRegistry', () => {
  it('maps the legacy source env to Balakovo', () => {
    const registry = new TelegramCitySourceRegistry({
      get: jest.fn().mockReturnValue(' -1001 '),
    } as unknown as ConfigService);

    expect(registry.getConfiguredSources()).toEqual([
      { cityId: TELEGRAM_DEFAULT_CITY_ID, sourceChatId: '-1001' },
    ]);
  });

  it('resolves independent synthetic city sources only by exact chat id', () => {
    const sources = [
      { cityId: 'city-a', sourceChatId: '-1001' },
      { cityId: 'city-b', sourceChatId: '-1002' },
    ];

    expect(TelegramCitySourceRegistry.findByChatId(sources, '-1002')).toEqual(
      sources[1],
    );
    expect(
      TelegramCitySourceRegistry.findByChatId(sources, '-1003'),
    ).toBeUndefined();
  });
});
