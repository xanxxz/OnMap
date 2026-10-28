import { ValidationPipe } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { Request } from 'express';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { isAllowedHttpOrigin } from './cors/http-cors';
import { isOwnerAdminPath } from './owner-admin/owner-admin.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = configService.getOrThrow<number>('PORT');

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,

      forbidNonWhitelisted: true,

      transform: true,
    }),
  );

  app.enableCors(
    (
      request: Request,
      callback: (error: Error | null, options: CorsOptions) => void,
    ) => {
      callback(null, {
        origin: isAllowedHttpOrigin(
          request.originalUrl,
          request.headers.origin,
          configService.get<string>('CORS_ALLOWED_ORIGINS'),
          configService.get<string>('OWNER_ADMIN_ORIGIN'),
        ),
        credentials: true,
        ...(isOwnerAdminPath(request.originalUrl)
          ? {
              allowedHeaders: [
                'Content-Type',
                'Authorization',
                'Idempotency-Key',
              ],
              methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            }
          : {}),
      });
    },
  );

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  const url = await app.getUrl();

  console.log(`[RoadRadar] API: ${url}/api`);
  console.log(`[RoadRadar] Socket.IO: ${url}`);
}

void bootstrap();
