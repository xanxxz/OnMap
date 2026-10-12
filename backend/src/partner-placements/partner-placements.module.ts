import { Module } from '@nestjs/common';
import { PartnerPlacementsController } from './partner-placements.controller';
import { PartnerPlacementsService } from './partner-placements.service';
import { PartnerStatisticsService } from './partner-statistics.service';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [IdentityModule],
  controllers: [PartnerPlacementsController],
  providers: [PartnerPlacementsService, PartnerStatisticsService],
})
export class PartnerPlacementsModule {}
