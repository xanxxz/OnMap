import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IdentityService } from './identity.service';

const CACHE_LIMIT = 8192;

@Injectable()
export class IdentityTrackingService {
  private readonly logger = new Logger(IdentityTrackingService.name);
  private readonly observed = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async recordSafely(identityId: string): Promise<void> {
    const hash = this.identity.identityCountKey(identityId);
    if (this.observed.has(hash)) return;
    const existing = this.pending.get(hash);
    if (existing) return existing;
    const pending = this.record(hash)
      .then(() => {
        if (this.observed.size >= CACHE_LIMIT) this.observed.clear();
        this.observed.add(hash);
      })
      .catch((error: unknown) => {
        // Usage statistics must not prevent access to the map.
        this.logger.warn(
          `Anonymous identity tracking unavailable category=${error instanceof Error ? error.name : 'UNKNOWN'}`,
        );
      })
      .finally(() => this.pending.delete(hash));
    this.pending.set(hash, pending);
    return pending;
  }

  private async record(hash: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.anonymousIdentitySeen.createMany({
        data: [{ identityHash: hash }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return;
      await tx.anonymousIdentityCount.upsert({
        where: { id: 1 },
        create: { id: 1, count: 1n },
        update: { count: { increment: 1n } },
      });
    });
  }
}
