import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';

interface IdentityRequest extends Request {
  anonymousIdentityId?: string;
}

@Injectable()
export class ActorRestrictionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IdentityRequest>();
    const actorId = request.anonymousIdentityId;
    if (!actorId) throw new UnauthorizedException();

    const rows = await this.prisma.$queryRaw<
      readonly { readonly blockedUntil: Date | string }[]
    >`
      SELECT blocked_until AS "blockedUntil"
      FROM actor_restrictions
      WHERE actor_id = ${actorId}
        AND blocked_until > NOW()
      LIMIT 1
    `;
    if (rows.length > 0) {
      throw new ForbiddenException(
        'Account actions are temporarily restricted',
      );
    }
    return true;
  }
}
