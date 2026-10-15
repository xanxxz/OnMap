import { roadPushEligible } from './push-policy';
import type { RoadPushEligibility } from './push-policy';

const now = new Date('2026-10-13T12:00:00.000Z');
const event = (): RoadPushEligibility => ({
  type: 'ROAD_PATROL',
  status: 'ACTIVE',
  source: 'USER',
  storedConfidence: 84,
  confirmationCount: 3,
  rejectionCount: 0,
  independentConfirmations: 2,
  createdAt: new Date(now.getTime() - 2 * 60_000),
  lastConfirmedAt: now,
  expiresAt: new Date(now.getTime() + 20 * 60_000),
});

describe('ROAD_PATROL push eligibility', () => {
  const previous = process.env.PUSH_ROAD_EVENT_NOT_BEFORE;
  beforeAll(() => {
    process.env.PUSH_ROAD_EVENT_NOT_BEFORE = new Date(
      now.getTime() - 60 * 60_000,
    ).toISOString();
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.PUSH_ROAD_EVENT_NOT_BEFORE;
    else process.env.PUSH_ROAD_EVENT_NOT_BEFORE = previous;
  });

  it('requires two independent app confirmations, a live marker and ten minutes remaining', () => {
    expect(roadPushEligible(event(), now)).toBe(true);
    expect(
      roadPushEligible({ ...event(), independentConfirmations: 1 }, now),
    ).toBe(false);
    expect(
      roadPushEligible({ ...event(), status: 'HIDDEN_PENDING_REVIEW' }, now),
    ).toBe(false);
    expect(
      roadPushEligible(
        { ...event(), expiresAt: new Date(now.getTime() + 9 * 60_000) },
        now,
      ),
    ).toBe(false);
    expect(roadPushEligible({ ...event(), type: 'ACCIDENT' }, now)).toBe(false);
  });

  it('never enqueues events created before activation boundary', () => {
    process.env.PUSH_ROAD_EVENT_NOT_BEFORE = now.toISOString();
    expect(roadPushEligible(event(), now)).toBe(false);
  });
});
