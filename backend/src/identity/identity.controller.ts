import { Controller, Post } from '@nestjs/common';

import { IdentityService } from './identity.service';

@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('anonymous')
  createAnonymousIdentity() {
    return this.identityService.issueAnonymousIdentity();
  }
}
