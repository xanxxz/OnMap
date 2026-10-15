import type {
  RoadEventStatus,
  RoadEventType,
} from '../generated/prisma/client';
import {
  confidencePercent,
  visibleRoadEventConfidence,
} from '../road-events/road-event-confidence';

// Product policy: only independently confirmed patrol reports may notify.
export const PUSH_ROAD_EVENT_TYPES: ReadonlySet<RoadEventType> = new Set([
  'ROAD_PATROL',
]);

export const PUSH_MAX_ATTEMPTS = 5;
export const PUSH_MAX_DEVICES_PER_IDENTITY = 3;
export const PUSH_RETRY_BASE_MS = 30_000;
export const PUSH_DEVICE_MIN_INTERVAL_MS = 60_000;
export const PUSH_ROAD_MAX_PER_HOUR = 2;
export const PUSH_NEWS_MAX_PER_DAY = 1;
export const PUSH_ROAD_MIN_CONFIDENCE_PERCENT = 70;
export const PUSH_ROAD_MIN_INDEPENDENT_CONFIRMATIONS = 2;
export const PUSH_ROAD_MIN_REMAINING_MS = 10 * 60_000;
export const PUSH_CAMPAIGN_MAX_DURATION_MS = 90 * 24 * 60 * 60_000;
export const PUSH_CAMPAIGN_LATE_GRACE_MS = 15 * 60_000;
export const PUSH_NEWS_START_HOUR = 8;
export const PUSH_NEWS_END_HOUR = 22;
export const PARTNER_PUSH_MIN_INTERVAL_MS = 24 * 60 * 60_000;
export const PARTNER_PUSH_DELIVERY_WINDOW_MS = 15 * 60_000;

export interface RoadPushEligibility {
  type: RoadEventType;
  status: RoadEventStatus;
  source: 'USER' | 'TELEGRAM';
  storedConfidence: number;
  confirmationCount: number;
  rejectionCount: number;
  independentConfirmations: number;
  lastConfirmedAt: Date | string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
}

export const roadPushEligible = (
  event: RoadPushEligibility,
  now: Date,
): boolean => {
  if (event.type !== 'ROAD_PATROL' || event.status !== 'ACTIVE') return false;
  if (event.independentConfirmations < PUSH_ROAD_MIN_INDEPENDENT_CONFIRMATIONS)
    return false;
  if (
    new Date(event.expiresAt).getTime() - now.getTime() <
    PUSH_ROAD_MIN_REMAINING_MS
  )
    return false;
  const activation = Date.parse(process.env.PUSH_ROAD_EVENT_NOT_BEFORE ?? '');
  if (
    !Number.isFinite(activation) ||
    new Date(event.createdAt).getTime() < activation
  )
    return false;
  return (
    confidencePercent(
      visibleRoadEventConfidence({
        storedConfidence: event.storedConfidence,
        source: event.source,
        type: event.type,
        confirmationCount: event.confirmationCount,
        rejectionCount: event.rejectionCount,
        lastConfirmedAt: event.lastConfirmedAt,
        createdAt: event.createdAt,
        now,
      }),
    ) >= PUSH_ROAD_MIN_CONFIDENCE_PERCENT
  );
};

export const pushRetryDelayMs = (attempts: number): number =>
  Math.min(60 * 60_000, PUSH_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
