import {
  RoadEvent,
  RoadEventStatus,
  RoadEventType,
} from '../model/roadEvent';

export type RoadEventFeedbackAction =
  | 'CONFIRM'
  | 'REJECT';

export const ROAD_EVENT_TTL_MINUTES: Record<
  RoadEventType,
  number
> = {
  ACCIDENT: 120,

  ROAD_CLOSURE: 360,

  ROADWORKS: 720,

  TRAFFIC: 45,

  ROAD_HAZARD: 180,

  TRAFFIC_LIGHT: 120,

  ROAD_SERVICE: 60,

  ROAD_PATROL: 45,

  OTHER: 90,
};

const clamp = (
  value: number,
  min: number,
  max: number,
): number => {
  return Math.min(
    max,
    Math.max(min, value),
  );
};

export const calculateRoadEventConfidence =
  (
    confirmationCount: number,
    rejectionCount: number,
  ): number => {
    const confidence =
      (confirmationCount + 1) /
      (confirmationCount +
        rejectionCount +
        2);

    return clamp(
      confidence,
      0.05,
      0.95,
    );
  };

const getLastActivityAt = (
  event: RoadEvent,
): number => {
  const value =
    event.lastConfirmedAt ??
    event.createdAt;

  return new Date(
    value,
  ).getTime();
};

export const deriveRoadEventStatus =
  (
    event: RoadEvent,
    now = Date.now(),
  ): RoadEventStatus => {
    if (
      event.status ===
      'RESOLVED'
    ) {
      return 'RESOLVED';
    }

    const expiresAt =
      new Date(
        event.expiresAt,
      ).getTime();

    if (expiresAt <= now) {
      return 'RESOLVED';
    }

    if (
      event.rejectionCount >= 3 &&
      event.confidence <= 0.35
    ) {
      return 'RESOLVED';
    }

    if (
      event.rejectionCount >= 2 &&
      event.confidence < 0.5
    ) {
      return 'STALE';
    }

    const ttlMinutes =
      ROAD_EVENT_TTL_MINUTES[
        event.type
      ];

    const staleAfterMs =
      ttlMinutes *
      0.55 *
      60_000;

    const lastActivityAt =
      getLastActivityAt(event);

    if (
      now - lastActivityAt >
      staleAfterMs
    ) {
      return 'STALE';
    }

    if (
      event.confirmationCount >= 2 &&
      event.confidence >= 0.6
    ) {
      return 'ACTIVE';
    }

    return 'UNCONFIRMED';
  };

export const refreshRoadEventState =
  (
    event: RoadEvent,
    now = Date.now(),
  ): RoadEvent => {
    const status =
      deriveRoadEventStatus(
        event,
        now,
      );

    if (
      status === event.status
    ) {
      return event;
    }

    return {
      ...event,

      status,
    };
  };

export const applyRoadEventFeedback =
  (
    event: RoadEvent,
    action:
      RoadEventFeedbackAction,
    now = Date.now(),
  ): RoadEvent => {
    const confirmationCount =
      event.confirmationCount +
      (action === 'CONFIRM'
        ? 1
        : 0);

    const rejectionCount =
      event.rejectionCount +
      (action === 'REJECT'
        ? 1
        : 0);

    const confidence =
      calculateRoadEventConfidence(
        confirmationCount,
        rejectionCount,
      );

    const ttlMinutes =
      ROAD_EVENT_TTL_MINUTES[
        event.type
      ];

    const nextEvent: RoadEvent = {
      ...event,

      confirmationCount,

      rejectionCount,

      confidence,

      lastConfirmedAt:
        action === 'CONFIRM'
          ? new Date(
              now,
            ).toISOString()
          : event.lastConfirmedAt,

      expiresAt:
        action === 'CONFIRM'
          ? new Date(
              now +
                ttlMinutes *
                  60_000,
            ).toISOString()
          : event.expiresAt,
    };

    return {
      ...nextEvent,

      status:
        deriveRoadEventStatus(
          nextEvent,
          now,
        ),
    };
  };