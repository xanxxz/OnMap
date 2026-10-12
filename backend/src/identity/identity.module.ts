import { Module } from '@nestjs/common';

import { AnonymousIdentityGuard } from './anonymous-identity.guard';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { ActorRestrictionGuard } from './actor-restriction.guard';

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, AnonymousIdentityGuard, ActorRestrictionGuard],
  exports: [IdentityService, AnonymousIdentityGuard, ActorRestrictionGuard],
})
export class IdentityModule {}
