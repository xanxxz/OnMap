import { ValidationPipe } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { isAllowedOrigin, parseAllowedOrigins } from './cors/allowed-origins';

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

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) =>
      callback(
        null,
        isAllowedOrigin(
          origin,
          parseAllowedOrigins(
            configService.get<string>('CORS_ALLOWED_ORIGINS'),
          ),
        ),
      ),

    credentials: true,
  });

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  const url = await app.getUrl();

  console.log(`[RoadRadar] API: ${url}/api`);
  console.log(`[RoadRadar] Socket.IO: ${url}`);
}

void bootstrap();
