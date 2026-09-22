import { Injectable } from '@nestjs/common';

import { ROAD_PATROL_LIFECYCLE } from './road-events.constants';

interface UnlocatedDpsObservation {
  readonly cityId: string;
  readonly expiresAt: number;
}

@Injectable()
export class DpsActivityTracker {
  private readonly unlocated = new Map<string, UnlocatedDpsObservation>();

  recordUnlocated(input: {
    readonly cityId: string;
    readonly externalId: string;
    readonly observedAt: string;
  }): void {
    const observedAt = Date.parse(input.observedAt);

    if (!Number.isFinite(observedAt)) return;

    this.cleanup(Date.now());
    this.unlocated.set(input.externalId, {
      cityId: input.cityId,
      expiresAt: observedAt + ROAD_PATROL_LIFECYCLE.rollingTtlMs,
    });
  }

  clear(externalId: string): void {
    this.unlocated.delete(externalId);
  }

  countUnlocated(cityId: string, now = Date.now()): number {
    this.cleanup(now);

    return [...this.unlocated.values()].filter(
      (observation) => observation.cityId === cityId,
    ).length;
  }

  private cleanup(now: number): void {
    for (const [externalId, observation] of this.unlocated) {
      if (observation.expiresAt <= now) {
        this.unlocated.delete(externalId);
      }
    }
  }
}
