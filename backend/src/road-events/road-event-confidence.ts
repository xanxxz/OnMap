import type {
  RoadEventFeedbackAction,
  RoadEventType,
} from './road-events.constants';

export const ROAD_EVENT_USER_TTL_MINUTES: Record<RoadEventType, number> = {
  ACCIDENT: 120,
  ROAD_CLOSURE: 360,
  ROADWORKS: 720,
  TRAFFIC: 45,
  ROAD_HAZARD: 180,
  TRAFFIC_LIGHT: 120,
  ROAD_SERVICE: 60,
  ROAD_PATROL: 20,
  OTHER: 90,
};

export const ROAD_EVENT_TELEGRAM_TTL_MS: Readonly<
  Partial<Record<RoadEventType, number>>
> = {
  ACCIDENT: 3 * 60 * 60_000,
  TRAFFIC: 60 * 60_000,
  ROAD_CLOSURE: 6 * 60 * 60_000,
  ROADWORKS: 12 * 60 * 60_000,
  ROAD_HAZARD: 2 * 60 * 60_000,
  ROAD_PATROL: 20 * 60_000,
  OTHER: 2 * 60 * 60_000,
};

export const ROAD_PATROL_POLICY = {
  rollingTtlMs: 20 * 60_000,
  maxLifetimeMs: 75 * 60_000,
  staleAfterMs: 12 * 60_000,
  staleRejectionCount: 3,
  resolveRejectionCount: 10,
} as const;

export const ROAD_EVENT_CONFIDENCE = {
  userInitial: 0.4,
  confirmationBoost: 0.22,
  rejectionPenalty: 0.18,
  maxAgeDecay: 0.3,
  minimum: 0.05,
  maximum: 0.95,
  rejectionRemainingTimeFactor: 0.85,
  otherResolveRejectionCount: 3,
  otherStaleRejectionCount: 2,
  otherStaleConfidence: 0.5,
  otherResolveConfidence: 0.35,
  activeConfirmationCount: 2,
  activeConfidence: 0.6,
  staleAgeFraction: 0.55,
} as const;

const clampConfidence = (value: number): number =>
  Math.min(
    ROAD_EVENT_CONFIDENCE.maximum,
    Math.max(ROAD_EVENT_CONFIDENCE.minimum, value),
  );

export const userConfidenceFromVotes = (
  confirmationCount: number,
  rejectionCount: number,
): number =>
  clampConfidence(
    ROAD_EVENT_CONFIDENCE.userInitial +
      Math.max(0, confirmationCount - 1) *
        ROAD_EVENT_CONFIDENCE.confirmationBoost -
      rejectionCount * ROAD_EVENT_CONFIDENCE.rejectionPenalty,
  );

export const confidenceAfterFeedback = (
  source: 'USER' | 'TELEGRAM',
  storedConfidence: number,
  confirmationCount: number,
  rejectionCount: number,
  action: RoadEventFeedbackAction,
): number => {
  if (source === 'USER') {
    return userConfidenceFromVotes(confirmationCount, rejectionCount);
  }

  // Telegram starts from the parser score; accepted votes adjust that score.
  return clampConfidence(
    storedConfidence +
      (action === 'CONFIRM'
        ? ROAD_EVENT_CONFIDENCE.confirmationBoost
        : -ROAD_EVENT_CONFIDENCE.rejectionPenalty),
  );
};

export const roadEventTtlMs = (
  source: 'USER' | 'TELEGRAM',
  type: RoadEventType,
): number =>
  (source === 'TELEGRAM' ? ROAD_EVENT_TELEGRAM_TTL_MS[type] : undefined) ??
  ROAD_EVENT_USER_TTL_MINUTES[type] * 60_000;

export const expiryAfterSignal = ({
  action,
  type,
  source,
  createdAt,
  currentExpiresAt,
  now,
}: {
  action: RoadEventFeedbackAction;
  type: RoadEventType;
  source: 'USER' | 'TELEGRAM';
  createdAt: Date | string;
  currentExpiresAt: Date | string;
  now: Date;
}): Date => {
  if (action === 'REJECT') {
    const remainingMs = Math.max(
      0,
      new Date(currentExpiresAt).getTime() - now.getTime(),
    );
    return new Date(
      now.getTime() +
        remainingMs * ROAD_EVENT_CONFIDENCE.rejectionRemainingTimeFactor,
    );
  }

  const rollingExpiry = now.getTime() + roadEventTtlMs(source, type);
  return new Date(
    type === 'ROAD_PATROL'
      ? Math.min(
          rollingExpiry,
          new Date(createdAt).getTime() + ROAD_PATROL_POLICY.maxLifetimeMs,
        )
      : rollingExpiry,
  );
};

export const visibleRoadEventConfidence = ({
  storedConfidence,
  source,
  type,
  confirmationCount,
  rejectionCount,
  lastConfirmedAt,
  createdAt,
  now,
}: {
  storedConfidence: number;
  source: 'USER' | 'TELEGRAM';
  type: RoadEventType;
  confirmationCount?: number;
  rejectionCount?: number;
  lastConfirmedAt: Date | string | null;
  createdAt: Date | string;
  now: Date;
}): number => {
  const ttlMs = roadEventTtlMs(source, type);
  const anchor = new Date(lastConfirmedAt ?? createdAt).getTime();
  const elapsedMs = Math.max(0, now.getTime() - anchor);
  const ageFraction = Math.min(1, elapsedMs / ttlMs);

  return clampConfidence(
    (source === 'USER' &&
    confirmationCount !== undefined &&
    rejectionCount !== undefined
      ? userConfidenceFromVotes(confirmationCount, rejectionCount)
      : storedConfidence) -
      ROAD_EVENT_CONFIDENCE.maxAgeDecay * ageFraction,
  );
};

export const confidencePercent = (confidence: number): number =>
  Math.round(clampConfidence(confidence) * 100);
