import { Module } from '@nestjs/common';

import { AnonymousIdentityGuard } from './anonymous-identity.guard';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, AnonymousIdentityGuard],
  exports: [IdentityService, AnonymousIdentityGuard],
})
export class IdentityModule {}
