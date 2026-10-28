import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { OwnerAdminGuard } from './owner-admin.guard';
import type { OwnerRequest } from './owner-admin.guard';
import { OwnerAdminService } from './owner-admin.service';
import { OwnerAdminAuthService } from './owner-admin-auth.service';
import {
  OwnerBannerDto,
  OwnerListQuery,
  OwnerPointDto,
  OwnerStatsQuery,
} from './owner-admin.dto';
import { PARTNER_IMAGE_MAX_SOURCE_BYTES } from '../partner-placements/partner-image';
@Controller('owner-admin')
@UseGuards(OwnerAdminGuard)
export class OwnerAdminController {
  constructor(
    private readonly service: OwnerAdminService,
    private readonly auth: OwnerAdminAuthService,
  ) {}
  @Get('session') session(@Req() req: OwnerRequest) {
    return {
      expiresAt: req.ownerActor.expiresAt,
      permissions: ['statistics:read', 'partners:read', 'partners:write'],
    };
  }
  @Post('session/rotate') rotate(@Req() req: OwnerRequest) {
    return this.auth.rotate(req.ownerActor);
  }
  @Delete('session') revoke(@Req() req: OwnerRequest) {
    return this.auth.revoke(req.ownerActor);
  }
  @Get('metadata') metadata() {
    return this.service.metadata();
  }
  @Get('overview') overview(@Query() query: OwnerStatsQuery) {
    return this.service.overview(query);
  }
  @Get('statistics') statistics(@Query() query: OwnerStatsQuery) {
    return this.service.stats(query);
  }
  @Get('points') points(@Query() query: OwnerListQuery) {
    return this.service.points(query);
  }
  @Get('points/:id') point(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.point(id);
  }
  @Get('points/:id/statistics') stats(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: OwnerStatsQuery,
  ) {
    return this.service.stats(query, id);
  }
  @Post('points') create(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Body() body: OwnerPointDto,
  ) {
    return this.service.savePoint(req.ownerActor, key, undefined, body);
  }
  @Put('points/:id') edit(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OwnerPointDto,
  ) {
    return this.service.savePoint(req.ownerActor, key, id, body);
  }
  @Post('points/:id/actions/:action') pointAction(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: string,
  ) {
    if (!['publish', 'pause', 'resume', 'end'].includes(action))
      throw new BadRequestException('Действие не поддерживается');
    return this.service.pointAction(
      req.ownerActor,
      key,
      id,
      action as 'publish' | 'pause' | 'resume' | 'end',
    );
  }
  @Get('points/:id/image') async image(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(await this.service.image(id));
  }
  @Post('points/:id/image')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: PARTNER_IMAGE_MAX_SOURCE_BYTES, files: 1, fields: 0 },
    }),
  )
  upload(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    if (!file?.buffer) throw new BadRequestException('Выберите изображение');
    return this.service.setImage(req.ownerActor, key, id, file.buffer);
  }
  @Delete('points/:id/image') removeImage(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setImage(req.ownerActor, key, id, null);
  }
  @Get('banners') banners(@Query() query: OwnerListQuery) {
    return this.service.banners(query);
  }
  @Put('banners/:cityId') saveBanner(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('cityId') cityId: string,
    @Body() body: OwnerBannerDto,
  ) {
    return this.service.saveBanner(req.ownerActor, key, cityId, body);
  }
  @Post('banners/:cityId/actions/:action') bannerAction(
    @Req() req: OwnerRequest,
    @Headers('idempotency-key') key: string,
    @Param('cityId') cityId: string,
    @Param('action') action: string,
  ) {
    if (!['enable', 'pause', 'end'].includes(action))
      throw new BadRequestException('Действие не поддерживается');
    return this.service.bannerAction(
      req.ownerActor,
      key,
      cityId,
      action as 'enable' | 'pause' | 'end',
    );
  }
}
