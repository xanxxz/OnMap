import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { TelegramIngestionRuntimeService } from '../integrations/telegram/runtime/telegram-ingestion-runtime.service';

interface PostgisVersionRow {
  postgisVersion: string;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramIngestionRuntimeService,
  ) {}

  @Get()
  async getHealth() {
    const result = await this.prisma.$queryRaw<PostgisVersionRow[]>`
          SELECT
            PostGIS_Version()
              AS "postgisVersion"
        `;

    const telegramIngestion = this.telegram.getHealth();
    const health = {
      status: 'ok',

      service: 'roadradar-api',

      database: 'ok',

      postgis: result[0]?.postgisVersion ?? null,

      timestamp: new Date().toISOString(),
      telegramIngestion,
    };
    if (telegramIngestion.status === 'degraded') {
      throw new ServiceUnavailableException({ ...health, status: 'degraded' });
    }
    return health;
  }
}
