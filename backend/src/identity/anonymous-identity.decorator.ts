import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import type { AnonymousIdentityRequest } from './anonymous-identity.guard';

export const AnonymousIdentityId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const identityId = context
      .switchToHttp()
      .getRequest<AnonymousIdentityRequest>().anonymousIdentityId;

    if (!identityId) {
      throw new UnauthorizedException('Anonymous identity token is required');
    }

    return identityId;
  },
);
