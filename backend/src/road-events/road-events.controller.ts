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

import { CreateRoadEventDto } from './dto/create-road-event.dto';

import { FeedbackRoadEventDto } from './dto/feedback-road-event.dto';

import { ListRoadEventsQueryDto } from './dto/list-road-events-query.dto';

import { RoadEventsService } from './road-events.service';

@Controller('road-events')
@UseGuards(AnonymousIdentityGuard)
export class RoadEventsController {
  constructor(private readonly roadEventsService: RoadEventsService) {}

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

  @Post()
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

  @Post(':id/feedback')
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
