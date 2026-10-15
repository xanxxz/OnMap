jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import type { PrismaService } from '../database/prisma.service';
import type { IdentityService } from './identity.service';
import { IdentityTrackingService } from './identity-tracking.service';

describe('IdentityTrackingService', () => {
  it('counts each first-seen keyed identity once, including concurrent requests', async () => {
    const seen = new Set<string>();
    let total = 0n;
    const tx = {
      anonymousIdentitySeen: {
        createMany: jest.fn(
          ({ data }: { data: { identityHash: string }[] }) => {
            const hash = data[0].identityHash;
            if (seen.has(hash)) return { count: 0 };
            seen.add(hash);
            return { count: 1 };
          },
        ),
      },
      anonymousIdentityCount: {
        upsert: jest.fn(() => {
          total += 1n;
          return { count: total };
        }),
      },
    };
    const prisma = {
      $transaction: (fn: (client: typeof tx) => Promise<void>) => fn(tx),
    };
    const identity = { identityCountKey: (id: string) => `keyed-${id}` };
    const service = new IdentityTrackingService(
      prisma as unknown as PrismaService,
      identity as unknown as IdentityService,
    );
    await Promise.all([
      service.recordSafely('old-installation'),
      service.recordSafely('old-installation'),
    ]);
    await service.recordSafely('old-installation');
    await service.recordSafely('new-installation');
    expect(total).toBe(2n);
    expect([...seen]).toEqual([
      'keyed-old-installation',
      'keyed-new-installation',
    ]);
    expect(tx.anonymousIdentitySeen.createMany).toHaveBeenCalledTimes(2);
  });
});
