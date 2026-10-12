import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AnonymousIdentityGuard } from '../identity/anonymous-identity.guard';
import { AnonymousIdentityId } from '../identity/anonymous-identity.decorator';
import { ListPartnerPlacementsQueryDto } from './dto/list-partner-placements-query.dto';
import { RecordPartnerInteractionDto } from './dto/record-partner-interaction.dto';
import { PartnerPlacementsService } from './partner-placements.service';
import { PartnerStatisticsService } from './partner-statistics.service';

@Controller('partner-placements')
export class PartnerPlacementsController {
  constructor(
    private readonly service: PartnerPlacementsService,
    private readonly statistics: PartnerStatisticsService,
  ) {}

  @Get()
  list(@Query() query: ListPartnerPlacementsQueryDto) {
    return this.service.list(query);
  }

  @Get('points/:id')
  point(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cityId') cityId: string,
  ) {
    return this.service.getActivePoint(id, cityId);
  }

  @Get('images/:key')
  async image(
    @Param('key') key: string,
    @Res() response: Response,
  ): Promise<void> {
    const bytes = await this.service.getActiveImage(key);
    if (!bytes) throw new NotFoundException('Partner image not found');
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Length', String(bytes.length));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(bytes);
  }

  @Post('interaction')
  @HttpCode(204)
  @UseGuards(AnonymousIdentityGuard)
  async record(
    @Body() dto: RecordPartnerInteractionDto,
    @AnonymousIdentityId() identityId: string,
  ): Promise<void> {
    await this.statistics.record(dto, identityId);
  }
}
