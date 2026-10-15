import type { Prisma } from '../generated/prisma/client';
import { queueCampaignRunPush, queueRoadEventPush } from './push-queue';

const NOW = new Date();

describe('push queue policy', () => {
  const oldBoundary = process.env.PUSH_ROAD_EVENT_NOT_BEFORE;
  beforeAll(() => {
    process.env.PUSH_ROAD_EVENT_NOT_BEFORE = new Date(
      NOW.getTime() - 60_000,
    ).toISOString();
  });
  afterAll(() => {
    if (oldBoundary === undefined)
      delete process.env.PUSH_ROAD_EVENT_NOT_BEFORE;
    else process.env.PUSH_ROAD_EVENT_NOT_BEFORE = oldBoundary;
  });

  const setup = () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const feedbackCount = jest.fn().mockResolvedValue(2);
    const event = {
      type: 'ROAD_PATROL',
      status: 'ACTIVE',
      source: 'USER',
      confidence: 84,
      confirmationCount: 3,
      rejectionCount: 0,
      createdByInstallationId: 'creator',
      lastConfirmedAt: NOW,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 20 * 60_000),
    };
    const tx = {
      pushDevice: {
        findMany: jest.fn().mockResolvedValue([{ id: 'device-1' }]),
      },
      pushOutbox: { createMany, count: jest.fn().mockResolvedValue(1) },
      roadEvent: { findUnique: jest.fn().mockResolvedValue(event) },
      roadEventFeedback: { count: feedbackCount },
    } as unknown as Prisma.TransactionClient;
    return { tx, createMany, feedbackCount, event };
  };

  it('queues only confirmed DPS, not other road events', async () => {
    const { tx, createMany, feedbackCount } = setup();
    await queueRoadEventPush(tx, {
      id: 'event-1',
      cityId: 'balakovo',
      type: 'ACCIDENT',
    });
    expect(createMany).not.toHaveBeenCalled();
    await queueRoadEventPush(tx, {
      id: 'event-1',
      cityId: 'balakovo',
      type: 'ROAD_PATROL',
    });
    expect(feedbackCount).toHaveBeenCalledWith({
      where: {
        roadEventId: 'event-1',
        action: 'CONFIRM',
        installationId: { not: 'creator' },
      },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ dedupeKey: 'road:event-1' })],
      skipDuplicates: true,
    });
  });

  it('does not queue on one confirmation or short remaining life', async () => {
    const { tx, createMany, feedbackCount, event } = setup();
    feedbackCount.mockResolvedValue(1);
    await queueRoadEventPush(tx, {
      id: 'event-1',
      cityId: 'balakovo',
      type: 'ROAD_PATROL',
    });
    expect(createMany).not.toHaveBeenCalled();
    feedbackCount.mockResolvedValue(2);
    event.expiresAt = new Date(NOW.getTime() + 9 * 60_000);
    await queueRoadEventPush(tx, {
      id: 'event-1',
      cityId: 'balakovo',
      type: 'ROAD_PATROL',
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('deduplicates cities for a scheduled run', async () => {
    const { tx, createMany } = setup();
    await queueCampaignRunPush(tx, {
      id: 'run-1',
      campaignId: 'campaign-1',
      kind: 'GENERAL',
      targetId: 'campaign-1',
      cityIds: ['balakovo', 'balakovo'],
    });
    expect(createMany).toHaveBeenCalledTimes(1);
  });
});
