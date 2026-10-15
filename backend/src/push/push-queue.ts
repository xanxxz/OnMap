import type { Prisma, RoadEventType } from '../generated/prisma/client';
import { PUSH_ROAD_EVENT_TYPES, roadPushEligible } from './push-policy';

const queueForCity = async (
  tx: Prisma.TransactionClient,
  kind: 'ROAD_EVENT' | 'PARTNER_POINT' | 'GENERAL',
  targetId: string,
  cityId: string,
  dedupeKey: string,
  campaignRunId?: string,
) => {
  const devices = await tx.pushDevice.findMany({
    where: {
      cityId,
      enabled: true,
      ...(kind === 'ROAD_EVENT'
        ? { roadPushEnabled: true }
        : { newsPushEnabled: true }),
    },
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
        ...(campaignRunId ? { campaignRunId } : {}),
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
  const row = await tx.roadEvent.findUnique({
    where: { id: event.id },
    select: {
      type: true,
      status: true,
      source: true,
      confidence: true,
      confirmationCount: true,
      rejectionCount: true,
      createdByInstallationId: true,
      lastConfirmedAt: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  if (!row) return;
  const independentConfirmations = await tx.roadEventFeedback.count({
    where: {
      roadEventId: event.id,
      action: 'CONFIRM',
      ...(row.createdByInstallationId
        ? { installationId: { not: row.createdByInstallationId } }
        : {}),
    },
  });
  if (
    !roadPushEligible(
      {
        type: row.type,
        status: row.status,
        source: row.source,
        storedConfidence: Number(row.confidence),
        confirmationCount: row.confirmationCount,
        rejectionCount: row.rejectionCount,
        independentConfirmations,
        lastConfirmedAt: row.lastConfirmedAt,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      },
      new Date(),
    )
  )
    return;
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

export const queueCampaignRunPush = async (
  tx: Prisma.TransactionClient,
  run: {
    id: string;
    campaignId: string;
    kind: 'GENERAL' | 'PARTNER_POINT';
    targetId: string;
    cityIds: readonly string[];
  },
): Promise<number> => {
  const uniqueCities = [...new Set(run.cityIds)];
  let audience = 0;
  for (const cityId of uniqueCities) {
    const before = await tx.pushOutbox.count({
      where: { campaignRunId: run.id, cityId },
    });
    await queueForCity(
      tx,
      run.kind,
      run.targetId,
      cityId,
      `campaign:${run.id}`,
      run.id,
    );
    const after = await tx.pushOutbox.count({
      where: { campaignRunId: run.id, cityId },
    });
    audience += after - before;
  }
  return audience;
};
