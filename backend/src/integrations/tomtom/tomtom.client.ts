import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TOMTOM_REQUEST_TIMEOUT_MS } from './tomtom.constants';
import { TomTomIntegrationError } from './tomtom.errors';

@Injectable()
export class TomTomClient {
  private readonly logger = new Logger(TomTomClient.name);

  constructor(private readonly configService: ConfigService) {}

  isAvailable(): boolean {
    return this.getApiKey().length > 0;
  }

  async requestJson(
    operation: string,
    endpoint: string,
    query: Record<string, string>,
  ): Promise<unknown> {
    const apiKey = this.getApiKey();

    if (apiKey.length === 0) {
      throw new TomTomIntegrationError(
        'DISABLED',
        'TomTom integration is disabled because TOMTOM_API_KEY is not configured',
      );
    }

    const url = new URL(endpoint);

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set('key', apiKey);

    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, TOMTOM_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: abortController.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.warn(`${operation} failed with HTTP ${response.status}`);

        throw new TomTomIntegrationError(
          'HTTP_ERROR',
          `TomTom ${operation} request failed`,
          response.status,
        );
      }

      try {
        return await response.json();
      } catch {
        this.logger.warn(`${operation} returned invalid JSON`);

        throw new TomTomIntegrationError(
          'INVALID_RESPONSE',
          `TomTom ${operation} returned invalid JSON`,
        );
      }
    } catch (error) {
      if (error instanceof TomTomIntegrationError) {
        throw error;
      }

      if (abortController.signal.aborted) {
        this.logger.warn(`${operation} timed out`);

        throw new TomTomIntegrationError(
          'TIMEOUT',
          `TomTom ${operation} timed out`,
        );
      }

      this.logger.warn(`${operation} request failed`);

      throw new TomTomIntegrationError(
        'HTTP_ERROR',
        `TomTom ${operation} request failed`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private getApiKey(): string {
    return this.configService.get<string>('TOMTOM_API_KEY')?.trim() ?? '';
  }
}
