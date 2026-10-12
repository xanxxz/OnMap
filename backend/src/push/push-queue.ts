import type { Prisma, RoadEventType } from '../generated/prisma/client';
import { PUSH_ROAD_EVENT_TYPES } from './push-policy';

const queueForCity = async (
  tx: Prisma.TransactionClient,
  kind: 'ROAD_EVENT' | 'PARTNER_POINT',
  targetId: string,
  cityId: string,
  dedupeKey: string,
) => {
  const devices = await tx.pushDevice.findMany({
    where: { cityId, enabled: true },
    select: { id: true },
  });
  for (let offset = 0; offset < devices.length; offset += 500) {
    await tx.pushOutbox.createMany({
      data: devices.slice(offset, offset + 500).map(({ id }) => ({
        deviceId: id,
        dedupeKey,
        kind,
        targetId,
        cityId,
      })),
      skipDuplicates: true,
    });
  }
};

export const queueRoadEventPush = async (
  tx: Prisma.TransactionClient,
  event: { id: string; cityId: string; type: RoadEventType },
) => {
  if (!PUSH_ROAD_EVENT_TYPES.has(event.type)) return;
  await queueForCity(
    tx,
    'ROAD_EVENT',
    event.id,
    event.cityId,
    `road:${event.id}`,
  );
};

export const queuePartnerPush = async (
  tx: Prisma.TransactionClient,
  campaign: { id: string; partnerPointId: string; cityId: string },
) =>
  queueForCity(
    tx,
    'PARTNER_POINT',
    campaign.partnerPointId,
    campaign.cityId,
    `partner:${campaign.id}`,
  );
