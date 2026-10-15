import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { Request } from 'express';

import { IdentityService } from './identity.service';
import { IdentityTrackingService } from './identity-tracking.service';

export interface AnonymousIdentityRequest extends Request {
  anonymousIdentityId?: string;
}

@Injectable()
export class AnonymousIdentityGuard implements CanActivate {
  constructor(
    private readonly identityService: IdentityService,
    private readonly tracking: IdentityTrackingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AnonymousIdentityRequest>();

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Anonymous identity token is required');
    }

    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);

    if (!match?.[1]) {
      throw new UnauthorizedException('Invalid anonymous identity token');
    }

    request.anonymousIdentityId = this.identityService.verifyAnonymousIdentity(
      match[1],
    );

    await this.tracking.recordSafely(request.anonymousIdentityId);

    return true;
  }
}
