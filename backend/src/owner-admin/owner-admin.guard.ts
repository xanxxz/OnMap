import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { OwnerAdminAuthService, OwnerActor } from './owner-admin-auth.service';
import { ownerAdminOrigin } from './owner-admin.config';
export interface OwnerRequest extends Request {
  ownerActor: OwnerActor;
}
@Injectable()
export class OwnerAdminGuard implements CanActivate {
  constructor(
    private readonly auth: OwnerAdminAuthService,
    private readonly config: ConfigService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<OwnerRequest>();
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Cache-Control', 'no-store');
    const origin = request.headers.origin;
    if (
      origin &&
      origin !== ownerAdminOrigin(this.config.get<string>('OWNER_ADMIN_ORIGIN'))
    )
      throw new ForbiddenException('Недопустимый origin');
    request.ownerActor = await this.auth.authenticate(
      request.headers.authorization,
    );
    return true;
  }
}
