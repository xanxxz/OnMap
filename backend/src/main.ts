import {
  ValidationPipe,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  NestFactory,
} from '@nestjs/core';

import {
  AppModule,
} from './app.module';

async function bootstrap() {
  const app =
    await NestFactory.create(
      AppModule,
    );

  const configService =
    app.get(
      ConfigService,
    );

  const port =
    configService.getOrThrow<number>(
      'PORT',
    );

  app.setGlobalPrefix(
    'api',
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,

      forbidNonWhitelisted:
        true,

      transform: true,
    }),
  );

  app.enableCors({
    origin: true,

    credentials: true,
  });

  app.enableShutdownHooks();

  await app.listen(
    port,
    '0.0.0.0',
  );

  console.log(
    `[RoadRadar] API: http://localhost:${port}/api`,
  );

  console.log(
    `[RoadRadar] Socket.IO: http://localhost:${port}`,
  );
}

void bootstrap();
