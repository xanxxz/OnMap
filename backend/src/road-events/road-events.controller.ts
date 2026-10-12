import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AnonymousIdentityId } from '../identity/anonymous-identity.decorator';

import { AnonymousIdentityGuard } from '../identity/anonymous-identity.guard';
import { ActorRestrictionGuard } from '../identity/actor-restriction.guard';

import { CreateRoadEventDto } from './dto/create-road-event.dto';

import { FeedbackRoadEventDto } from './dto/feedback-road-event.dto';
import { ReportRoadEventDto } from './dto/report-road-event.dto';

import { ListRoadEventsQueryDto } from './dto/list-road-events-query.dto';

import { RoadEventsService } from './road-events.service';
import { RoadEventReportsService } from './road-event-reports.service';

@Controller('road-events')
@UseGuards(AnonymousIdentityGuard)
export class RoadEventsController {
  constructor(
    private readonly roadEventsService: RoadEventsService,
    private readonly roadEventReportsService: RoadEventReportsService,
  ) {}

  @Get('moderation-notices')
  moderationNotices(@AnonymousIdentityId() identityId: string) {
    return this.roadEventReportsService.getAuthorNotices(identityId);
  }

  @Post('moderation-notices/:noticeId/ack')
  acknowledgeModerationNotice(
    @AnonymousIdentityId() identityId: string,
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
  ) {
    return this.roadEventReportsService.acknowledgeAuthorNotice(
      noticeId,
      identityId,
    );
  }

  @Get('dps-summary')
  dpsSummary(
    @Query('cityId')
    cityId: string,
  ) {
    return this.roadEventsService.getDpsActivitySummary(cityId);
  }

  @Get()
  list(
    @AnonymousIdentityId()
    identityId: string,

    @Query()
    query: ListRoadEventsQueryDto,
  ) {
    return this.roadEventsService.list(
      query,

      identityId,
    );
  }

  @Get(':id')
  getActiveById(
    @AnonymousIdentityId() identityId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cityId') cityId: string,
  ) {
    return this.roadEventsService.getActiveById(id, cityId, identityId);
  }

  @Post()
  @UseGuards(ActorRestrictionGuard)
  create(
    @AnonymousIdentityId()
    identityId: string,

    @Body()
    dto: CreateRoadEventDto,
  ) {
    return this.roadEventsService.create(
      dto,

      identityId,
    );
  }

  @Post(':id/report')
  @UseGuards(ActorRestrictionGuard)
  report(
    @AnonymousIdentityId() identityId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportRoadEventDto,
  ) {
    return this.roadEventReportsService.report(id, identityId, dto.reason);
  }

  @Post(':id/feedback')
  @UseGuards(ActorRestrictionGuard)
  feedback(
    @AnonymousIdentityId()
    identityId: string,

    @Param('id', ParseUUIDPipe)
    id: string,

    @Body()
    dto: FeedbackRoadEventDto,
  ) {
    return this.roadEventsService.feedback(
      id,
      dto,

      identityId,
    );
  }
}
