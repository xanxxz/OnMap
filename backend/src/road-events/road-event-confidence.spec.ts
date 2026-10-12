import {
  confidencePercent,
  confidenceAfterFeedback,
  expiryAfterSignal,
  userConfidenceFromVotes,
  visibleRoadEventConfidence,
} from './road-event-confidence';

describe('RoadEvent confidence', () => {
  const createdAt = new Date('2026-09-24T12:00:00.000Z');

  it('starts a new USER report at 40% and counts only independent confirmations', () => {
    expect(userConfidenceFromVotes(1, 0)).toBeCloseTo(0.4);
    expect(userConfidenceFromVotes(2, 0)).toBeCloseTo(0.62);
    expect(userConfidenceFromVotes(3, 0)).toBeCloseTo(0.84);
  });

  it('decreases with age without changing the stored score', () => {
    const input = {
      storedConfidence: 0.4,
      source: 'USER' as const,
      type: 'ROAD_PATROL' as const,
      lastConfirmedAt: createdAt,
      createdAt,
    };

    expect(
      visibleRoadEventConfidence({
        ...input,
        now: createdAt,
      }),
    ).toBeCloseTo(0.4);
    expect(
      visibleRoadEventConfidence({
        ...input,
        now: new Date(createdAt.getTime() + 10 * 60_000),
      }),
    ).toBeCloseTo(0.25);
    expect(
      visibleRoadEventConfidence({
        ...input,
        now: new Date(createdAt.getTime() + 20 * 60_000),
      }),
    ).toBeCloseTo(0.1);
    expect(input.storedConfidence).toBe(0.4);
  });

  it('resets the freshness anchor after an independent confirmation', () => {
    const confirmedAt = new Date(createdAt.getTime() + 10 * 60_000);
    expect(
      visibleRoadEventConfidence({
        storedConfidence: userConfidenceFromVotes(2, 0),
        source: 'USER',
        type: 'ROAD_PATROL',
        lastConfirmedAt: confirmedAt,
        createdAt,
        now: confirmedAt,
      }),
    ).toBeCloseTo(0.62);
  });

  it('uses persisted vote history for old USER rows instead of an old stored 67%', () => {
    expect(
      visibleRoadEventConfidence({
        storedConfidence: 2 / 3,
        source: 'USER',
        type: 'ROAD_PATROL',
        confirmationCount: 1,
        rejectionCount: 0,
        lastConfirmedAt: createdAt,
        createdAt,
        now: createdAt,
      }),
    ).toBeCloseTo(0.4);
  });

  it('shortens remaining life on rejection without deleting a fresh event', () => {
    const rejectedAt = new Date(createdAt.getTime() + 5 * 60_000);
    expect(
      expiryAfterSignal({
        action: 'REJECT',
        type: 'ROAD_PATROL',
        source: 'USER',
        createdAt,
        currentExpiresAt: new Date(createdAt.getTime() + 20 * 60_000),
        now: rejectedAt,
      }).getTime(),
    ).toBe(rejectedAt.getTime() + 12.75 * 60_000);
  });

  it('caps repeated DPS confirmations at 75 minutes from creation', () => {
    const confirmedAt = new Date(createdAt.getTime() + 70 * 60_000);
    const expiresAt = expiryAfterSignal({
      action: 'CONFIRM',
      type: 'ROAD_PATROL',
      source: 'USER',
      createdAt,
      currentExpiresAt: new Date(createdAt.getTime() + 72 * 60_000),
      now: confirmedAt,
    });
    expect(expiresAt.getTime()).toBe(createdAt.getTime() + 75 * 60_000);
  });

  it('keeps other types on their own lifetime policy', () => {
    const confirmedAt = new Date(createdAt.getTime() + 30 * 60_000);
    expect(
      expiryAfterSignal({
        action: 'CONFIRM',
        type: 'ACCIDENT',
        source: 'USER',
        createdAt,
        currentExpiresAt: new Date(createdAt.getTime() + 120 * 60_000),
        now: confirmedAt,
      }).getTime(),
    ).toBe(confirmedAt.getTime() + 120 * 60_000);
  });

  it('returns a bounded integer percentage', () => {
    expect(confidencePercent(0.4)).toBe(40);
    expect(confidencePercent(-1)).toBe(5);
    expect(confidencePercent(2)).toBe(95);
  });

  it('lowers trust for negative feedback and stays within bounds', () => {
    expect(userConfidenceFromVotes(2, 1)).toBeCloseTo(0.44);
    expect(userConfidenceFromVotes(1, 20)).toBe(0.05);
    expect(userConfidenceFromVotes(20, 0)).toBe(0.95);
  });

  it('preserves Telegram parser confidence as its source baseline', () => {
    expect(
      confidenceAfterFeedback('TELEGRAM', 0.72, 1, 0, 'CONFIRM'),
    ).toBeCloseTo(0.94);
    expect(
      confidenceAfterFeedback('TELEGRAM', 0.72, 0, 1, 'REJECT'),
    ).toBeCloseTo(0.54);
    expect(confidenceAfterFeedback('USER', 0.9, 2, 0, 'CONFIRM')).toBeCloseTo(
      0.62,
    );
  });
});
