import { Injectable } from '@nestjs/common';

import {
  TOMTOM_SEARCH_CACHE_MAX_ENTRIES,
  TOMTOM_SEARCH_CACHE_TTL_MS,
  TOMTOM_SEARCH_ENDPOINT,
  TOMTOM_SEARCH_RESULT_LIMIT,
} from './tomtom.constants';
import {
  resolveTomTomCityBounds,
  resolveTomTomCityCenter,
} from './tomtom-city';
import { TomTomClient } from './tomtom.client';
import { TomTomIntegrationError } from './tomtom.errors';
import { mapTomTomSearchResponse } from './tomtom.mapper';
import type { TomTomSearchCandidate } from './tomtom.types';

interface SearchCacheEntry {
  candidates: TomTomSearchCandidate[];
  expiresAt: number;
}

export const normalizeTomTomSearchQuery = (query: string): string => {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
};

@Injectable()
export class TomTomSearchProvider {
  private readonly cache = new Map<string, SearchCacheEntry>();
  private readonly inFlight = new Map<
    string,
    Promise<TomTomSearchCandidate[]>
  >();

  constructor(private readonly client: TomTomClient) {}

  isAvailable(): boolean {
    return this.client.isAvailable();
  }

  async search(
    query: string,
    cityId: string,
  ): Promise<TomTomSearchCandidate[]> {
    this.ensureAvailable();

    const bounds = resolveTomTomCityBounds(cityId);
    const center = resolveTomTomCityCenter(cityId);
    const normalizedQuery = normalizeTomTomSearchQuery(query);

    if (normalizedQuery.length === 0) {
      throw new TomTomIntegrationError(
        'INVALID_QUERY',
        'TomTom Search query must not be empty',
      );
    }

    const cacheKey = `${cityId}:${normalizedQuery}`;
    const now = Date.now();

    this.pruneCache(now);

    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.candidates;
    }

    const activeRequest = this.inFlight.get(cacheKey);

    if (activeRequest) {
      return activeRequest;
    }

    const request = this.fetchCandidates(
      query.trim(),
      cacheKey,
      bounds,
      center,
    );

    this.inFlight.set(cacheKey, request);

    try {
      return await request;
    } finally {
      if (this.inFlight.get(cacheKey) === request) {
        this.inFlight.delete(cacheKey);
      }
    }
  }

  private async fetchCandidates(
    query: string,
    cacheKey: string,
    bounds: ReturnType<typeof resolveTomTomCityBounds>,
    center: ReturnType<typeof resolveTomTomCityCenter>,
  ): Promise<TomTomSearchCandidate[]> {
    const endpoint = `${TOMTOM_SEARCH_ENDPOINT}/${encodeURIComponent(query)}.json`;
    const payload = await this.client.requestJson('Fuzzy Search', endpoint, {
      topLeft: `${bounds.north},${bounds.west}`,
      btmRight: `${bounds.south},${bounds.east}`,
      geobias: `point:${center.latitude},${center.longitude}`,
      countrySet: 'RU',
      language: 'ru-RU',
      view: 'RU',
      limit: String(TOMTOM_SEARCH_RESULT_LIMIT),
    });

    const candidates = mapTomTomSearchResponse(
      payload,
      bounds,
      center,
      TOMTOM_SEARCH_RESULT_LIMIT,
    );

    const fetchedAt = Date.now();

    this.ensureCacheCapacity();
    this.cache.set(cacheKey, {
      candidates,
      expiresAt: fetchedAt + TOMTOM_SEARCH_CACHE_TTL_MS,
    });

    return candidates;
  }

  private pruneCache(now: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private ensureCacheCapacity(): void {
    while (this.cache.size >= TOMTOM_SEARCH_CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined;

      if (!oldestKey) {
        return;
      }

      this.cache.delete(oldestKey);
    }
  }

  private ensureAvailable(): void {
    if (!this.client.isAvailable()) {
      throw new TomTomIntegrationError(
        'DISABLED',
        'TomTom Search is disabled because TOMTOM_API_KEY is not configured',
      );
    }
  }
}
