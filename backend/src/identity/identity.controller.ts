import { Controller, Post } from '@nestjs/common';

import { IdentityService } from './identity.service';
import { IdentityTrackingService } from './identity-tracking.service';

@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly tracking: IdentityTrackingService,
  ) {}

  @Post('anonymous')
  async createAnonymousIdentity() {
    const identity = this.identityService.issueAnonymousIdentity();
    await this.tracking.recordSafely(
      this.identityService.verifyAnonymousIdentity(identity.token),
    );
    return identity;
  }
}
