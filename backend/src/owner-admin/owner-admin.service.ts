import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getAvailableCityIds, getCityConfig } from '../cities/city.registry';
import { PartnerManagementService } from '../partner-placements/partner-management.service';
import {
  normalizePartnerImage,
  PartnerImageError,
  PARTNER_IMAGE_MAX_SOURCE_BYTES,
} from '../partner-placements/partner-image';
import { partnerPeriodStart } from '../partner-placements/partner-stat-report';
import {
  OwnerListQuery,
  OwnerStatsQuery,
  OwnerPointDto,
  OwnerBannerDto,
} from './owner-admin.dto';
import type { OwnerActor } from './owner-admin-auth.service';

const pointSelect = {
  id: true,
  cityId: true,
  title: true,
  category: true,
  description: true,
  latitude: true,
  longitude: true,
  displayAddress: true,
  backgroundColor: true,
  textColor: true,
  imageAssetKey: true,
  promoCode: true,
  promoTerms: true,
  startsAt: true,
  endsAt: true,
  status: true,
  updatedAt: true,
  contacts: {
    select: {
      id: true,
      type: true,
      label: true,
      value: true,
      displayOrder: true,
    },
    orderBy: [{ displayOrder: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.PartnerPointSelect;
const pointListSelect = {
  id: true,
  cityId: true,
  title: true,
  category: true,
  backgroundColor: true,
  textColor: true,
  startsAt: true,
  endsAt: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.PartnerPointSelect;
const bannerSelect = {
  id: true,
  cityId: true,
  title: true,
  text: true,
  buttonLabel: true,
  buttonUrl: true,
  partnerPointId: true,
  startsAt: true,
  endsAt: true,
  enabled: true,
  updatedAt: true,
  partnerPoint: {
    select: { id: true, title: true, backgroundColor: true, textColor: true },
  },
} satisfies Prisma.PartnerCityBannerSelect;
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, v]) => [key, stable(v)]),
        )
      : value;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Totals = {
  pointOpens: number;
  bannerImpressions: number;
  bannerClicks: number;
  contactClicks: number;
  total: number;
};
const countTotals = (
  rows: readonly { action: string; _sum: { count: number | null } }[],
): Totals => {
  const sum = (action: string) =>
    rows.find((r) => r.action === action)?._sum.count ?? 0;
  const t = {
    pointOpens: sum('POINT_OPEN'),
    bannerImpressions: sum('BANNER_IMPRESSION'),
    bannerClicks: sum('BANNER_CLICK'),
    contactClicks: sum('CONTACT_CLICK'),
  };
  return { ...t, total: Object.values(t).reduce((a, b) => a + b, 0) };
};

@Injectable()
export class OwnerAdminService {
  private readonly management = new PartnerManagementService();
  private overviewCache?: {
    until: number;
    roads: { source: string; count: number }[];
  };
  constructor(private readonly prisma: PrismaService) {}
  metadata() {
    return {
      cities: getAvailableCityIds().map((id) => {
        const c = getCityConfig(id)!;
        if (!c.timeZone)
          throw new BadRequestException('У города не задан часовой пояс');
        return {
          id,
          name: c.name,
          timeZone: c.timeZone,
          center: c.center,
          bounds: c.coverageBounds,
        };
      }),
      contactTypes: ['PHONE', 'EMAIL', 'WEBSITE', 'TELEGRAM', 'OTHER'],
      statistics: {
        timeZone: 'UTC',
        impression:
          'Баннер виден не менее одной секунды при активном приложении; не чаще раза в час для одного клиента и баннера.',
        card: 'Открытие карточки: не чаще раза в 15 минут для одного клиента и точки.',
        contact:
          'Нажатие контакта: не чаще раза в минуту для одного клиента, точки и контакта.',
        uniqueVisitorsAvailable: false,
      },
    };
  }
  private city(id?: string) {
    if (id && !getCityConfig(id))
      throw new BadRequestException('Город не поддерживается');
  }
  private async mutate(
    actor: OwnerActor,
    key: string,
    action: string,
    entityId: string,
    input: unknown,
    work: (tx: Prisma.TransactionClient) => Promise<{ id: string }>,
  ) {
    if (!uuid.test(key ?? ''))
      throw new BadRequestException('Нужен UUID Idempotency-Key');
    const requestHash = createHash('sha256')
      .update(JSON.stringify(stable({ action, entityId, input })))
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      // Same owner partner lock as the single existing Telegram wizard.
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(724513, 1)`;
      const where = {
        ownerTelegramId_requestKey: {
          ownerTelegramId: actor.ownerId,
          requestKey: key,
        },
      };
      const prior = await tx.ownerAdminMutation.findUnique({ where });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException(
            'Ключ запроса уже использован для другого действия',
          );
        return prior.result;
      }
      const live = await tx.ownerAdminSession.findFirst({
        where: {
          ownerTelegramId: actor.ownerId,
          tokenHash: actor.tokenHash,
          expiresAt: { gt: new Date() },
        },
        select: { ownerTelegramId: true },
      });
      if (!live)
        throw new ConflictException('Сессия завершена. Войдите снова.');
      const result = await work(tx);
      await tx.ownerAdminAudit.create({
        data: { ownerTelegramId: actor.ownerId, action, entityId: result.id },
      });
      await tx.ownerAdminMutation.create({
        data: {
          ownerTelegramId: actor.ownerId,
          requestKey: key,
          requestHash,
          result,
        },
      });
      return result;
    });
  }
  private checkVersion(current: { updatedAt: Date } | null, expected?: string) {
    if (!current) throw new NotFoundException('Запись не найдена');
    if (!expected || current.updatedAt.toISOString() !== expected)
      throw new ConflictException(
        'Запись изменилась. Обновите данные перед сохранением.',
      );
  }
  async points(q: OwnerListQuery) {
    this.city(q.cityId);
    const where: Prisma.PartnerPointWhereInput = {
      ...(q.cityId ? { cityId: q.cityId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { title: { contains: q.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.partnerPoint.findMany({
        where,
        select: pointListSelect,
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.partnerPoint.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async point(id: string) {
    const point = await this.prisma.partnerPoint.findUnique({
      where: { id },
      select: pointSelect,
    });
    if (!point) throw new NotFoundException('Точка не найдена');
    return point;
  }
  async savePoint(
    actor: OwnerActor,
    key: string,
    id: string | undefined,
    dto: OwnerPointDto,
  ) {
    return this.mutate(
      actor,
      key,
      id ? 'POINT_EDIT' : 'POINT_DRAFT',
      id ?? 'new',
      dto,
      async (tx) => {
        const old = id
          ? await tx.partnerPoint.findUnique({ where: { id } })
          : null;
        if (id) {
          this.checkVersion(old, dto.expectedUpdatedAt);
          if (old!.cityId !== dto.cityId)
            throw new BadRequestException(
              'Город существующей точки менять нельзя',
            );
        }
        const saved = await this.management.savePoint(
          tx,
          {
            ...dto,
            editingId: id,
            contacts: dto.contacts,
            imageAssetKey: old?.imageAssetKey ?? null,
            originalImageAssetKey: old?.imageAssetKey ?? null,
          },
          'DRAFT',
        );
        return { id: saved };
      },
    );
  }
  pointAction(
    actor: OwnerActor,
    key: string,
    id: string,
    action: 'publish' | 'pause' | 'resume' | 'end',
  ) {
    return this.mutate(
      actor,
      key,
      'POINT_' + action.toUpperCase(),
      id,
      {},
      async (tx) => {
        await this.management.pointStatus(tx, id, action);
        return { id };
      },
    );
  }
  async image(id: string) {
    const point = await this.point(id);
    if (!point.imageAssetKey)
      throw new NotFoundException('Изображение не задано');
    const asset = await this.prisma.partnerImageAsset.findUnique({
      where: { key: point.imageAssetKey },
      select: { pngBytes: true },
    });
    if (!asset) throw new NotFoundException('Изображение не найдено');
    return Buffer.from(asset.pngBytes);
  }
  async setImage(
    actor: OwnerActor,
    key: string,
    id: string,
    bytes: Buffer | null,
  ) {
    if (bytes && bytes.length > PARTNER_IMAGE_MAX_SOURCE_BYTES)
      throw new BadRequestException('Изображение больше 4 МБ');
    let normalized: Buffer | null = null;
    try {
      if (bytes) normalized = await normalizePartnerImage(bytes);
    } catch (error) {
      if (error instanceof PartnerImageError)
        throw new BadRequestException(
          'Нужен исправный PNG, JPEG или WebP до 4 МБ',
        );
      throw error;
    }
    return this.mutate(
      actor,
      key,
      bytes ? 'POINT_IMAGE' : 'POINT_IMAGE_CLEAR',
      id,
      bytes ? createHash('sha256').update(bytes).digest('hex') : null,
      async (tx) => {
        const point = await tx.partnerPoint.findUnique({
          where: { id },
          select: { imageAssetKey: true, status: true },
        });
        if (!point || point.status === 'ENDED')
          throw new NotFoundException('Точка недоступна');
        let imageAssetKey: string | null = null;
        if (normalized) {
          imageAssetKey = randomUUID();
          await tx.partnerImageAsset.create({
            data: { key: imageAssetKey, pngBytes: new Uint8Array(normalized) },
          });
        }
        await tx.partnerPoint.update({
          where: { id },
          data: { imageAssetKey },
        });
        if (
          point.imageAssetKey &&
          (await tx.partnerPoint.count({
            where: { imageAssetKey: point.imageAssetKey },
          })) === 0
        )
          await tx.partnerImageAsset.deleteMany({
            where: { key: point.imageAssetKey },
          });
        return { id };
      },
    );
  }
  async banners(q: OwnerListQuery) {
    this.city(q.cityId);
    const where = { ...(q.cityId ? { cityId: q.cityId } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.partnerCityBanner.findMany({
        where,
        select: bannerSelect,
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
        orderBy: { cityId: 'asc' },
      }),
      this.prisma.partnerCityBanner.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  saveBanner(
    actor: OwnerActor,
    key: string,
    cityId: string,
    dto: OwnerBannerDto,
  ) {
    this.city(cityId);
    return this.mutate(actor, key, 'BANNER_DRAFT', cityId, dto, async (tx) => {
      const old = await tx.partnerCityBanner.findUnique({ where: { cityId } });
      if (old) this.checkVersion(old, dto.expectedUpdatedAt);
      const id = await this.management.saveBanner(
        tx,
        { ...dto, cityId },
        false,
      );
      return { id };
    });
  }
  bannerAction(
    actor: OwnerActor,
    key: string,
    cityId: string,
    action: 'enable' | 'pause' | 'end',
  ) {
    this.city(cityId);
    return this.mutate(
      actor,
      key,
      'BANNER_' + action.toUpperCase(),
      cityId,
      {},
      async (tx) => {
        await this.management.bannerStatus(tx, cityId, action);
        return { id: cityId };
      },
    );
  }
  async overview(q: OwnerStatsQuery) {
    this.city(q.cityId);
    const now = new Date();
    if (!this.overviewCache || this.overviewCache.until < Date.now()) {
      const rows = await this.prisma.roadEvent.groupBy({
        by: ['source'],
        _count: { _all: true },
      });
      this.overviewCache = {
        until: Date.now() + 60_000,
        roads: rows.map((r) => ({ source: r.source, count: r._count._all })),
      };
    }
    const [identities, points, advertising] = await Promise.all([
      this.prisma.anonymousIdentityCount.findUnique({
        where: { id: 1 },
        select: { count: true, startedAt: true },
      }),
      this.prisma.partnerPoint.groupBy({
        by: ['status'],
        where: { ...(q.cityId ? { cityId: q.cityId } : {}) },
        _count: { _all: true },
      }),
      this.stats(q),
    ]);
    const active = await this.prisma.partnerPoint.count({
      where: {
        ...(q.cityId ? { cityId: q.cityId } : {}),
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
        latitude: { not: null },
        longitude: { not: null },
      },
    });
    return {
      roadEvents: {
        total: this.overviewCache.roads.reduce((s, r) => s + r.count, 0),
        bySource: this.overviewCache.roads,
      },
      anonymousIdentities: identities
        ? { count: identities.count.toString(), since: identities.startedAt }
        : null,
      points: {
        byStatus: points.map((r) => ({
          status: r.status,
          count: r._count._all,
        })),
        activeNow: active,
      },
      advertising,
    };
  }
  async stats(q: OwnerStatsQuery, pointId?: string) {
    this.city(q.cityId);
    if (pointId) await this.point(pointId);
    const now = new Date();
    const until = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    const since = partnerPeriodStart(q.period, now);
    const aggregated = await this.prisma.$queryRaw<
      Array<{ action: string; total: bigint; detailCount: bigint }>
    >`
      SELECT s.action,SUM(s.count)::bigint AS total,
        COUNT(DISTINCT (s.partner_point_id,s.detail_id))::bigint AS "detailCount"
      FROM partner_stat_daily s JOIN partner_points p ON p.id=s.partner_point_id
      WHERE s.day < ${until}::date AND (${since}::date IS NULL OR s.day>=${since}::date)
        AND (${pointId ?? null}::uuid IS NULL OR s.partner_point_id=${pointId ?? null}::uuid)
        AND (${q.cityId ?? null}::text IS NULL OR p.city_id=${q.cityId ?? null}::text)
      GROUP BY s.action
    `;
    const rows = aggregated.map((row) => ({
      action: row.action,
      _sum: { count: Number(row.total) },
    }));
    // Contact history uses stable contact IDs; deleted values and labels are never reconstructed.
    const contacts = await this.prisma.$queryRaw<
      Array<{
        pointId: string;
        pointTitle: string;
        contactId: string;
        label: string | null;
        clicks: bigint;
        total: bigint;
        deletedIndex: bigint;
      }>
    >`
      WITH counts AS (
        SELECT s.partner_point_id,s.detail_id,SUM(s.count)::bigint AS clicks
        FROM partner_stat_daily s JOIN partner_points p ON p.id=s.partner_point_id
        WHERE s.action='CONTACT_CLICK'::"PartnerStatAction" AND s.day < ${until}::date
          AND (${since}::date IS NULL OR s.day>=${since}::date)
          AND (${pointId ?? null}::uuid IS NULL OR s.partner_point_id=${pointId ?? null}::uuid)
          AND (${q.cityId ?? null}::text IS NULL OR p.city_id=${q.cityId ?? null}::text)
        GROUP BY s.partner_point_id,s.detail_id
      ), history AS (
        SELECT c.*,p.title,contact.label,
          ROW_NUMBER() OVER(PARTITION BY c.partner_point_id,(contact.id IS NULL) ORDER BY c.detail_id) AS deleted_index,
          COUNT(*) OVER() AS total
        FROM counts c JOIN partner_points p ON p.id=c.partner_point_id
        LEFT JOIN partner_point_contacts contact ON contact.id::text=c.detail_id AND contact.partner_point_id=c.partner_point_id
      ) SELECT partner_point_id::text AS "pointId",title AS "pointTitle",detail_id AS "contactId",label,clicks,total,deleted_index AS "deletedIndex"
      FROM history ORDER BY partner_point_id,detail_id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}
    `;
    return {
      period: q.period,
      since,
      timeZone: 'UTC',
      ...countTotals(rows),
      contacts: contacts.map((c) => ({
        pointId: c.pointId,
        pointTitle: c.pointTitle,
        contactId: c.contactId,
        label: c.label ?? `Удалённый контакт ${c.deletedIndex}`,
        clicks: Number(c.clicks),
        deleted: c.label === null,
      })),
      contactsTotal: Number(
        aggregated.find((row) => row.action === 'CONTACT_CLICK')?.detailCount ??
          0,
      ),
      page: q.page,
      pageSize: q.pageSize,
      uniqueVisitors: null,
    };
  }
}
