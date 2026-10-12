import { queueRoadEventPush, queuePartnerPush } from './push-queue';
import type { Prisma } from '../generated/prisma/client';

const transaction = () => {
  const createMany = jest.fn().mockResolvedValue({ count: 1 });
  const findMany = jest.fn().mockResolvedValue([{ id: 'device-1' }]);
  return {
    tx: {
      pushDevice: { findMany },
      pushOutbox: { createMany },
    } as unknown as Prisma.TransactionClient,
    createMany,
    findMany,
  };
};

describe('push queue policy', () => {
  it('queues only predefined road-event types once per device and event', async () => {
    const { tx, createMany } = transaction();
    await queueRoadEventPush(tx, {
      id: 'event-1',
      cityId: 'balakovo',
      type: 'ROAD_PATROL',
    });
    expect(createMany).not.toHaveBeenCalled();
    await queueRoadEventPush(tx, {
      id: 'event-1',
      cityId: 'balakovo',
      type: 'ACCIDENT',
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          deviceId: 'device-1',
          dedupeKey: 'road:event-1',
          kind: 'ROAD_EVENT',
          targetId: 'event-1',
          cityId: 'balakovo',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('uses campaign id so a repeated callback cannot duplicate its outbox', async () => {
    const { tx, createMany } = transaction();
    await queuePartnerPush(tx, {
      id: 'campaign-1',
      partnerPointId: 'point-1',
      cityId: 'balakovo',
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dedupeKey: 'partner:campaign-1',
          targetId: 'point-1',
        }),
      ],
      skipDuplicates: true,
    });
  });
});
