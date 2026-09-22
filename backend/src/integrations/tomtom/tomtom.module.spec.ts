import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { TomTomSearchProvider } from './tomtom-search.provider';
import { TomTomTrafficProvider } from './tomtom-traffic.provider';
import { TomTomModule } from './tomtom.module';

describe('TomTomModule', () => {
  it('initializes without TOMTOM_API_KEY and remains disabled until requested', async () => {
    const previousKey = process.env.TOMTOM_API_KEY;

    delete process.env.TOMTOM_API_KEY;

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            isGlobal: true,
          }),
          TomTomModule,
        ],
      }).compile();

      expect(moduleRef.get(TomTomTrafficProvider).isAvailable()).toBe(false);
      expect(moduleRef.get(TomTomSearchProvider).isAvailable()).toBe(false);

      await moduleRef.close();
    } finally {
      if (previousKey === undefined) {
        delete process.env.TOMTOM_API_KEY;
      } else {
        process.env.TOMTOM_API_KEY = previousKey;
      }
    }
  });
});
