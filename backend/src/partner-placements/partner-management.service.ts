import { BadRequestException } from '@nestjs/common';
import type {
  Prisma,
  PartnerPlacementStatus,
} from '../generated/prisma/client';
import { getCityConfig } from '../cities/city.registry';
import {
  PointDraft,
  BannerDraft,
  ContactDraft,
  parsePartnerCoordinates,
  parsePlacementDate,
  parsePartnerPromoCode,
  isSafePartnerButtonUrl,
} from './partner-bot.flow';
import {
  isReadablePartnerColors,
  parsePartnerColor,
  safePartnerAppearance,
} from './partner-placement-colors';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const required = (value: unknown, max: number) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !value.startsWith('/');
const optional = (value: unknown, max: number) =>
  value === undefined || value === null || required(value, max);
export class PartnerManagementService {
  validatePoint(point: PointDraft, now = new Date()) {
    if (
      !getCityConfig(point.cityId) ||
      !required(point.title, 160) ||
      !required(point.category, 64) ||
      !optional(point.description, 1000) ||
      !optional(point.displayAddress, 240)
    )
      throw new BadRequestException(
        'Проверьте город, название, категорию и длину полей',
      );
    if (
      !parsePartnerCoordinates(
        {
          location: { latitude: point.latitude!, longitude: point.longitude! },
        },
        point.cityId,
      )
    )
      throw new BadRequestException('Координаты вне покрытия города');
    if (
      !point.startsAt ||
      !point.endsAt ||
      !parsePlacementDate(point.startsAt) ||
      !parsePlacementDate(point.endsAt) ||
      new Date(point.endsAt) <= new Date(point.startsAt) ||
      new Date(point.endsAt) <= now
    )
      throw new BadRequestException('Проверьте срок размещения');
    const colors = safePartnerAppearance(
      point.backgroundColor,
      point.textColor,
    );
    if (
      (point.backgroundColor && !parsePartnerColor(point.backgroundColor)) ||
      (point.textColor && !parsePartnerColor(point.textColor)) ||
      !isReadablePartnerColors(colors.backgroundColor, colors.textColor)
    )
      throw new BadRequestException('Выберите контрастную пару цветов');
    if (point.promoCode && !parsePartnerPromoCode(point.promoCode))
      throw new BadRequestException('Некорректный промокод');
    if (!optional(point.promoTerms, 240))
      throw new BadRequestException('Условия промокода: до 240 символов');
    if (point.imageAssetKey && !UUID.test(point.imageAssetKey))
      throw new BadRequestException('Некорректное изображение');
    if (!Array.isArray(point.contacts) || point.contacts.length > 100)
      throw new BadRequestException('Не более 100 контактов');
    const ids = new Set<string>();
    for (const c of point.contacts) {
      if (
        !['PHONE', 'EMAIL', 'WEBSITE', 'TELEGRAM', 'OTHER'].includes(c.type) ||
        !required(c.label, 80) ||
        !required(c.value, 500) ||
        !Number.isInteger(c.displayOrder) ||
        c.displayOrder < 0 ||
        (c.id && (!UUID.test(c.id) || ids.has(c.id)))
      )
        throw new BadRequestException('Проверьте контакты');
      const phone = c.value.replace(/[\s()-]/gu, '');
      const usable =
        c.type === 'PHONE'
          ? /^\+?[0-9]{5,15}$/u.test(phone)
          : c.type === 'EMAIL'
            ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(c.value)
            : c.type === 'TELEGRAM' && /^@[A-Za-z0-9_]{5,32}$/u.test(c.value)
              ? true
              : isSafePartnerButtonUrl(c.value);
      if (!usable)
        throw new BadRequestException(
          'Проверьте формат номера, email или HTTPS-ссылки контакта',
        );
      if (c.id) ids.add(c.id);
    }
  }
  async savePoint(
    tx: Prisma.TransactionClient,
    point: PointDraft,
    newStatus: PartnerPlacementStatus = 'ACTIVE',
  ) {
    this.validatePoint(point);
    const contacts = point.contacts.map((contact: ContactDraft) => ({
      id: contact.id,
      type: contact.type,
      label: contact.label,
      value: contact.value,
      displayOrder: contact.displayOrder,
    }));
    const placementData = {
      title: point.title!,
      category: point.category!,
      ...safePartnerAppearance(point.backgroundColor, point.textColor),
      description: point.description ?? null,
      latitude: point.latitude,
      longitude: point.longitude,
      displayAddress: point.displayAddress ?? null,
      imageAssetKey: point.imageAssetKey ?? null,
      promoCode: point.promoCode ?? null,
      promoTerms: point.promoCode ? (point.promoTerms ?? null) : null,
      startsAt: new Date(point.startsAt!),
      endsAt: new Date(point.endsAt!),
    };
    if (point.editingId) {
      const existing = await tx.partnerPoint.findUnique({
        where: { id: point.editingId },
      });
      if (
        !existing ||
        existing.status === 'ENDED' ||
        existing.cityId !== point.cityId ||
        (existing.imageAssetKey ?? null) !==
          (point.originalImageAssetKey ?? null)
      )
        throw new BadRequestException('Точка недоступна для изменения');
      const storedContacts = await tx.partnerPointContact.findMany({
        where: { partnerPointId: point.editingId },
        select: { id: true, type: true, value: true },
      });
      const stable = new Map(
        storedContacts.map((contact) => [contact.id, contact]),
      );
      const retained = contacts.filter((contact) => {
        const old = contact.id ? stable.get(contact.id) : null;
        return old && old.type === contact.type && old.value === contact.value;
      });
      const retainedIds = retained.map((contact) => contact.id as string);
      await tx.partnerPoint.update({
        where: { id: point.editingId },
        data: placementData,
      });
      await tx.partnerPointContact.deleteMany({
        where: {
          partnerPointId: point.editingId,
          id: { notIn: retainedIds },
        },
      });
      for (const contact of retained) {
        await tx.partnerPointContact.update({
          where: { id: contact.id },
          data: { label: contact.label, displayOrder: contact.displayOrder },
        });
      }
      const fresh = contacts.filter(
        (contact) => !retainedIds.includes(contact.id ?? ''),
      );
      if (fresh.length)
        await tx.partnerPointContact.createMany({
          data: fresh.map((contact) => ({
            partnerPointId: point.editingId as string,
            type: contact.type,
            label: contact.label,
            value: contact.value,
            displayOrder: contact.displayOrder,
          })),
        });
      if (
        existing.imageAssetKey &&
        existing.imageAssetKey !== point.imageAssetKey &&
        UUID.test(existing.imageAssetKey) &&
        (await tx.partnerPoint.count({
          where: { imageAssetKey: existing.imageAssetKey },
        })) === 0
      ) {
        await tx.partnerImageAsset.deleteMany({
          where: { key: existing.imageAssetKey },
        });
      }
      return point.editingId;
    } else {
      const created = await tx.partnerPoint.create({
        data: {
          cityId: point.cityId,
          ...placementData,
          status: newStatus,
          contacts: { create: contacts },
        },
      });
      return created.id;
    }
  }
  async saveBanner(
    tx: Prisma.TransactionClient,
    banner: BannerDraft,
    enabled: boolean,
  ) {
    if (
      !getCityConfig(banner.cityId) ||
      !required(banner.title, 160) ||
      !required(banner.text, 300) ||
      !required(banner.buttonLabel, 80) ||
      !banner.buttonUrl ||
      banner.buttonUrl.length > 2048 ||
      !isSafePartnerButtonUrl(banner.buttonUrl) ||
      !banner.partnerPointId ||
      !UUID.test(banner.partnerPointId) ||
      !banner.startsAt ||
      !banner.endsAt ||
      !parsePlacementDate(banner.startsAt) ||
      !parsePlacementDate(banner.endsAt) ||
      new Date(banner.endsAt) <= new Date(banner.startsAt) ||
      new Date(banner.endsAt) <= new Date()
    )
      throw new BadRequestException(
        'Проверьте содержание, ссылку и срок баннера',
      );
    const linked = await tx.partnerPoint.findUnique({
      where: { id: banner.partnerPointId },
    });
    if (
      !linked ||
      linked.cityId !== banner.cityId ||
      (enabled && linked.status !== 'ACTIVE')
    )
      throw new BadRequestException('Нужна активная точка того же города');
    const data = {
      title: banner.title,
      text: banner.text,
      buttonLabel: banner.buttonLabel,
      buttonUrl: banner.buttonUrl,
      partnerPointId: banner.partnerPointId,
      startsAt: new Date(banner.startsAt),
      endsAt: new Date(banner.endsAt),
      enabled,
    };
    const result = await tx.partnerCityBanner.upsert({
      where: { cityId: banner.cityId },
      create: { cityId: banner.cityId, ...data },
      update: data,
    });
    return result.id;
  }
  async pointStatus(
    tx: Prisma.TransactionClient,
    id: string,
    action: 'publish' | 'pause' | 'resume' | 'end',
  ) {
    const point = await tx.partnerPoint.findUnique({
      where: { id },
      include: { contacts: true },
    });
    if (!point) throw new BadRequestException('Точка не найдена');
    const from = {
      publish: 'DRAFT',
      pause: 'ACTIVE',
      resume: 'PAUSED',
      end: null,
    }[action];
    if (
      point.status === 'ENDED' ||
      (action === 'end' && !['ACTIVE', 'PAUSED'].includes(point.status)) ||
      (from && point.status !== from)
    )
      throw new BadRequestException('Переход статуса недоступен');
    if (action === 'publish' || action === 'resume')
      this.validatePoint({
        ...point,
        latitude: point.latitude ?? undefined,
        longitude: point.longitude ?? undefined,
        startsAt: point.startsAt.toISOString(),
        endsAt: point.endsAt.toISOString(),
        originalImageAssetKey: point.imageAssetKey,
      });
    const status =
      action === 'pause' ? 'PAUSED' : action === 'end' ? 'ENDED' : 'ACTIVE';
    await tx.partnerPoint.update({ where: { id }, data: { status } });
  }
  async bannerStatus(
    tx: Prisma.TransactionClient,
    cityId: string,
    action: 'enable' | 'pause' | 'end',
  ) {
    const banner = await tx.partnerCityBanner.findUnique({ where: { cityId } });
    if (!banner) throw new BadRequestException('Баннер не найден');
    if (action === 'enable') {
      const point = banner.partnerPointId
        ? await tx.partnerPoint.findUnique({
            where: { id: banner.partnerPointId },
          })
        : null;
      const now = new Date();
      if (
        !banner.title ||
        !banner.text ||
        !banner.buttonLabel ||
        !banner.buttonUrl ||
        !isSafePartnerButtonUrl(banner.buttonUrl) ||
        !banner.startsAt ||
        !banner.endsAt ||
        banner.startsAt > now ||
        banner.endsAt <= now ||
        !point ||
        point.cityId !== cityId ||
        point.status !== 'ACTIVE' ||
        point.startsAt > now ||
        point.endsAt <= now
      )
        throw new BadRequestException(
          'Баннер или связанная точка сейчас недоступны. Проверьте срок и статус.',
        );
    }
    await tx.partnerCityBanner.updateMany({
      where: {
        cityId,
        ...(action === 'end' ? { endsAt: { gt: new Date() } } : {}),
      },
      data:
        action === 'end'
          ? { enabled: false, endsAt: new Date() }
          : { enabled: action === 'enable' },
    });
  }
}
