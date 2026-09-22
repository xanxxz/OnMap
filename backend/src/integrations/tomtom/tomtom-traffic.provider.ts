import { Injectable } from '@nestjs/common';

import {
  TOMTOM_INCIDENT_FIELDS,
  TOMTOM_TRAFFIC_CACHE_TTL_MS,
  TOMTOM_TRAFFIC_INCIDENTS_ENDPOINT,
} from './tomtom.constants';
import { resolveTomTomCityBounds } from './tomtom-city';
import { TomTomClient } from './tomtom.client';
import { TomTomIntegrationError } from './tomtom.errors';
import { mapTomTomIncidentResponse } from './tomtom.mapper';
import type { ExternalRoadEvent } from './tomtom.types';

interface TrafficCacheEntry {
  incidents: ExternalRoadEvent[];
  expiresAt: number;
}

@Injectable()
export class TomTomTrafficProvider {
  private readonly cache = new Map<string, TrafficCacheEntry>();
  private readonly inFlight = new Map<string, Promise<ExternalRoadEvent[]>>();

  constructor(private readonly client: TomTomClient) {}

  isAvailable(): boolean {
    return this.client.isAvailable();
  }

  async getIncidents(cityId: string): Promise<ExternalRoadEvent[]> {
    this.ensureAvailable();

    const bounds = resolveTomTomCityBounds(cityId);
    const now = Date.now();
    const cached = this.cache.get(cityId);

    if (cached && cached.expiresAt > now) {
      return cached.incidents;
    }

    const activeRequest = this.inFlight.get(cityId);

    if (activeRequest) {
      return activeRequest;
    }

    const request = this.fetchIncidents(cityId, bounds);

    this.inFlight.set(cityId, request);

    try {
      return await request;
    } finally {
      if (this.inFlight.get(cityId) === request) {
        this.inFlight.delete(cityId);
      }
    }
  }

  private async fetchIncidents(
    cityId: string,
    bounds: ReturnType<typeof resolveTomTomCityBounds>,
  ): Promise<ExternalRoadEvent[]> {
    const payload = await this.client.requestJson(
      'Traffic Incident Details',
      TOMTOM_TRAFFIC_INCIDENTS_ENDPOINT,
      {
        bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(','),
        fields: TOMTOM_INCIDENT_FIELDS,
        language: 'ru-RU',
        timeValidityFilter: 'present',
      },
    );

    const fetchedAt = Date.now();
    const incidents = mapTomTomIncidentResponse(
      payload,
      bounds,
      new Date(fetchedAt).toISOString(),
    );

    this.cache.set(cityId, {
      incidents,
      expiresAt: fetchedAt + TOMTOM_TRAFFIC_CACHE_TTL_MS,
    });

    return incidents;
  }

  private ensureAvailable(): void {
    if (!this.client.isAvailable()) {
      throw new TomTomIntegrationError(
        'DISABLED',
        'TomTom Traffic is disabled because TOMTOM_API_KEY is not configured',
      );
    }
  }
}
