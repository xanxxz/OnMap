jest.mock('../database/prisma.service', () => ({
  PrismaService: class {},
}));

jest.mock('./realtime/road-events.gateway', () => ({
  RoadEventsGateway: class {},
}));

import type { PrismaService } from '../database/prisma.service';
import type { TomTomTrafficProvider } from '../integrations/tomtom/tomtom-traffic.provider';

import { DpsActivityTracker } from './dps-activity-tracker.service';
import { ROAD_PATROL_LIFECYCLE } from './road-events.constants';
import type { RoadEventsGateway } from './realtime/road-events.gateway';
import { RoadEventsService } from './road-events.service';
import type { RoadEventStatus } from './road-events.constants';

interface DpsPolicyAccess {
  deriveStatus(
    type: 'ROAD_PATROL',
    currentStatus: RoadEventStatus,
    action: 'CONFIRM' | 'REJECT',
    confirmationCount: number,
    rejectionCount: number,
    confidence: number,
  ): RoadEventStatus;
  nextConfirmedExpiry(
    event: { type: 'ROAD_PATROL'; createdAt: Date },
    confirmedAt: Date,
  ): Date;
}

const service = new RoadEventsService(
  {} as PrismaService,
  {} as RoadEventsGateway,
  {} as TomTomTrafficProvider,
  new DpsActivityTracker(),
);

const policy = service as unknown as DpsPolicyAccess;

describe('DPS lifecycle policy', () => {
  it('uses a 20 minute rolling lifetime', () => {
    const createdAt = new Date('2026-09-21T10:00:00.000Z');
    const confirmedAt = new Date('2026-09-21T10:10:00.000Z');

    expect(
      policy.nextConfirmedExpiry(
        { type: 'ROAD_PATROL', createdAt },
        confirmedAt,
      ),
    ).toEqual(new Date('2026-09-21T10:30:00.000Z'));
  });

  it('never extends one marker beyond its 75 minute hard limit', () => {
    const createdAt = new Date('2026-09-21T10:00:00.000Z');
    const confirmedAt = new Date('2026-09-21T11:10:00.000Z');

    expect(
      policy.nextConfirmedExpiry(
        { type: 'ROAD_PATROL', createdAt },
        confirmedAt,
      ),
    ).toEqual(new Date('2026-09-21T11:15:00.000Z'));
  });

  it('marks a disputed marker stale after three independent rejects', () => {
    expect(
      policy.deriveStatus('ROAD_PATROL', 'ACTIVE', 'REJECT', 1, 3, 0.4),
    ).toBe('STALE');
  });

  it('does not remove a DPS marker after seven rejects', () => {
    expect(
      policy.deriveStatus('ROAD_PATROL', 'STALE', 'REJECT', 1, 7, 0.2),
    ).toBe('STALE');
  });

  it('allows ten independent rejects to resolve a DPS marker early', () => {
    expect(
      policy.deriveStatus('ROAD_PATROL', 'STALE', 'REJECT', 1, 10, 0.1),
    ).toBe('RESOLVED');
    expect(ROAD_PATROL_LIFECYCLE.resolveRejectionCount).toBe(10);
  });

  it('restores a stale marker to active after a fresh confirmation', () => {
    expect(
      policy.deriveStatus('ROAD_PATROL', 'STALE', 'CONFIRM', 4, 3, 0.55),
    ).toBe('ACTIVE');
  });
});

describe('DpsActivityTracker', () => {
  it('deduplicates the same unlocated Telegram post and expires it after 20 minutes', () => {
    const tracker = new DpsActivityTracker();
    const observedAt = Date.parse('2026-09-21T10:00:00.000Z');

    tracker.recordUnlocated({
      cityId: 'balakovo',
      externalId: 'telegram:-1001:1',
      observedAt: new Date(observedAt).toISOString(),
    });
    tracker.recordUnlocated({
      cityId: 'balakovo',
      externalId: 'telegram:-1001:1',
      observedAt: new Date(observedAt).toISOString(),
    });

    expect(tracker.countUnlocated('balakovo', observedAt + 19 * 60_000)).toBe(
      1,
    );
    expect(tracker.countUnlocated('balakovo', observedAt + 20 * 60_000)).toBe(
      0,
    );
  });

  it('keeps city counts isolated and clears a post once it gets a map point', () => {
    const tracker = new DpsActivityTracker();
    const observedAt = Date.now();

    tracker.recordUnlocated({
      cityId: 'balakovo',
      externalId: 'telegram:-1001:2',
      observedAt: new Date(observedAt).toISOString(),
    });

    expect(tracker.countUnlocated('saratov', observedAt)).toBe(0);
    tracker.clear('telegram:-1001:2');
    expect(tracker.countUnlocated('balakovo', observedAt)).toBe(0);
  });
});
