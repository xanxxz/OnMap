import type { RoadEventType } from '../generated/prisma/client';

// Product policy, not a user preference. Police/patrol reports are intentionally excluded.
export const PUSH_ROAD_EVENT_TYPES: ReadonlySet<RoadEventType> = new Set([
  'ACCIDENT',
  'ROAD_CLOSURE',
  'ROADWORKS',
  'ROAD_HAZARD',
]);

export const PUSH_MAX_ATTEMPTS = 5;
export const PUSH_MAX_DEVICES_PER_IDENTITY = 3;
export const PUSH_RETRY_BASE_MS = 30_000;
export const PUSH_DEVICE_MIN_INTERVAL_MS = 60_000;
export const PARTNER_PUSH_MIN_INTERVAL_MS = 24 * 60 * 60_000;
export const PARTNER_PUSH_DELIVERY_WINDOW_MS = 15 * 60_000;

export const pushRetryDelayMs = (attempts: number): number =>
  Math.min(60 * 60_000, PUSH_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
