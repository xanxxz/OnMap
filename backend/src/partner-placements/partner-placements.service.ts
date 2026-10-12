import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import {
  getCityConfig,
  isCoordinateInsideCityCoverage,
} from '../cities/city.registry';
import { PrismaService } from '../database/prisma.service';
import { isSafePartnerButtonUrl } from './partner-bot.flow';
import { safePartnerAppearance } from './partner-placement-colors';
import { ListPartnerPlacementsQueryDto } from './dto/list-partner-placements-query.dto';

type PointWithContacts = Prisma.PartnerPointGetPayload<{
  include: { contacts: true };
}>;

const hasContent = (value: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class PartnerPlacementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveImage(key: string): Promise<Buffer | null> {
    if (!UUID_V4.test(key)) return null;
    const now = new Date();
    const point = await this.prisma.partnerPoint.findFirst({
      where: {
        imageAssetKey: key,
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { cityId: true, latitude: true, longitude: true },
    });
    const city = point ? getCityConfig(point.cityId) : undefined;
    if (
      !point ||
      !city ||
      point.latitude === null ||
      point.longitude === null ||
      !isCoordinateInsideCityCoverage(city, point.latitude, point.longitude)
    )
      return null;
    const asset = await this.prisma.partnerImageAsset.findUnique({
      where: { key },
      select: { pngBytes: true },
    });
    return asset ? Buffer.from(asset.pngBytes) : null;
  }

  async list(query: ListPartnerPlacementsQueryDto) {
    const city = getCityConfig(query.cityId);
    if (!city) {
      throw new BadRequestException('Unsupported cityId');
    }
    if (
      ![query.west, query.south, query.east, query.north].every(
        Number.isFinite,
      ) ||
      query.west >= query.east ||
      query.south >= query.north
    ) {
      throw new BadRequestException('Invalid viewport');
    }

    const now = new Date();
    const [points, banner] = await Promise.all([
      this.prisma.partnerPoint.findMany({
        where: {
          cityId: query.cityId,
          status: 'ACTIVE',
          startsAt: { lte: now },
          endsAt: { gt: now },
          longitude: { not: null, gte: query.west, lte: query.east },
          latitude: { not: null, gte: query.south, lte: query.north },
        },
        include: {
          contacts: { orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] },
        },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.partnerCityBanner.findUnique({
        where: { cityId: query.cityId },
        include: { partnerPoint: true },
      }),
    ]);

    const visiblePoints = points
      .filter(
        (
          point,
        ): point is PointWithContacts & {
          longitude: number;
          latitude: number;
        } => {
          const { longitude, latitude } = point;
          return (
            point.cityId === query.cityId &&
            point.status === 'ACTIVE' &&
            point.startsAt <= now &&
            point.endsAt > now &&
            longitude !== null &&
            latitude !== null &&
            Number.isFinite(longitude) &&
            Number.isFinite(latitude) &&
            longitude >= query.west &&
            longitude <= query.east &&
            latitude >= query.south &&
            latitude <= query.north &&
            isCoordinateInsideCityCoverage(city, latitude, longitude)
          );
        },
      )
      .map((point) => ({
        id: point.id,
        cityId: point.cityId,
        title: point.title,
        category: point.category,
        description: point.description,
        coordinates: { longitude: point.longitude, latitude: point.latitude },
        displayAddress: point.displayAddress,
        appearance: safePartnerAppearance(
          point.backgroundColor,
          point.textColor,
        ),
        startsAt: point.startsAt,
        endsAt: point.endsAt,
        imageUrl:
          point.imageAssetKey && UUID_V4.test(point.imageAssetKey)
            ? `/partner-placements/images/${point.imageAssetKey}`
            : null,
        promoCode: point.promoCode,
        contacts: point.contacts.map((contact) => ({
          id: contact.id,
          type: contact.type,
          label: contact.label,
          value: contact.value,
          displayOrder: contact.displayOrder,
        })),
      }));

    const visibleBanner =
      banner?.cityId === query.cityId &&
      banner.enabled &&
      banner.partnerPointId !== null &&
      banner.partnerPoint?.cityId === query.cityId &&
      banner.partnerPoint.status === 'ACTIVE' &&
      banner.partnerPoint.startsAt <= now &&
      banner.partnerPoint.endsAt > now &&
      hasContent(banner.title) &&
      hasContent(banner.text) &&
      hasContent(banner.buttonLabel) &&
      hasContent(banner.buttonUrl) &&
      isSafePartnerButtonUrl(banner.buttonUrl) &&
      banner.startsAt !== null &&
      banner.endsAt !== null &&
      banner.startsAt <= now &&
      banner.endsAt > now
        ? {
            id: banner.id,
            cityId: banner.cityId,
            title: banner.title,
            partnerPointId: banner.partnerPointId,
            appearance: safePartnerAppearance(
              banner.partnerPoint.backgroundColor,
              banner.partnerPoint.textColor,
            ),
            text: banner.text,
            button: { label: banner.buttonLabel, url: banner.buttonUrl },
            startsAt: banner.startsAt,
            endsAt: banner.endsAt,
          }
        : null;

    return {
      cityId: query.cityId,
      points: visiblePoints,
      banner: visibleBanner,
    };
  }

  async getActivePoint(id: string, cityId: string) {
    const city = getCityConfig(cityId);
    if (!city) throw new BadRequestException('Unsupported cityId');
    const bounds = city.coverageBounds;
    const result = await this.list({
      cityId,
      west: bounds.west,
      south: bounds.south,
      east: bounds.east,
      north: bounds.north,
    });
    const point = result.points.find((item) => item.id === id);
    if (!point) throw new NotFoundException('Partner point unavailable');
    return point;
  }
}
