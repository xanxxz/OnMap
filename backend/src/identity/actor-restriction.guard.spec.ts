jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { ActorRestrictionGuard } from './actor-restriction.guard';

const contextFor = (actorId: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ anonymousIdentityId: actorId }),
    }),
  }) as never;

describe('ActorRestrictionGuard', () => {
  it('blocks a currently restricted actor', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ blockedUntil: new Date() }]),
    };
    const guard = new ActorRestrictionGuard(prisma as unknown as PrismaService);
    await expect(
      guard.canActivate(contextFor('actor-a')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an actor after the restriction expires', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const guard = new ActorRestrictionGuard(prisma as unknown as PrismaService);
    await expect(guard.canActivate(contextFor('actor-a'))).resolves.toBe(true);
  });
});
