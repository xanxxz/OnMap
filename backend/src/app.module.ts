import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from './database/database.module';

import { HealthModule } from './health/health.module';

import { IdentityModule } from './identity/identity.module';

import { TelegramIngestionRuntimeModule } from './integrations/telegram/runtime/telegram-ingestion-runtime.module';

import { TomTomModule } from './integrations/tomtom/tomtom.module';

import { RoadEventsModule } from './road-events/road-events.module';

import { WeatherModule } from './weather/weather.module';

const DEFAULT_PORT = 4000;

const MIN_TCP_PORT = 1;

const MAX_TCP_PORT = 65_535;

const MIN_IDENTITY_SIGNING_SECRET_LENGTH = 32;

export const validateEnvironment = (environment: Record<string, unknown>) => {
  const databaseUrl = environment.DATABASE_URL;

  if (typeof databaseUrl !== 'string' || databaseUrl.trim().length === 0) {
    throw new Error(
      '[Environment] DATABASE_URL is required and must be a non-empty string',
    );
  }

  const identitySigningSecret = environment.IDENTITY_SIGNING_SECRET;

  if (
    typeof identitySigningSecret !== 'string' ||
    identitySigningSecret.trim().length < MIN_IDENTITY_SIGNING_SECRET_LENGTH
  ) {
    throw new Error(
      `[Environment] IDENTITY_SIGNING_SECRET is required and must contain at least ${MIN_IDENTITY_SIGNING_SECRET_LENGTH} characters`,
    );
  }

  const configuredPort = environment.PORT;

  let port = DEFAULT_PORT;

  if (configuredPort !== undefined) {
    const normalizedPort =
      typeof configuredPort === 'string' ? configuredPort.trim() : '';

    if (!/^\d+$/.test(normalizedPort)) {
      throw new Error(
        `[Environment] PORT must be an integer between ${MIN_TCP_PORT} and ${MAX_TCP_PORT}`,
      );
    }

    port = Number(normalizedPort);

    if (!Number.isInteger(port) || port < MIN_TCP_PORT || port > MAX_TCP_PORT) {
      throw new Error(
        `[Environment] PORT must be an integer between ${MIN_TCP_PORT} and ${MAX_TCP_PORT}`,
      );
    }
  }

  return {
    ...environment,

    DATABASE_URL: databaseUrl.trim(),

    IDENTITY_SIGNING_SECRET: identitySigningSecret,

    PORT: port,
  };
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,

      validate: validateEnvironment,
    }),

    DatabaseModule,

    HealthModule,

    IdentityModule,

    TelegramIngestionRuntimeModule,

    TomTomModule,

    RoadEventsModule,

    WeatherModule,
  ],
})
export class AppModule {}
