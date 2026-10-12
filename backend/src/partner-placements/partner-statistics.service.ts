import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IdentityService } from '../identity/identity.service';
import {
  getCityConfig,
  isCoordinateInsideCityCoverage,
} from '../cities/city.registry';
import { isSafePartnerButtonUrl } from './partner-bot.flow';
import {
  PartnerInteractionAction,
  RecordPartnerInteractionDto,
} from './dto/record-partner-interaction.dto';

// Minimum rolling interval between accepted actions for one installation/target/detail.
const WINDOW_MS: Record<PartnerInteractionAction, number> = {
  POINT_OPEN: 15 * 60_000,
  CONTACT_CLICK: 60_000,
  BANNER_IMPRESSION: 60 * 60_000,
  BANNER_CLICK: 60_000,
};

@Injectable()
export class PartnerStatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async record(
    dto: RecordPartnerInteractionDto,
    identityId: string,
  ): Promise<{ counted: boolean }> {
    const now = new Date();
    const isBanner =
      dto.action === PartnerInteractionAction.BANNER_IMPRESSION ||
      dto.action === PartnerInteractionAction.BANNER_CLICK;
    if (
      dto.action === PartnerInteractionAction.CONTACT_CLICK
        ? !dto.contactId
        : !!dto.contactId
    ) {
      throw new BadRequestException('Invalid contactId for action');
    }

    let partnerPointId: string;
    let detailId = dto.contactId ?? '';
    if (isBanner) {
      const banner = await this.prisma.partnerCityBanner.findUnique({
        where: { id: dto.targetId },
        include: { partnerPoint: true },
      });
      const point = banner?.partnerPoint;
      if (
        !banner?.enabled ||
        !banner.partnerPointId ||
        !point ||
        !banner.title?.trim() ||
        !banner.text?.trim() ||
        !banner.buttonLabel?.trim() ||
        !banner.buttonUrl?.trim() ||
        !isSafePartnerButtonUrl(banner.buttonUrl) ||
        !banner.startsAt ||
        !banner.endsAt ||
        banner.startsAt > now ||
        banner.endsAt <= now ||
        point.status !== 'ACTIVE' ||
        point.startsAt > now ||
        point.endsAt <= now ||
        point.cityId !== banner.cityId
      ) {
        throw new NotFoundException('Partner banner not active');
      }
      partnerPointId = banner.partnerPointId;
      detailId = banner.id;
    } else {
      const point = await this.prisma.partnerPoint.findUnique({
        where: { id: dto.targetId },
      });
      const city = point ? getCityConfig(point.cityId) : undefined;
      if (
        !point ||
        point.status !== 'ACTIVE' ||
        point.startsAt > now ||
        point.endsAt <= now ||
        point.longitude === null ||
        point.latitude === null ||
        !city ||
        !isCoordinateInsideCityCoverage(city, point.latitude, point.longitude)
      ) {
        throw new NotFoundException('Partner point not active');
      }
      if (
        dto.contactId &&
        !(await this.prisma.partnerPointContact.findFirst({
          where: { id: dto.contactId, partnerPointId: point.id },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Partner contact not found');
      partnerPointId = point.id;
    }

    const duration = WINDOW_MS[dto.action];
    const cutoff = new Date(now.getTime() - duration);
    const expiresAt = new Date(now.getTime() + duration);
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const actorHash = this.identity.partnerStatisticsPseudonym(
      identityId,
      `${partnerPointId}:${dto.action}:${detailId}`,
    );

    return this.prisma.$transaction(async (tx) => {
      // Expired pseudonyms are unnecessary after their throttle window.
      await tx.partnerStatWindow.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      const inserted = await tx.partnerStatWindow.createMany({
        data: [
          {
            partnerPointId,
            action: dto.action,
            detailId,
            actorHash,
            lastAcceptedAt: now,
            expiresAt,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        const refreshed = await tx.partnerStatWindow.updateMany({
          where: {
            partnerPointId,
            action: dto.action,
            detailId,
            actorHash,
            lastAcceptedAt: { lte: cutoff },
          },
          data: { lastAcceptedAt: now, expiresAt },
        });
        if (refreshed.count === 0) return { counted: false };
      }
      await tx.partnerStatDaily.upsert({
        where: {
          partnerPointId_action_detailId_day: {
            partnerPointId,
            action: dto.action,
            detailId,
            day,
          },
        },
        create: { partnerPointId, action: dto.action, detailId, day, count: 1 },
        update: { count: { increment: 1 } },
      });
      return { counted: true };
    });
  }
}
