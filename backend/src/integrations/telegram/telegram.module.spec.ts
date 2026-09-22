import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { TelegramMtprotoSource } from './telegram-mtproto.source';
import { TelegramModule } from './telegram.module';

describe('TelegramModule', () => {
  it('initializes safely without Telegram credentials', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        TelegramModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn().mockReturnValue(undefined) })
      .compile();

    const source = moduleRef.get(TelegramMtprotoSource);

    expect(source.isAvailable()).toBe(false);
    await moduleRef.close();
  });
});
