import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCityConfig } from '../cities/city.registry';

import type { CurrentWeather, YandexWeatherResponse } from './weather.types';

const YANDEX_WEATHER_ENDPOINT = 'https://api.weather.yandex.ru/v2/informers';
const WEATHER_CACHE_TTL_MS = 15 * 60_000;
const WEATHER_REQUEST_TIMEOUT_MS = 5_000;

interface CachedWeather {
  readonly expiresAt: number;
  readonly value: CurrentWeather;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, CachedWeather>();

  constructor(private readonly configService: ConfigService) {}

  async getCurrent(cityId: string): Promise<CurrentWeather | null> {
    const city = getCityConfig(cityId);

    if (city === undefined) {
      return null;
    }

    const cached = this.cache.get(cityId);

    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const apiKey =
      this.configService.get<string>('YANDEX_WEATHER_API_KEY')?.trim() ?? '';

    if (apiKey.length === 0) {
      return null;
    }

    const url = new URL(YANDEX_WEATHER_ENDPOINT);
    url.searchParams.set('lat', String(city.center.latitude));
    url.searchParams.set('lon', String(city.center.longitude));
    url.searchParams.set('lang', 'ru_RU');

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      WEATHER_REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-Yandex-Weather-Key': apiKey,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Weather request failed with HTTP ${response.status}`);
        return null;
      }

      const value = parseWeatherResponse(
        (await response.json()) as YandexWeatherResponse,
      );

      if (value === null) {
        this.logger.warn('Weather request returned an invalid response');
        return null;
      }

      this.cache.set(cityId, {
        value,
        expiresAt: Date.now() + WEATHER_CACHE_TTL_MS,
      });

      return value;
    } catch {
      this.logger.warn('Weather request is temporarily unavailable');
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const parseWeatherResponse = (
  response: YandexWeatherResponse,
): CurrentWeather | null => {
  const temperature = response.fact?.temp;
  const condition = response.fact?.condition;

  if (
    typeof temperature !== 'number' ||
    !Number.isFinite(temperature) ||
    typeof condition !== 'string' ||
    condition.trim().length === 0
  ) {
    return null;
  }

  const updatedAt =
    typeof response.now_dt === 'string' &&
    Number.isFinite(new Date(response.now_dt).getTime())
      ? response.now_dt
      : typeof response.now === 'number' && Number.isFinite(response.now)
        ? new Date(response.now * 1_000).toISOString()
        : new Date().toISOString();

  return {
    temperature,
    condition: condition.trim(),
    ...(typeof response.fact?.icon === 'string' &&
    response.fact.icon.trim().length > 0
      ? { icon: response.fact.icon.trim() }
      : {}),
    updatedAt,
  };
};
