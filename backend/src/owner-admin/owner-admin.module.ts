import { Module } from '@nestjs/common';
import { OwnerAdminAuthService } from './owner-admin-auth.service';
import { OwnerAdminGuard } from './owner-admin.guard';
import { OwnerAdminService } from './owner-admin.service';
import { OwnerAdminController } from './owner-admin.controller';
@Module({
  controllers: [OwnerAdminController],
  providers: [OwnerAdminAuthService, OwnerAdminGuard, OwnerAdminService],
  exports: [OwnerAdminAuthService],
})
export class OwnerAdminModule {}
