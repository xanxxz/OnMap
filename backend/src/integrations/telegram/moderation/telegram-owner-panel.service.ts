import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  getAvailableCityIds,
  getCityConfig,
} from '../../../cities/city.registry';
import {
  parsePartnerOwnerIds,
  partnerUpdateOwner,
  type PartnerBotReply,
} from '../../../partner-placements/partner-bot.service';
import { formatSaratovTime } from '../../../push/push-campaign-time';
import {
  formatPartnerStatReport,
  partnerPeriodStart,
} from '../../../partner-placements/partner-stat-report';

const PAGE_SIZE = 6;
const ACTION_TTL_MS = 24 * 60 * 60_000;
const ownerStatusLabel = (status: string): string =>
  ({
    DRAFT: 'черновик',
    ACTIVE: 'активно',
    PAUSED: 'на паузе',
    ENDED: 'завершено',
    COMPLETED: 'выполнено',
    CANCELLED: 'отменено',
  })[status] ?? status;
const ownerCityLabel = (cityId: string): string =>
  getCityConfig(cityId)?.name ?? cityId;
type Screen =
  | 'HOME'
  | 'HELP'
  | 'POINTS'
  | 'POINT_CITY'
  | 'POINT'
  | 'POINT_END'
  | 'CONTACTS'
  | 'BANNERS'
  | 'BANNER'
  | 'BANNER_PREVIEW'
  | 'BANNER_ENABLE'
  | 'BANNER_END'
  | 'PUSH'
  | 'PUSH_LIST'
  | 'PUSH_DETAIL'
  | 'PUSH_END'
  | 'MODERATION'
  | 'CASES'
  | 'CASE'
  | 'CASE_SEARCH'
  | 'RESTRICTIONS'
  | 'STATS'
  | 'PAIR_CONFIRM'
  | 'SETTINGS';
type ScreenPayload = {
  id?: string;
  cityId?: string;
  filter?: string;
  page?: number;
  period?: '7' | '30' | 'ALL';
};
type Navigation = { screen: Screen; payload?: ScreenPayload };
type ButtonSpec = {
  text: string;
  action: string;
  payload?: Record<string, unknown>;
  once?: boolean;
};
type PanelKeyboard = NonNullable<PartnerBotReply['keyboard']>;
export type PanelDelegate =
  | { kind: 'PARTNER' | 'PUSH'; command: string }
  | { kind: 'MODERATION'; callbackData: string }
  | { kind: 'PAIR_CODE' }
  | { kind: 'PAIR_BY_PUSH' }
  | { kind: 'PAIR_CONFIRM'; code: string }
  | { kind: 'TEST_PUSH'; campaignId: string };
export type PanelReply = PartnerBotReply & {
  editMessageId?: number;
  delegate?: PanelDelegate;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
const positivePage = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 10_000)
    : 0;
const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
const nav = (screen: Screen, payload?: ScreenPayload): ButtonSpec => ({
  text: '',
  action: 'NAVIGATE',
  payload: { screen, payload: payload ?? {} },
});
const command = (
  text: string,
  kind: 'PARTNER' | 'PUSH',
  value: string,
): ButtonSpec => ({
  text,
  action: 'DELEGATE',
  payload: { kind, command: value },
  once: true,
});

/** UI-only coordinator. Domain writes remain in the existing owner-only bots. */
@Injectable()
export class TelegramOwnerPanelService {
  private readonly ownerIds: ReadonlySet<string>;
  private readonly partnerOwnerIds: ReadonlySet<string>;
  private readonly moderationOwnerId: string;
  private roadAndPartnerTotalsCache?: {
    expiresAt: number;
    eventCount: number;
    sourceLines: string;
    pointCount: number;
  };

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.partnerOwnerIds = parsePartnerOwnerIds(
      config.get<string>('TELEGRAM_PARTNER_OWNER_IDS'),
    );
    this.moderationOwnerId =
      config.get<string>('TELEGRAM_MODERATION_CHAT_ID')?.trim() ?? '';
    this.ownerIds = new Set([
      ...this.partnerOwnerIds,
      ...(this.moderationOwnerId ? [this.moderationOwnerId] : []),
    ]);
  }

  shouldHandle(update: unknown): boolean {
    const item = asRecord(update);
    const callback = asRecord(item?.callback_query);
    if (callback)
      return (
        typeof callback.data === 'string' && callback.data.startsWith('ui:')
      );
    const message = asRecord(item?.message);
    const text = str(message?.text)
      ?.trim()
      .split(/\s/u, 1)[0]
      ?.split('@', 1)[0];
    return ['/start', '/menu', '/cancel', '/help'].includes(text ?? '');
  }

  async shouldHandleSearchText(update: unknown): Promise<boolean> {
    const item = asRecord(update);
    const message = asRecord(item?.message);
    if (
      !message ||
      typeof message.text !== 'string' ||
      message.text.startsWith('/')
    )
      return false;
    const ownerId = partnerUpdateOwner(update, this.ownerIds);
    if (!ownerId) return false;
    const session = await this.prisma.telegramBotPanelSession.findUnique({
      where: { ownerTelegramId: ownerId },
      select: { screen: true },
    });
    return (
      (session?.screen === 'CASE_SEARCH' &&
        ownerId === this.moderationOwnerId) ||
      (session?.screen === 'PAIR_CONFIRM' && this.partnerOwnerIds.has(ownerId))
    );
  }

  async process(update: unknown): Promise<PanelReply> {
    const item = asRecord(update);
    const updateId = item?.update_id;
    if (typeof updateId !== 'number' || !Number.isSafeInteger(updateId))
      throw new Error('OWNER_PANEL_INVALID_UPDATE');
    const callback = asRecord(item?.callback_query);
    const callbackMessage = asRecord(callback?.message);
    const editMessageId =
      typeof callbackMessage?.message_id === 'number'
        ? callbackMessage.message_id
        : undefined;
    const message = asRecord(item?.message);
    const chat = asRecord((callbackMessage ?? message)?.chat);
    const chatId =
      typeof chat?.id === 'number' || typeof chat?.id === 'string'
        ? String(chat.id)
        : '';
    const ownerId = partnerUpdateOwner(update, this.ownerIds);
    const text = str(message?.text)?.trim() ?? '';

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<readonly { locked: boolean }[]>`
        SELECT pg_advisory_xact_lock(724513, 3) IS NULL AS locked
      `;
        const already = await tx.telegramModerationUpdate.findUnique({
          where: { updateId: BigInt(updateId) },
        });
        if (already)
          return { chatId, duplicate: true, callbackText: 'Уже обработано' };
        if (!ownerId) {
          await this.markProcessed(tx, updateId);
          return {
            chatId,
            callbackText: 'Недоступно',
            ...(callback
              ? {}
              : { text: 'Панель OnMap доступна только владельцу.' }),
          };
        }

        if (!callback) {
          const name = text.split(/\s/u, 1)[0]?.split('@', 1)[0];
          if (!text.startsWith('/') && ownerId === this.moderationOwnerId) {
            const session = await tx.telegramBotPanelSession.findUnique({
              where: { ownerTelegramId: ownerId },
              select: { screen: true },
            });
            if (session?.screen === 'CASE_SEARCH') {
              await this.markProcessed(tx, updateId);
              if (!/^[0-9a-f-]{8,36}$/iu.test(text))
                return {
                  chatId,
                  text: 'Введите ID дела или события целиком либо последние 8 символов ID.',
                };
              const suffix = `%${text.toLowerCase()}`;
              const matches = await tx.$queryRaw<readonly { id: string }[]>`
                SELECT id::text FROM road_event_moderation_cases
                WHERE id::text LIKE ${suffix} OR road_event_id::text LIKE ${suffix}
                ORDER BY created_at DESC LIMIT 2
              `;
              if (matches.length !== 1)
                return {
                  chatId,
                  text: matches.length
                    ? 'Найдено несколько дел. Уточните ID.'
                    : 'Дело не найдено.',
                  keyboard: {
                    inline_keyboard: [
                      [{ text: 'Главное меню', callback_data: 'ui:home' }],
                    ],
                  },
                };
              return this.render(tx, ownerId, 'CASE', {
                id: matches[0].id,
                filter: 'PENDING_REVIEW',
              });
            }
          }
          if (!text.startsWith('/') && this.partnerOwnerIds.has(ownerId)) {
            const session = await tx.telegramBotPanelSession.findUnique({
              where: { ownerTelegramId: ownerId },
              select: { screen: true },
            });
            if (session?.screen === 'PAIR_CONFIRM') {
              await this.markProcessed(tx, updateId);
              if (!/^[0-9A-F]{4}-?[0-9A-F]{4}-?[0-9A-F]{4}$/iu.test(text))
                return {
                  chatId,
                  text: 'Введите 12-значный код из уведомления. Он действует 10 минут.',
                };
              return { chatId, delegate: { kind: 'PAIR_CONFIRM', code: text } };
            }
          }
          if (name === '/cancel') {
            const partnerDraft = await tx.partnerBotDraft.findUnique({
              where: { ownerTelegramId: ownerId },
              select: { ownerTelegramId: true },
            });
            const pushDraft = await tx.pushBotDraft.findUnique({
              where: { ownerTelegramId: ownerId },
              select: { ownerTelegramId: true },
            });
            if (partnerDraft)
              return {
                chatId,
                delegate: { kind: 'PARTNER', command: '/partner_cancel' },
              };
            if (pushDraft)
              return {
                chatId,
                delegate: { kind: 'PUSH', command: '/push_abort' },
              };
          }
          await this.markProcessed(tx, updateId);
          const screen = name === '/help' ? 'HELP' : 'HOME';
          return this.render(tx, ownerId, screen, {}, undefined);
        }

        const data = str(callback.data) ?? '';
        if (data === 'ui:home' || data === 'ui:cancel') {
          if (data === 'ui:cancel') {
            const partnerDraft = await tx.partnerBotDraft.findUnique({
              where: { ownerTelegramId: ownerId },
              select: { ownerTelegramId: true },
            });
            const pushDraft = await tx.pushBotDraft.findUnique({
              where: { ownerTelegramId: ownerId },
              select: { ownerTelegramId: true },
            });
            if (partnerDraft)
              return {
                chatId,
                delegate: { kind: 'PARTNER', command: '/partner_cancel' },
              };
            if (pushDraft)
              return {
                chatId,
                delegate: { kind: 'PUSH', command: '/push_abort' },
              };
          }
          await this.markProcessed(tx, updateId);
          return this.render(tx, ownerId, 'HOME', {}, editMessageId);
        }
        const token = /^ui:([A-Za-z0-9_-]{12})$/u.exec(data)?.[1];
        const row = token
          ? await tx.telegramBotPanelAction.findUnique({ where: { token } })
          : null;
        const session = await tx.telegramBotPanelSession.findUnique({
          where: { ownerTelegramId: ownerId },
        });
        if (
          !row ||
          row.ownerTelegramId !== ownerId ||
          !session ||
          row.revision !== session.revision ||
          row.expiresAt <= new Date() ||
          row.consumedAt
        ) {
          await this.markProcessed(tx, updateId);
          return {
            chatId,
            text: 'Экран устарел, обновите данные.',
            callbackText: 'Экран устарел',
            keyboard: {
              inline_keyboard: [
                [{ text: 'Обновить меню', callback_data: 'ui:home' }],
              ],
            },
          };
        }
        const payload = asRecord(row.payload) ?? {};
        if (
          row.action === 'DELEGATE' ||
          row.action === 'MODERATE' ||
          row.action === 'PAIR_CODE' ||
          row.action === 'PAIR_BY_PUSH' ||
          row.action === 'TEST_PUSH'
        ) {
          const consumed = await tx.telegramBotPanelAction.updateMany({
            where: { token: row.token, consumedAt: null },
            data: { consumedAt: new Date() },
          });
          if (consumed.count !== 1) {
            await this.markProcessed(tx, updateId);
            return { chatId, callbackText: 'Уже обработано' };
          }
          // A mutation or one-time action invalidates every sibling button
          // on the same screen, preventing parallel taps from acting on stale state.
          await tx.telegramBotPanelSession.update({
            where: { ownerTelegramId: ownerId },
            data: { revision: { increment: 1 } },
          });
          if (row.action === 'MODERATE') {
            const callbackData = str(payload.callbackData);
            if (callbackData)
              return { chatId, delegate: { kind: 'MODERATION', callbackData } };
          }
          if (row.action === 'PAIR_CODE' && this.partnerOwnerIds.has(ownerId))
            return { chatId, delegate: { kind: 'PAIR_CODE' } };
          if (
            row.action === 'PAIR_BY_PUSH' &&
            this.partnerOwnerIds.has(ownerId)
          ) {
            await tx.telegramBotPanelSession.update({
              where: { ownerTelegramId: ownerId },
              data: { screen: 'PAIR_CONFIRM' },
            });
            return { chatId, delegate: { kind: 'PAIR_BY_PUSH' } };
          }
          if (row.action === 'TEST_PUSH' && this.partnerOwnerIds.has(ownerId)) {
            const campaignId = str(payload.campaignId);
            if (campaignId)
              return { chatId, delegate: { kind: 'TEST_PUSH', campaignId } };
          }
          const kind = payload.kind;
          const delegatedCommand = str(payload.command);
          if ((kind === 'PARTNER' || kind === 'PUSH') && delegatedCommand)
            return { chatId, delegate: { kind, command: delegatedCommand } };
        }
        await this.markProcessed(tx, updateId);
        const target = payload as { screen?: Screen; payload?: ScreenPayload };
        if (row.action !== 'NAVIGATE' || !target.screen)
          return { chatId, callbackText: 'Действие недоступно' };
        return this.render(
          tx,
          ownerId,
          target.screen,
          target.payload ?? {},
          editMessageId,
        );
      },
      { timeout: 20_000 },
    );
  }

  private async markProcessed(tx: Prisma.TransactionClient, updateId: number) {
    await tx.telegramModerationUpdate.create({
      data: { updateId: BigInt(updateId) },
    });
  }

  private async render(
    tx: Prisma.TransactionClient,
    ownerId: string,
    screen: Screen,
    payload: ScreenPayload,
    editMessageId?: number,
  ): Promise<PanelReply> {
    const rows: ButtonSpec[][] = [];
    const add = (...buttons: ButtonSpec[]) => rows.push(buttons);
    const link = (label: string, target: Screen, data?: ScreenPayload) => ({
      ...nav(target, data),
      text: label,
    });
    let title = '';
    let back: Navigation | null = null;
    const page = positivePage(payload.page);
    const isPartnerOwner = this.partnerOwnerIds.has(ownerId);
    const isModerator = ownerId === this.moderationOwnerId;
    if (
      (!isPartnerOwner &&
        [
          'POINTS',
          'POINT_CITY',
          'POINT',
          'POINT_END',
          'CONTACTS',
          'BANNERS',
          'BANNER',
          'BANNER_END',
          'PUSH',
          'PUSH_LIST',
          'PUSH_DETAIL',
          'PUSH_END',
          'STATS',
        ].includes(screen)) ||
      (!isModerator &&
        ['MODERATION', 'CASES', 'CASE', 'CASE_SEARCH', 'RESTRICTIONS'].includes(
          screen,
        ))
    ) {
      screen = 'HOME';
      payload = {};
    }
    if (screen === 'HOME') {
      title = 'OnMap · панель владельца\nВыберите раздел:';
      if (isPartnerOwner) {
        add(link('Партнёрские точки', 'POINTS'));
        add(link('Баннеры', 'BANNERS'), link('Push-рассылки', 'PUSH'));
      }
      if (isModerator) add(link('Модерация', 'MODERATION'));
      if (isPartnerOwner) add(link('Статистика', 'STATS'));
      add(link('Настройки', 'SETTINGS'), link('Помощь', 'HELP'));
    } else if (screen === 'HELP') {
      title =
        'OnMap · помощь\nВсе действия доступны через кнопки. Размещения и рассылки публикуются только после подтверждения. /cancel отменяет открытый мастер. Старые команды пока сохранены для совместимости.';
      back = { screen: 'HOME' };
    } else if (screen === 'POINTS') {
      const filter = payload.filter ?? 'ALL';
      const allowed = new Set(['ALL', 'DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']);
      const status =
        allowed.has(filter) && filter !== 'ALL' ? filter : undefined;
      const where = status
        ? { status: status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED' }
        : {};
      const points = await tx.partnerPoint.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE + 1,
        select: {
          id: true,
          title: true,
          cityId: true,
          status: true,
          endsAt: true,
        },
      });
      title = `Партнёрские точки · ${filter === 'ALL' ? 'все' : ownerStatusLabel(filter)} · стр. ${page + 1}\n${points.length ? 'Выберите точку:' : 'Список пуст.'}`;
      const unfinished = await tx.partnerBotDraft.findUnique({
        where: { ownerTelegramId: ownerId },
        select: { kind: true, updatedAt: true },
      });
      if (
        unfinished?.kind === 'POINT' &&
        unfinished.updatedAt.getTime() > Date.now() - ACTION_TTL_MS
      )
        add(
          command('Продолжить черновик мастера', 'PARTNER', '/partner_status'),
        );
      add(link('Создать точку', 'POINT_CITY'));
      add(
        link('Все', 'POINTS', { filter: 'ALL' }),
        link('Черновики', 'POINTS', { filter: 'DRAFT' }),
      );
      add(
        link('Активные', 'POINTS', { filter: 'ACTIVE' }),
        link('На паузе', 'POINTS', { filter: 'PAUSED' }),
      );
      add(link('Завершённые', 'POINTS', { filter: 'ENDED' }));
      for (const point of points.slice(0, PAGE_SIZE))
        add(
          link(
            `${point.title.slice(0, 26)} · ${ownerCityLabel(point.cityId)} · ${ownerStatusLabel(point.status)} · ${formatSaratovTime(point.endsAt)}`,
            'POINT',
            { id: point.id, filter, page },
          ),
        );
      if (page > 0 || points.length > PAGE_SIZE)
        add(
          ...[
            ...(page > 0
              ? [link('←', 'POINTS', { filter, page: page - 1 })]
              : []),
            ...(points.length > PAGE_SIZE
              ? [link('→', 'POINTS', { filter, page: page + 1 })]
              : []),
          ],
        );
      back = { screen: 'HOME' };
    } else if (screen === 'POINT_CITY') {
      title = 'Новая партнёрская точка\nВыберите город:';
      for (const cityId of getAvailableCityIds())
        add(command(cityId, 'PARTNER', `/partner_new ${cityId}`));
      back = { screen: 'POINTS' };
    } else if (screen === 'POINT') {
      const point = payload.id
        ? await tx.partnerPoint.findUnique({
            where: { id: payload.id },
            include: { contacts: true },
          })
        : null;
      if (!point) {
        title = 'Точка не найдена. Обновите список.';
      } else {
        title = `«${point.title}»\nГород: ${ownerCityLabel(point.cityId)}\nСтатус: ${ownerStatusLabel(point.status)}\nСрок: ${formatSaratovTime(point.startsAt)} — ${formatSaratovTime(point.endsAt)}\nАдрес: ${point.displayAddress ?? 'не указан'}\nКонтактов: ${point.contacts.length}; изображение: ${point.imageAssetKey ? 'есть' : 'нет'}; промокод: ${point.promoCode ? 'есть' : 'нет'}.`;
        if (point.status !== 'ENDED') {
          add(
            command('Редактировать', 'PARTNER', `/partner_edit ${point.id}`),
            link('Контакты', 'CONTACTS', { id: point.id }),
          );
          add(
            command(
              'Заменить изображение',
              'PARTNER',
              `/partner_image ${point.id}`,
            ),
            command('Промокод', 'PARTNER', `/partner_promo ${point.id}`),
          );
          add(
            link('Баннер', 'BANNER', { cityId: point.cityId }),
            link('Статистика', 'STATS', { id: point.id, period: '7' }),
          );
          if (point.status === 'ACTIVE')
            add(
              command('Создать push', 'PUSH', `/partner_push ${point.id}`),
              command('Приостановить', 'PARTNER', `/partner_pause ${point.id}`),
            );
          if (point.status === 'PAUSED')
            add(
              command('Возобновить', 'PARTNER', `/partner_resume ${point.id}`),
            );
          add(link('Завершить размещение', 'POINT_END', { id: point.id }));
        }
      }
      back = { screen: 'POINTS', payload: { filter: payload.filter, page } };
    } else if (screen === 'POINT_END') {
      const point = payload.id
        ? await tx.partnerPoint.findUnique({ where: { id: payload.id } })
        : null;
      title =
        point && point.status !== 'ENDED'
          ? `Завершить размещение «${point.title}»? После этого точка исчезнет из публичной карты.`
          : 'Точка уже завершена или недоступна.';
      if (point && point.status !== 'ENDED')
        add(command('Да, завершить', 'PARTNER', `/partner_end ${point.id}`));
      back = { screen: 'POINT', payload: { id: payload.id } };
    } else if (screen === 'CONTACTS') {
      const point = payload.id
        ? await tx.partnerPoint.findUnique({
            where: { id: payload.id },
            include: { contacts: { orderBy: { displayOrder: 'asc' } } },
          })
        : null;
      title = point
        ? `Контакты «${point.title}»\n${point.contacts.map((item, i) => `${i + 1}. ${item.label} (${item.type})`).join('\n') || 'Пока нет контактов.'}`
        : 'Точка не найдена.';
      if (point)
        add(
          command(
            'Управлять контактами',
            'PARTNER',
            `/partner_contacts ${point.id}`,
          ),
        );
      back = { screen: 'POINT', payload: { id: payload.id } };
    } else if (screen === 'BANNERS') {
      title = 'Баннеры по городам\nВыберите город:';
      for (const cityId of getAvailableCityIds())
        add(link(cityId, 'BANNER', { cityId }));
      back = { screen: 'HOME' };
    } else if (screen === 'BANNER') {
      const cityId = payload.cityId ?? '';
      const banner = cityId
        ? await tx.partnerCityBanner.findUnique({ where: { cityId } })
        : null;
      title = banner
        ? `Баннер · ${cityId}\n${banner.title ?? 'Без заголовка'}\n${banner.text ?? ''}\n${banner.enabled ? 'Включён' : 'Выключен'}\nСрок: ${banner.startsAt ? formatSaratovTime(banner.startsAt) : '—'} — ${banner.endsAt ? formatSaratovTime(banner.endsAt) : '—'}`
        : `Баннер · ${cityId}\nНе создан.`;
      if (cityId) {
        add(
          command(
            banner ? 'Полный мастер' : 'Создать баннер',
            'PARTNER',
            `/partner_banner ${cityId}`,
          ),
        );
        if (banner) {
          add(link('Предпросмотр', 'BANNER_PREVIEW', { cityId }));
          add(
            command(
              'Изменить текст',
              'PARTNER',
              `/partner_banner_quick ${cityId} text`,
            ),
          );
          add(
            command(
              'Изменить действие',
              'PARTNER',
              `/partner_banner_quick ${cityId} action`,
            ),
          );
          add(
            command(
              'Изменить срок',
              'PARTNER',
              `/partner_banner_quick ${cityId} period`,
            ),
          );
          if (!banner.enabled)
            add(link('Включить', 'BANNER_ENABLE', { cityId }));
        }
        if (banner?.enabled)
          add(
            command(
              'Приостановить',
              'PARTNER',
              `/partner_banner_off ${cityId}`,
            ),
          );
        if (banner && banner.endsAt && banner.endsAt > new Date())
          add(link('Завершить баннер', 'BANNER_END', { cityId }));
        if (banner?.partnerPointId)
          add(
            link('Статистика', 'STATS', {
              cityId,
              period: '7',
            }),
          );
      }
      back = { screen: 'BANNERS' };
    } else if (screen === 'BANNER_PREVIEW') {
      const cityId = payload.cityId ?? '';
      const banner = cityId
        ? await tx.partnerCityBanner.findUnique({
            where: { cityId },
            include: { partnerPoint: true },
          })
        : null;
      title = banner
        ? `Предпросмотр баннера · ${cityId}\n${banner.title ?? ''}\n${banner.text ?? ''}\nКнопка: ${banner.buttonLabel ?? '—'}\nТочка: ${banner.partnerPoint?.title ?? 'не выбрана'}\nСрок: ${banner.startsAt ? formatSaratovTime(banner.startsAt) : '—'} — ${banner.endsAt ? formatSaratovTime(banner.endsAt) : '—'}\nСостояние: ${banner.enabled ? 'включён' : 'выключен'}`
        : 'Баннер не найден.';
      if (banner && !banner.enabled)
        add(link('Включить', 'BANNER_ENABLE', { cityId }));
      back = { screen: 'BANNER', payload: { cityId } };
    } else if (screen === 'BANNER_ENABLE') {
      const cityId = payload.cityId ?? '';
      title = `Включить баннер в городе ${cityId}? Перед включением проверьте текст, действие, срок и связанную точку в предпросмотре.`;
      if (getAvailableCityIds().includes(cityId))
        add(
          command(
            'Да, включить',
            'PARTNER',
            `/partner_banner_enable ${cityId}`,
          ),
        );
      back = { screen: 'BANNER_PREVIEW', payload: { cityId } };
    } else if (screen === 'BANNER_END') {
      const cityId = payload.cityId ?? '';
      title = `Завершить баннер в городе ${cityId}? Он исчезнет из публичной выдачи. Это не изменит срок и статус партнёрской точки.`;
      if (getAvailableCityIds().includes(cityId))
        add(
          command(
            'Да, завершить баннер',
            'PARTNER',
            `/partner_banner_end ${cityId}`,
          ),
        );
      back = { screen: 'BANNER', payload: { cityId } };
    } else if (screen === 'PUSH') {
      title =
        'Push-рассылки\nСоздание не отправляет уведомления. Нужна отдельная кнопка подтверждения.';
      add(
        command('Новая информационная', 'PUSH', '/push_new'),
        link('Новая партнёрская', 'POINTS', { filter: 'ACTIVE' }),
      );
      for (const [label, filter] of [
        ['Запланированные', 'ACTIVE'],
        ['Активные расписания', 'RECURRING'],
        ['Завершённые', 'COMPLETED'],
        ['Приостановленные', 'PAUSED'],
      ] as const)
        add(link(label, 'PUSH_LIST', { filter }));
      add(link('Черновик', 'PUSH_LIST', { filter: 'DRAFT' }));
      back = { screen: 'HOME' };
    } else if (screen === 'PUSH_LIST') {
      const filter = payload.filter ?? 'ACTIVE';
      const where =
        filter === 'RECURRING'
          ? {
              ownerTelegramId: ownerId,
              status: 'ACTIVE' as const,
              scheduleKind: { in: ['DAILY' as const, 'WEEKLY' as const] },
            }
          : filter === 'DRAFT'
            ? null
            : filter === 'COMPLETED'
              ? {
                  ownerTelegramId: ownerId,
                  status: { in: ['COMPLETED' as const, 'CANCELLED' as const] },
                }
              : {
                  ownerTelegramId: ownerId,
                  status: filter as
                    'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'CANCELLED',
                };
      const campaigns = where
        ? await tx.pushCampaign.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: page * PAGE_SIZE,
            take: PAGE_SIZE + 1,
            select: { id: true, title: true, status: true, nextRunAt: true },
          })
        : [];
      const draft =
        filter === 'DRAFT'
          ? await tx.pushBotDraft.findUnique({
              where: { ownerTelegramId: ownerId },
            })
          : null;
      title = `Push · ${filter === 'RECURRING' ? 'повторяющиеся' : ownerStatusLabel(filter)} · стр. ${page + 1}\n${draft ? 'Есть незавершённый мастер.' : campaigns.length ? 'Выберите кампанию:' : 'Список пуст.'}`;
      if (draft)
        add(
          command('Продолжить черновик', 'PUSH', '/push_status'),
          command('Отменить черновик', 'PUSH', '/push_abort'),
        );
      for (const campaign of campaigns.slice(0, PAGE_SIZE))
        add(
          link(
            `${campaign.title.slice(0, 35)} · ${ownerStatusLabel(campaign.status)}${campaign.nextRunAt ? ` · ${formatSaratovTime(campaign.nextRunAt)}` : ''}`,
            'PUSH_DETAIL',
            { id: campaign.id, filter, page },
          ),
        );
      if (page > 0 || campaigns.length > PAGE_SIZE)
        add(
          ...[
            ...(page > 0
              ? [link('←', 'PUSH_LIST', { filter, page: page - 1 })]
              : []),
            ...(campaigns.length > PAGE_SIZE
              ? [link('→', 'PUSH_LIST', { filter, page: page + 1 })]
              : []),
          ],
        );
      back = { screen: 'PUSH' };
    } else if (screen === 'PUSH_DETAIL') {
      const campaign = payload.id
        ? await tx.pushCampaign.findFirst({
            where: { id: payload.id, ownerTelegramId: ownerId },
          })
        : null;
      if (!campaign) title = 'Рассылка не найдена.';
      else {
        const since =
          payload.period === 'ALL'
            ? undefined
            : new Date(
                Date.now() -
                  (payload.period === '30' ? 30 : 7) * 24 * 60 * 60_000,
              );
        const periodWhere = since ? { createdAt: { gte: since } } : {};
        const sent = await tx.pushOutbox.count({
          where: {
            campaignRun: { campaignId: campaign.id },
            status: 'SENT',
            ...periodWhere,
          },
        });
        const pending = await tx.pushOutbox.count({
          where: {
            campaignRun: { campaignId: campaign.id },
            status: { in: ['PENDING', 'RETRY', 'SENDING'] },
            ...periodWhere,
          },
        });
        title = `${campaign.title}\n${campaign.body}\nСтатус: ${ownerStatusLabel(campaign.status)}\nГорода: ${Array.isArray(campaign.cityIds) ? campaign.cityIds.map((id) => (typeof id === 'string' ? ownerCityLabel(id) : 'неизвестный город')).join(', ') : '—'}\nСледующий запуск: ${campaign.nextRunAt ? formatSaratovTime(campaign.nextRunAt) : 'нет'}\nПериод: ${payload.period === 'ALL' ? 'всё время' : `${payload.period ?? '7'} дней`}. Принято провайдером: ${sent}; в очереди: ${pending}. Принято не означает показ на экране.`;
        if (campaign.status === 'ACTIVE' || campaign.status === 'PAUSED') {
          add(command('Изменить', 'PUSH', `/push_edit ${campaign.id}`));
          add(
            command(
              campaign.status === 'ACTIVE' ? 'Приостановить' : 'Возобновить',
              'PUSH',
              `/${campaign.status === 'ACTIVE' ? 'push_pause' : 'push_resume'} ${campaign.id}`,
            ),
          );
          add(link('Завершить', 'PUSH_END', { id: campaign.id }));
        }
        add({
          text: 'Отправить тест мне',
          action: 'TEST_PUSH',
          payload: { campaignId: campaign.id },
          once: true,
        });
        add(
          link('7 дней', 'PUSH_DETAIL', { id: campaign.id, period: '7' }),
          link('30 дней', 'PUSH_DETAIL', { id: campaign.id, period: '30' }),
          link('Всё время', 'PUSH_DETAIL', { id: campaign.id, period: 'ALL' }),
        );
      }
      back = { screen: 'PUSH_LIST', payload: { filter: payload.filter, page } };
    } else if (screen === 'PUSH_END') {
      const campaign = payload.id
        ? await tx.pushCampaign.findFirst({
            where: { id: payload.id, ownerTelegramId: ownerId },
          })
        : null;
      title =
        campaign && ['ACTIVE', 'PAUSED'].includes(campaign.status)
          ? `Завершить рассылку «${campaign.title}»? Запланированные отправки будут отменены.`
          : 'Рассылка уже завершена или недоступна.';
      if (campaign && ['ACTIVE', 'PAUSED'].includes(campaign.status))
        add(command('Да, завершить', 'PUSH', `/push_cancel ${campaign.id}`));
      back = { screen: 'PUSH_DETAIL', payload: { id: payload.id } };
    } else if (screen === 'MODERATION') {
      title =
        'Модерация\nЖалобы и ограничения. Решения проходят существующие проверки lifecycle и аудит.';
      add(link('Открытые жалобы', 'CASES', { filter: 'PENDING_REVIEW' }));
      add(link('Недавние решения', 'CASES', { filter: 'DECIDED' }));
      add(link('Ограниченные пользователи', 'RESTRICTIONS'));
      add(link('Найти дело', 'CASE_SEARCH'));
      add(link('Обновить очередь', 'CASES', { filter: 'PENDING_REVIEW' }));
      back = { screen: 'HOME' };
    } else if (screen === 'CASE_SEARCH') {
      title =
        'Найти дело\nПришлите ID дела или события целиком либо последние 8 символов ID. Другие данные не отправляйте.';
      back = { screen: 'MODERATION' };
    } else if (screen === 'RESTRICTIONS') {
      const now = new Date();
      const restrictionRows = await tx.actorRestriction.findMany({
        where: { blockedUntil: { gt: now } },
        orderBy: { blockedUntil: 'asc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE + 1,
        select: { blockedUntil: true },
      });
      title = `Активные ограничения · стр. ${page + 1}\n${
        restrictionRows
          .slice(0, PAGE_SIZE)
          .map(
            (row, index) =>
              `${page * PAGE_SIZE + index + 1}. До ${formatSaratovTime(row.blockedUntil)}`,
          )
          .join('\n') || 'Активных ограничений нет.'
      }\nЛичные идентификаторы здесь не показываются.`;
      if (page > 0 || rows.length > PAGE_SIZE)
        add(
          ...[
            ...(page > 0
              ? [link('←', 'RESTRICTIONS', { page: page - 1 })]
              : []),
            ...(rows.length > PAGE_SIZE
              ? [link('→', 'RESTRICTIONS', { page: page + 1 })]
              : []),
          ],
        );
      back = { screen: 'MODERATION' };
    } else if (screen === 'CASES') {
      const pending = payload.filter !== 'DECIDED';
      const cases = await tx.roadEventModerationCase.findMany({
        where: pending
          ? { state: 'PENDING_REVIEW' }
          : { state: { not: 'PENDING_REVIEW' } },
        orderBy: { createdAt: 'desc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE + 1,
      });
      title = `${pending ? 'Открытые жалобы' : 'Недавние решения'} · стр. ${page + 1}\n${cases.length ? 'Выберите дело:' : 'Дел нет.'}`;
      for (const item of cases.slice(0, PAGE_SIZE))
        add(
          link(`${item.state} · ${formatSaratovTime(item.createdAt)}`, 'CASE', {
            id: item.id,
            filter: payload.filter,
            page,
          }),
        );
      if (page > 0 || cases.length > PAGE_SIZE)
        add(
          ...[
            ...(page > 0
              ? [link('←', 'CASES', { filter: payload.filter, page: page - 1 })]
              : []),
            ...(cases.length > PAGE_SIZE
              ? [link('→', 'CASES', { filter: payload.filter, page: page + 1 })]
              : []),
          ],
        );
      back = { screen: 'MODERATION' };
    } else if (screen === 'CASE') {
      const item = payload.id
        ? await tx.roadEventModerationCase.findUnique({
            where: { id: payload.id },
          })
        : null;
      const event = item
        ? await tx.roadEvent.findUnique({
            where: { id: item.roadEventId },
            select: {
              id: true,
              type: true,
              status: true,
              createdAt: true,
              expiresAt: true,
              createdByInstallationId: true,
            },
          })
        : null;
      const reports = event
        ? await tx.roadEventReport.count({ where: { roadEventId: event.id } })
        : 0;
      title =
        item && event
          ? `Дело OnMap\nТип: ${event.type}; событие: ${event.status}\nСоздано: ${formatSaratovTime(event.createdAt)}; истекает: ${formatSaratovTime(event.expiresAt)}\nЖалоб: ${reports}; решение: ${item.state}.`
          : 'Дело не найдено.';
      if (item?.state === 'PENDING_REVIEW' && event) {
        add({
          text: 'Восстановить метку',
          action: 'MODERATE',
          payload: { callbackData: `restore:${event.id}` },
          once: true,
        });
        add({
          text: 'Закрыть без действия',
          action: 'MODERATE',
          payload: { callbackData: `closehidden:${event.id}` },
          once: true,
        });
        if (event.createdByInstallationId) {
          for (const [label, hours] of [
            ['24 часа', 24],
            ['7 дней', 168],
            ['30 дней', 720],
          ] as const)
            add({
              text: `Ограничить на ${label}`,
              action: 'MODERATE',
              payload: { callbackData: `ban:${event.id}:${hours}` },
              once: true,
            });
        }
        const next = await tx.roadEventModerationCase.findFirst({
          where: { state: 'PENDING_REVIEW', id: { not: item.id } },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next)
          add(
            link('Следующее дело', 'CASE', {
              id: next.id,
              filter: 'PENDING_REVIEW',
            }),
          );
      }
      back = { screen: 'CASES', payload: { filter: payload.filter, page } };
    } else if (screen === 'STATS') {
      if (payload.cityId) {
        const banner = await tx.partnerCityBanner.findUnique({
          where: { cityId: payload.cityId },
          select: { id: true, title: true, partnerPointId: true },
        });
        const period = payload.period ?? '7';
        const since = partnerPeriodStart(period, new Date());
        const bannerStatRows = banner?.partnerPointId
          ? await tx.partnerStatDaily.groupBy({
              by: ['action'],
              where: {
                partnerPointId: banner.partnerPointId,
                detailId: banner.id,
                ...(since ? { day: { gte: since } } : {}),
              },
              _sum: { count: true },
            })
          : [];
        const impressions =
          bannerStatRows.find((row) => row.action === 'BANNER_IMPRESSION')?._sum.count ??
          0;
        const clicks =
          bannerStatRows.find((row) => row.action === 'BANNER_CLICK')?._sum.count ?? 0;
        title = `Баннер «${banner?.title ?? 'не найден'}» · ${period === 'ALL' ? 'всё время' : `${period} дней`}\nКвалифицированные показы: ${impressions}\nНажатия: ${clicks}\nВсего действий с баннером: ${impressions + clicks}.`;
        add(
          link('7 дней', 'STATS', { cityId: payload.cityId, period: '7' }),
          link('30 дней', 'STATS', { cityId: payload.cityId, period: '30' }),
          link('Всё время', 'STATS', { cityId: payload.cityId, period: 'ALL' }),
        );
        back = { screen: 'BANNER', payload: { cityId: payload.cityId } };
      } else if (payload.id) {
        const point = await tx.partnerPoint.findUnique({
          where: { id: payload.id },
          select: {
            title: true,
            contacts: { select: { id: true, label: true } },
          },
        });
        const period = payload.period ?? '7';
        const since = partnerPeriodStart(period, new Date());
        const pointStatRows = await tx.partnerStatDaily.groupBy({
          by: ['action', 'detailId', 'day'],
          where: {
            partnerPointId: payload.id,
            ...(since ? { day: { gte: since } } : {}),
          },
          _sum: { count: true },
        });
        title = `Статистика «${point?.title ?? 'точка'}» · ${period === 'ALL' ? 'всё время' : `${period} дней`}\n${formatPartnerStatReport(pointStatRows, point?.contacts ?? [], period, new Date())}`;
        add(
          link('7 дней', 'STATS', { id: payload.id, period: '7' }),
          link('30 дней', 'STATS', { id: payload.id, period: '30' }),
          link('Всё время', 'STATS', { id: payload.id, period: 'ALL' }),
        );
        back = { screen: 'POINT', payload: { id: payload.id } };
      } else {
        const since = partnerPeriodStart(payload.period ?? '7', new Date());
        const partnerActions = await tx.partnerStatDaily.groupBy({
          by: ['action'],
          where: since ? { day: { gte: since } } : {},
          _sum: { count: true },
        });
        const actionCount = (kind: string) =>
          partnerActions.find((row) => row.action === kind)?._sum.count ?? 0;
        let totals = this.roadAndPartnerTotalsCache;
        if (!totals || totals.expiresAt <= Date.now()) {
          const [pointCount, eventSources] = await Promise.all([
            tx.partnerPoint.count(),
            tx.roadEvent.groupBy({ by: ['source'], _count: { _all: true } }),
          ]);
          totals = {
            expiresAt: Date.now() + 60_000,
            pointCount,
            eventCount: eventSources.reduce(
              (sum, row) => sum + row._count._all,
              0,
            ),
            sourceLines: eventSources
              .map(
                (row) =>
                  `${row.source === 'USER' ? 'пользователи' : 'Telegram'}: ${row._count._all}`,
              )
              .join('; '),
          };
          this.roadAndPartnerTotalsCache = totals;
        }
        const identityCount = await tx.anonymousIdentityCount.findUnique({
          where: { id: 1 },
        });
        const campaignCount = await tx.pushCampaign.count({
          where: { ownerTelegramId: ownerId },
        });
        const sentPushCount = await tx.pushOutbox.count({
          where: {
            campaignRun: { campaign: { ownerTelegramId: ownerId } },
            status: 'SENT',
            ...(since ? { createdAt: { gte: since } } : {}),
          },
        });
        const openCases = await tx.roadEventModerationCase.count({
          where: { state: 'PENDING_REVIEW' },
        });
        const identityLine = identityCount
          ? `Анонимные идентификаторы с ${identityCount.startedAt.toLocaleDateString('ru-RU', { timeZone: 'Europe/Saratov' })}: ${identityCount.count.toString()} (не число людей).`
          : 'Учёт анонимных идентификаторов ещё не начался; прежние установки будут учтены при первом обращении.';
        title = `Общая сводка · ${payload.period === 'ALL' ? 'всё время' : `${payload.period ?? '7'} дней`}\nДорожных меток за всё время: ${totals.eventCount} (${totals.sourceLines || 'нет'}).\nПартнёрских точек за всё время: ${totals.pointCount}.\n${identityLine}\nКампаний всего: ${campaignCount}; открытых жалоб: ${openCases}.\nОткрытий карточек: ${actionCount('POINT_OPEN')}; нажатий контактов: ${actionCount('CONTACT_CLICK')}; показов баннеров: ${actionCount('BANNER_IMPRESSION')}; нажатий баннеров: ${actionCount('BANNER_CLICK')}; принято push провайдером: ${sentPushCount}.`;
        add(
          link('7 дней', 'STATS', { period: '7' }),
          link('30 дней', 'STATS', { period: '30' }),
          link('Всё время', 'STATS', { period: 'ALL' }),
        );
        add(
          link('По точкам и баннерам', 'POINTS'),
          link('По push', 'PUSH_LIST', { filter: 'ACTIVE' }),
        );
        back = { screen: 'HOME' };
      }
    } else if (screen === 'SETTINGS') {
      const restrictions = isModerator
        ? await tx.actorRestriction.count({
            where: { blockedUntil: { gt: new Date() } },
          })
        : null;
      title = `Настройки и состояние\n${restrictions === null ? '' : `Активных ограничений: ${restrictions}.\n`}Push: ${process.env.PUSH_ENQUEUE_ENABLED === 'true' && process.env.PUSH_DELIVERY_ENABLED === 'true' ? 'включены' : 'выключены'}.\nУправление секретами и параметрами сервера через Telegram недоступно.`;
      if (isPartnerOwner)
        add({
          text: 'Прислать код на единственный iPhone',
          action: 'PAIR_BY_PUSH',
          once: true,
        });
      if (isPartnerOwner)
        add({
          text: 'Код для ввода в приложении',
          action: 'PAIR_CODE',
          once: true,
        });
      back = { screen: 'HOME' };
    } else if (screen === 'PAIR_CONFIRM') {
      title =
        'Код отправлен на единственный подходящий iPhone. Пришлите сюда 12-значный код из уведомления в течение 10 минут. Если уведомление не пришло, вернитесь в настройки.';
      back = { screen: 'SETTINGS' };
    }

    if (screen !== 'HOME') {
      if (back)
        add(
          link('← Назад', back.screen, back.payload),
          link('Главное меню', 'HOME'),
        );
      add(link('Обновить', screen, payload));
    } else add(link('Обновить', 'HOME'));
    const previous = await tx.telegramBotPanelSession.findUnique({
      where: { ownerTelegramId: ownerId },
    });
    const revision = (previous?.revision ?? 0) + 1;
    await tx.telegramBotPanelSession.upsert({
      where: { ownerTelegramId: ownerId },
      create: {
        ownerTelegramId: ownerId,
        screen,
        revision,
        payload,
      },
      update: { screen, revision, payload },
    });
    await tx.telegramBotPanelAction.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const keyboard: PanelKeyboard = { inline_keyboard: [] };
    for (const row of rows) {
      const result: PanelKeyboard['inline_keyboard'][number] = [];
      for (const button of row) {
        const token = randomBytes(9).toString('base64url');
        await tx.telegramBotPanelAction.create({
          data: {
            token,
            ownerTelegramId: ownerId,
            revision,
            action: button.action,
            payload: (button.payload ?? {}) as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + ACTION_TTL_MS),
          },
        });
        result.push({ text: button.text, callback_data: `ui:${token}` });
      }
      keyboard.inline_keyboard.push(result);
    }
    return {
      chatId: ownerId,
      text: title.slice(0, 4_000),
      keyboard,
      ...(editMessageId ? { editMessageId } : {}),
    };
  }
}
