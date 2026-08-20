import {
  Controller,
  Get,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service';

interface PostgisVersionRow {
  postgisVersion: string;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  @Get()
  async getHealth() {
    const result =
      await this.prisma
        .$queryRaw<
          PostgisVersionRow[]
        >`
          SELECT
            PostGIS_Version()
              AS "postgisVersion"
        `;

    return {
      status: 'ok',

      service:
        'roadradar-api',

      database:
        'ok',

      postgis:
        result[0]
          ?.postgisVersion ??
        null,

      timestamp:
        new Date().toISOString(),
    };
  }
}