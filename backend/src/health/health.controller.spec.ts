jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock(
  '../integrations/telegram/runtime/telegram-ingestion-runtime.service',
  () => ({
    TelegramIngestionRuntimeService: class {},
  }),
);

import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { TelegramIngestionRuntimeService } from '../integrations/telegram/runtime/telegram-ingestion-runtime.service';
import { HealthController } from './health.controller';

describe('ingestion-aware API health', () => {
  it.each(['ok', 'disabled'] as const)(
    'accepts ingestion status %s',
    async (status) => {
      const controller = new HealthController(
        {
          $queryRaw: jest.fn().mockResolvedValue([{ postgisVersion: 'test' }]),
        } as unknown as PrismaService,
        {
          getHealth: () => ({
            status,
            runtimeStatus: status === 'ok' ? 'RUNNING' : 'DISABLED',
            lastSuccessfulSyncAt: null,
            lastProcessedAt: null,
          }),
        } as unknown as TelegramIngestionRuntimeService,
      );
      expect(await controller.getHealth()).toMatchObject({
        status: 'ok',
        telegramIngestion: { status },
      });
    },
  );

  it('returns 503 with safe ingestion status when the database is healthy but the Telegram worker is stale', async () => {
    const controller = new HealthController(
      {
        $queryRaw: jest.fn().mockResolvedValue([{ postgisVersion: 'test' }]),
      } as unknown as PrismaService,
      {
        getHealth: () => ({
          status: 'degraded',
          runtimeStatus: 'ERROR',
          lastSuccessfulSyncAt: null,
          lastProcessedAt: null,
        }),
      } as unknown as TelegramIngestionRuntimeService,
    );
    const error: unknown = await controller
      .getHealth()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const response = (error as ServiceUnavailableException).getResponse();
    expect(response).toMatchObject({
      status: 'degraded',
      database: 'ok',
      telegramIngestion: { status: 'degraded' },
    });
    expect(JSON.stringify(response)).not.toMatch(
      /sourceChatId|session|token|externalId|cursor/i,
    );
  });
});
