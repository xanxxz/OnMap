import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  CreateRoadEventDto,
} from './dto/create-road-event.dto';

import {
  FeedbackRoadEventDto,
} from './dto/feedback-road-event.dto';

import {
  ListRoadEventsQueryDto,
} from './dto/list-road-events-query.dto';

import {
  RoadEventsService,
} from './road-events.service';

@Controller('road-events')
export class RoadEventsController {
  constructor(
    private readonly roadEventsService:
      RoadEventsService,
  ) {}

  @Get()
  list(
    @Query()
    query:
      ListRoadEventsQueryDto,
  ) {
    return this.roadEventsService.list(
      query,
    );
  }

  @Post()
  create(
    @Body()
    dto:
      CreateRoadEventDto,
  ) {
    return this.roadEventsService.create(
      dto,
    );
  }

  @Post(':id/feedback')
  feedback(
    @Param(
      'id',
      ParseUUIDPipe,
    )
    id: string,

    @Body()
    dto:
      FeedbackRoadEventDto,
  ) {
    return this.roadEventsService.feedback(
      id,
      dto,
    );
  }
}