import { Module } from '@nestjs/common';

import { AnonymousIdentityGuard } from './anonymous-identity.guard';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { ActorRestrictionGuard } from './actor-restriction.guard';
import { IdentityTrackingService } from './identity-tracking.service';

@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    IdentityTrackingService,
    AnonymousIdentityGuard,
    ActorRestrictionGuard,
  ],
  exports: [
    IdentityService,
    IdentityTrackingService,
    AnonymousIdentityGuard,
    ActorRestrictionGuard,
  ],
})
export class IdentityModule {}
