import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { getCityConfig } from '../cities/city.registry';
import { PrismaService } from '../database/prisma.service';
import {
  advancePartnerDraft,
  BannerDraft,
  partnerDraftPrompt,
  PartnerDraftState,
  PointDraft,
} from './partner-bot.flow';
import { PartnerManagementService } from './partner-management.service';
import { normalizePartnerImage, PartnerImageError } from './partner-image';
import { queuePartnerPush } from '../push/push-queue';
import { PARTNER_PUSH_MIN_INTERVAL_MS } from '../push/push-policy';
import { formatPartnerStatReport } from './partner-stat-report';
import { cityLocalParts, cityLocalToUtc } from '../cities/city-local-time';

type BotKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};
export interface PartnerBotReply {
  chatId: string;
  text?: string;
  keyboard?: BotKeyboard;
  callbackText?: string;
  duplicate?: boolean;
}

type BotRecord = Record<string, unknown>;
const asRecord = (value: unknown): BotRecord | null =>
  value !== null && typeof value === 'object' ? (value as BotRecord) : null;
const numericId = (value: unknown): string | null =>
  (typeof value === 'number' || typeof value === 'string') &&
  /^\d+$/u.test(String(value))
    ? String(value)
    : null;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const localDay = (
  cityId: string,
  offset: number,
  now = new Date(),
): string | null => {
  const timeZone = getCityConfig(cityId)?.timeZone;
  if (!timeZone) return null;
  const p = cityLocalParts(now, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + offset))
    .toISOString()
    .slice(0, 10);
};

const dateKeyboardFor = (state: PartnerDraftState): BotKeyboard => {
  const payload = state.payload;
  const revision = state.revision;
  const selected = payload.dateSelection;
  const option = (text: string, action: string) => ({
    text,
    callback_data: `pp:date:${action}:${revision}`,
  });
  if (selected?.day && selected.hour !== undefined)
    return {
      inline_keyboard: [
        [0, 15, 30, 45].map((minute) =>
          option(`:${String(minute).padStart(2, '0')}`, `minute${minute}`),
        ),
        [option('← Часы', 'back')],
        [option('Отмена', 'cancel')],
      ],
    };
  if (selected?.day)
    return {
      inline_keyboard: [
        ...Array.from({ length: 6 }, (_rowValue, rowIndex) =>
          Array.from({ length: 4 }, (_columnValue, columnIndex) => {
            const hour = rowIndex * 4 + columnIndex;
            return option(`${String(hour).padStart(2, '0')}:00`, `hour${hour}`);
          }),
        ),
        [option('← Дата', 'back')],
        [option('Отмена', 'cancel')],
      ],
    };
  if (selected?.page !== undefined) {
    const first = selected.page * 7;
    return {
      inline_keyboard: [
        ...Array.from({ length: 7 }, (_, index) => {
          const offset = first + index;
          return [
            option(
              localDay(payload.cityId, offset) ?? `День ${offset}`,
              `day${offset}`,
            ),
          ];
        }),
        [
          ...(selected.page > 0
            ? [option('← Раньше', `page${selected.page - 1}`)]
            : []),
          ...(selected.page < 51
            ? [option('Позже →', `page${selected.page + 1}`)]
            : []),
        ],
        [option('Отмена', 'cancel')],
      ],
    };
  }
  return {
    inline_keyboard: [
      ...(state.step === 'STARTS_AT' ? [[option('Сейчас', 'now')]] : []),
      [option('Сегодня', 'day0'), option('Завтра', 'day1')],
      [option('Выбрать дату', 'page0')],
      ...((state.step === 'STARTS_AT' ? payload.startsAt : payload.endsAt)
        ? [[option('Оставить прежнее', 'keep')]]
        : []),
      [option('Отмена', 'cancel')],
    ],
  };
};

export const parsePartnerOwnerIds = (
  raw: string | undefined,
): ReadonlySet<string> =>
  new Set(
    (raw ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => /^\d+$/u.test(part)),
  );

export const partnerUpdateOwner = (
  update: unknown,
  ownerIds: ReadonlySet<string>,
): string | null => {
  const item = asRecord(update);
  const callback = asRecord(item?.callback_query);
  const message = callback
    ? asRecord(callback.message)
    : asRecord(item?.message);
  const chat = asRecord(message?.chat);
  const sender = callback ? asRecord(callback.from) : asRecord(message?.from);
  const chatId = numericId(chat?.id);
  const senderId = numericId(sender?.id);
  return chat?.type === 'private' &&
    chatId &&
    senderId === chatId &&
    ownerIds.has(senderId)
    ? senderId
    : null;
};

const keyboardFor = (state: PartnerDraftState): BotKeyboard | undefined => {
  const revision = state.revision;
  if (state.step === 'STARTS_AT' || state.step === 'ENDS_AT')
    return dateKeyboardFor(state);
  if (state.kind === 'POINT' && state.step === 'BACKGROUND_COLOR')
    return {
      inline_keyboard: [
        [
          { text: 'Лесной', callback_data: `pp:color:153D32:${revision}` },
          { text: 'Синий', callback_data: `pp:color:285C78:${revision}` },
        ],
        [
          { text: 'Кремовый', callback_data: `pp:color:F7F4EA:${revision}` },
          { text: 'Графит', callback_data: `pp:color:263D35:${revision}` },
        ],
      ],
    };
  if (state.kind === 'POINT' && state.step === 'TEXT_COLOR')
    return {
      inline_keyboard: [
        [
          {
            text: 'Светлый текст',
            callback_data: `pp:color:FDFBF4:${revision}`,
          },
          {
            text: 'Тёмный текст',
            callback_data: `pp:color:14241E:${revision}`,
          },
        ],
      ],
    };
  if (state.step === 'CONTACT_CHOICE')
    return {
      inline_keyboard: [
        ...(state.kind === 'POINT'
          ? (state.payload as PointDraft).contacts
          : []
        ).map((contact, index) => [
          {
            text: `${index + 1}. ${contact.label.slice(0, 28)} · изменить`,
            callback_data: `pp:contact:edit:${index}:${revision}`,
          },
          {
            text: 'Удалить',
            callback_data: `pp:contact:ask:${index}:${revision}`,
          },
          {
            text: '↑',
            callback_data: `pp:contact:up:${index}:${revision}`,
          },
          {
            text: '↓',
            callback_data: `pp:contact:down:${index}:${revision}`,
          },
        ]),
        [{ text: 'Добавить контакт', callback_data: `pp:add:${revision}` }],
        [{ text: 'Готово', callback_data: `pp:done:${revision}` }],
        [{ text: 'Отмена', callback_data: `pp:cancel:${revision}` }],
      ],
    };
  if (state.kind === 'POINT' && state.step === 'CONTACT_TYPE')
    return {
      inline_keyboard: [
        ...(['PHONE', 'EMAIL', 'WEBSITE', 'TELEGRAM', 'OTHER'] as const).map(
          (type) => [
            {
              text: (
                {
                  PHONE: 'Телефон',
                  EMAIL: 'Почта',
                  WEBSITE: 'Сайт',
                  TELEGRAM: 'Telegram',
                  OTHER: 'Другое / WhatsApp-ссылка',
                } as const
              )[type],
              callback_data: `pp:ct:${type}:${revision}`,
            },
          ],
        ),
        [{ text: 'Отмена', callback_data: `pp:cancel:${revision}` }],
      ],
    };
  if (state.kind === 'POINT' && state.step === 'COORDINATE')
    return {
      inline_keyboard: [
        [
          {
            text: 'Отправить геопозицию Telegram',
            callback_data: `pp:coord:location:${revision}`,
          },
        ],
        [
          {
            text: 'Ввести координаты',
            callback_data: `pp:coord:text:${revision}`,
          },
        ],
        [{ text: 'Отмена', callback_data: `pp:cancel:${revision}` }],
      ],
    };
  if (state.kind === 'BANNER' && state.step === 'POINT_ID') {
    const choices = (state.payload as BannerDraft).pointChoices ?? [];
    return {
      inline_keyboard: [
        ...choices.map((point, index) => [
          {
            text: point.title.slice(0, 45),
            callback_data: `pp:bp:${index}:${revision}`,
          },
        ]),
        [{ text: 'Отмена', callback_data: `pp:cancel:${revision}` }],
      ],
    };
  }
  if (state.step === 'PREVIEW')
    return {
      inline_keyboard: [
        [
          {
            text:
              state.kind === 'BANNER' ? 'Включить баннер' : 'Подтвердить точку',
            callback_data: `pp:confirm:${revision}`,
          },
        ],
        ...(state.kind === 'POINT'
          ? [
              [
                {
                  text: 'Изменить поле',
                  callback_data: `pp:fields:${revision}`,
                },
              ],
              [
                {
                  text: 'Сохранить как черновик',
                  callback_data: `pp:save:${revision}`,
                },
              ],
            ]
          : []),
        [{ text: 'Отмена', callback_data: `pp:cancel:${revision}` }],
      ],
    };
  return undefined;
};

const draftFromRow = (row: {
  kind: string;
  step: string;
  payload: unknown;
  revision: number;
}): PartnerDraftState => ({
  kind: row.kind as PartnerDraftState['kind'],
  step: row.step,
  payload: row.payload as PartnerDraftState['payload'],
  revision: row.revision,
});

const help = [
  'Партнёрские размещения — только владелец.',
  '/partner_new <cityId> — новая точка',
  '/partner_edit <UUID> — редактировать точку',
  '/partner_list <cityId> — список точек',
  '/partner_stats <UUID> — действия за 7/30 дней и всё время',
  '/partner_pause|resume|end <UUID> — статус точки',
  '/partner_banner <cityId> — мастер баннера',
  '/partner_banner_off <cityId> — выключить баннер',
  '/partner_price point|banner <UUID> <рубли> — согласованная цена',
  '/partner_paid point|banner <UUID> — вручную отметить оплату',
  '/partner_push <UUID> — отдельно подтвердить рекламный push',
  '/partner_status — продолжить мастер, /partner_cancel — отменить',
].join('\n');

@Injectable()
export class PartnerBotService {
  private readonly ownerIds: ReadonlySet<string>;
  private readonly management = new PartnerManagementService();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.ownerIds = parsePartnerOwnerIds(
      config.get<string>('TELEGRAM_PARTNER_OWNER_IDS'),
    );
  }

  async shouldHandle(update: unknown): Promise<boolean> {
    const ownerId = partnerUpdateOwner(update, this.ownerIds);
    if (!ownerId) return false;
    const item = asRecord(update);
    const callback = asRecord(item?.callback_query);
    if (callback)
      return (
        typeof callback.data === 'string' && callback.data.startsWith('pp:')
      );
    const message = asRecord(item?.message);
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (/^\/partner(?:_|\s|$)/iu.test(text)) return true;
    if (
      text.startsWith('/') &&
      !/^\/(?:skip|keep|done|add_contact|clear_contacts|clear_promo|clear_terms)(?:\s|$)/iu.test(
        text,
      )
    )
      return false;
    const draft = await this.prisma.partnerBotDraft.findUnique({
      where: { ownerTelegramId: ownerId },
      select: { ownerTelegramId: true },
    });
    return draft !== null;
  }

  async isAwaitingImage(update: unknown): Promise<boolean> {
    const ownerId = partnerUpdateOwner(update, this.ownerIds);
    if (!ownerId) return false;
    const draft = await this.prisma.partnerBotDraft.findUnique({
      where: { ownerTelegramId: ownerId },
      select: { kind: true, step: true },
    });
    return draft?.kind === 'POINT' && draft.step === 'IMAGE';
  }

  async process(
    update: unknown,
    imageInput?: { bytes: Buffer } | { error: string },
  ): Promise<PartnerBotReply> {
    const ownerId = partnerUpdateOwner(update, this.ownerIds);
    if (!ownerId) throw new Error('PARTNER_BOT_UNAUTHORIZED');
    const item = asRecord(update);
    const updateId = item?.update_id;
    if (typeof updateId !== 'number' || !Number.isSafeInteger(updateId))
      throw new Error('PARTNER_BOT_INVALID_UPDATE');
    const callback = asRecord(item?.callback_query);
    const message = asRecord(item?.message);
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    const location = asRecord(message?.location);
    const input = {
      text,
      ...(typeof location?.latitude === 'number' &&
      typeof location.longitude === 'number'
        ? {
            location: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
          }
        : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      // Serialize every partner action, including callbacks from older keyboards.
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(724513, 1)`;
      const processed = await tx.telegramModerationUpdate.findUnique({
        where: { updateId: BigInt(updateId) },
      });
      if (processed)
        return {
          chatId: ownerId,
          duplicate: true,
          callbackText: 'Уже обработано',
        };

      const row = await tx.partnerBotDraft.findUnique({
        where: { ownerTelegramId: ownerId },
      });
      const state = row ? draftFromRow(row) : null;
      if (
        row?.updatedAt &&
        row.updatedAt.getTime() < Date.now() - 24 * 60 * 60_000
      ) {
        if (state) await this.deletePendingImage(tx, state);
        await tx.partnerBotDraft.delete({
          where: { ownerTelegramId: ownerId },
        });
        await tx.telegramModerationUpdate.create({
          data: { updateId: BigInt(updateId) },
        });
        return {
          chatId: ownerId,
          text: 'Незавершённый мастер истёк через 24 часа. Откройте меню и начните заново.',
        };
      }
      let reply: PartnerBotReply;
      if (callback) {
        reply = await this.processCallback(
          tx,
          ownerId,
          state,
          typeof callback.data === 'string' ? callback.data : '',
        );
      } else if (/^\/partner(?:_|\s|$)/iu.test(text)) {
        reply = await this.processCommand(tx, ownerId, state, text);
      } else if (state) {
        if (state.kind === 'POINT' && state.step === 'IMAGE' && imageInput) {
          if ('error' in imageInput) {
            reply = { chatId: ownerId, text: imageInput.error };
          } else {
            try {
              const png = await normalizePartnerImage(imageInput.bytes);
              const key = randomUUID();
              await tx.partnerImageAsset.create({
                data: { key, pngBytes: Uint8Array.from(png) },
              });
              const previous = state.payload as PointDraft;
              await this.deletePendingImage(tx, state);
              const updated: PartnerDraftState = {
                ...state,
                step: previous.quickEdit === 'IMAGE' ? 'PREVIEW' : 'PROMO_CODE',
                revision: state.revision + 1,
                payload: { ...previous, imageAssetKey: key },
              };
              await tx.partnerBotDraft.update({
                where: { ownerTelegramId: ownerId },
                data: {
                  step: updated.step,
                  revision: updated.revision,
                  payload: updated.payload as unknown as Prisma.InputJsonValue,
                },
              });
              reply = this.draftReply(ownerId, updated);
            } catch (error) {
              if (!(error instanceof PartnerImageError)) throw error;
              reply = {
                chatId: ownerId,
                text:
                  error.reason === 'SIZE'
                    ? 'Изображение слишком большое. Пришлите файл до 4 МБ.'
                    : 'Файл не является исправным PNG, JPEG или WebP. Пришлите другое изображение.',
              };
            }
          }
        } else {
          const advanced = advancePartnerDraft(state, input, new Date());
          if (advanced.error)
            reply = {
              chatId: ownerId,
              text: advanced.error,
              callbackText: advanced.error,
            };
          else {
            await tx.partnerBotDraft.update({
              where: { ownerTelegramId: ownerId },
              data: {
                step: advanced.state.step,
                payload: advanced.state
                  .payload as unknown as Prisma.InputJsonValue,
                revision: advanced.state.revision,
              },
            });
            reply = this.draftReply(ownerId, advanced.state);
          }
        }
      } else reply = { chatId: ownerId, text: help };

      await tx.telegramModerationUpdate.create({
        data: { updateId: BigInt(updateId) },
      });
      return reply;
    });
  }

  private async deletePendingImage(
    tx: Prisma.TransactionClient,
    state: PartnerDraftState | null,
  ): Promise<void> {
    if (state?.kind !== 'POINT') return;
    const point = state.payload as PointDraft;
    if (
      point.imageAssetKey &&
      point.imageAssetKey !== point.originalImageAssetKey &&
      UUID.test(point.imageAssetKey)
    ) {
      await tx.partnerImageAsset.deleteMany({
        where: { key: point.imageAssetKey },
      });
    }
  }

  private draftReply(
    ownerId: string,
    state: PartnerDraftState,
  ): PartnerBotReply {
    const timeZone = getCityConfig(state.payload.cityId)?.timeZone;
    const dateStep = state.step === 'STARTS_AT' || state.step === 'ENDS_AT';
    const selection = state.payload.dateSelection;
    return {
      chatId: ownerId,
      text: `${partnerDraftPrompt(state)}${dateStep ? `\nЧасовой пояс: ${timeZone ?? 'не задан'}.${selection?.day ? ` Дата: ${selection.day}${selection.hour !== undefined ? `, час ${selection.hour}:00` : ''}.` : ''}` : ''}`,
      keyboard: keyboardFor(state),
      callbackText: 'Готово',
    };
  }

  private async processCommand(
    tx: Prisma.TransactionClient,
    ownerId: string,
    state: PartnerDraftState | null,
    text: string,
  ): Promise<PartnerBotReply> {
    const [rawCommand, ...args] = text.split(/\s+/u);
    const command = rawCommand?.split('@', 1)[0]?.toLowerCase();
    const respond = (message: string): PartnerBotReply => ({
      chatId: ownerId,
      text: message,
    });
    if (command === '/partner' || command === '/partner_help')
      return respond(help);
    if (command === '/partner_status')
      return state
        ? this.draftReply(ownerId, state)
        : respond('Незавершённого мастера нет. /partner — команды.');
    if (command === '/partner_cancel') {
      if (state) {
        await this.deletePendingImage(tx, state);
        await tx.partnerBotDraft.delete({
          where: { ownerTelegramId: ownerId },
        });
      }
      return respond('Мастер отменён. Размещение не изменено.');
    }
    if (command === '/partner_push') {
      if (process.env.PUSH_ENQUEUE_ENABLED !== 'true')
        return respond('Рекламная рассылка пока не включена на сервере.');
      const id = args[0];
      if (!id || !UUID.test(id)) return respond('Укажите UUID активной точки.');
      const now = new Date();
      const point = await tx.partnerPoint.findUnique({ where: { id } });
      if (
        !point ||
        point.status !== 'ACTIVE' ||
        point.startsAt > now ||
        point.endsAt <= now ||
        point.latitude === null ||
        point.longitude === null
      )
        return respond('Активная точка недоступна для рассылки.');
      const recent = await tx.partnerPushCampaign.findFirst({
        where: {
          partnerPointId: id,
          status: 'QUEUED',
          approvedAt: {
            gt: new Date(now.getTime() - PARTNER_PUSH_MIN_INTERVAL_MS),
          },
        },
        select: { id: true },
      });
      if (recent)
        return respond(
          'Повторную рассылку этой точки можно подтвердить через 24 часа.',
        );
      const campaign = await tx.partnerPushCampaign.create({
        data: { partnerPointId: id },
      });
      return {
        chatId: ownerId,
        text: `Отдельная рекламная рассылка для «${point.title}» по городу ${point.cityId}. Создание и редактирование точки сами push не отправляют. Подтвердить?`,
        keyboard: {
          inline_keyboard: [
            [
              {
                text: 'Подтвердить рассылку',
                callback_data: `pp:push:${campaign.id}:confirm`,
              },
            ],
            [
              {
                text: 'Отмена',
                callback_data: `pp:push:${campaign.id}:cancel`,
              },
            ],
          ],
        },
      };
    }
    if (command === '/partner_new') {
      const cityId = args[0];
      if (!cityId || !getCityConfig(cityId))
        return respond('Укажите поддерживаемый cityId: /partner_new balakovo');
      const draft: PartnerDraftState = {
        kind: 'POINT',
        step: 'TITLE',
        payload: { cityId, contacts: [] },
        revision: 0,
      };
      await this.deletePendingImage(tx, state);
      await this.saveDraft(tx, ownerId, draft);
      return this.draftReply(ownerId, draft);
    }
    if (
      command === '/partner_edit' ||
      command === '/partner_image' ||
      command === '/partner_promo' ||
      command === '/partner_contacts'
    ) {
      const id = args[0];
      if (!id || !UUID.test(id)) return respond('Укажите UUID точки.');
      const point = await tx.partnerPoint.findUnique({
        where: { id },
        include: { contacts: { orderBy: { displayOrder: 'asc' } } },
      });
      if (!point || point.status === 'ENDED')
        return respond('Точка не найдена или размещение завершено.');
      const draft: PartnerDraftState = {
        kind: 'POINT',
        step:
          command === '/partner_image'
            ? 'IMAGE'
            : command === '/partner_promo'
              ? 'PROMO_CODE'
              : command === '/partner_contacts'
                ? 'CONTACT_CHOICE'
                : 'TITLE',
        revision: 0,
        payload: {
          cityId: point.cityId,
          editingId: point.id,
          ...(command === '/partner_image'
            ? { quickEdit: 'IMAGE' as const }
            : command === '/partner_promo'
              ? { quickEdit: 'PROMO' as const }
              : command === '/partner_contacts'
                ? { quickEdit: 'CONTACTS' as const }
                : {}),
          title: point.title,
          category: point.category,
          backgroundColor: point.backgroundColor,
          textColor: point.textColor,
          imageAssetKey: point.imageAssetKey,
          originalImageAssetKey: point.imageAssetKey,
          promoCode: point.promoCode,
          promoTerms: point.promoTerms,
          description: point.description,
          latitude: point.latitude ?? undefined,
          longitude: point.longitude ?? undefined,
          displayAddress: point.displayAddress,
          contacts: point.contacts.map((contact) => ({
            id: contact.id,
            type: contact.type,
            label: contact.label,
            value: contact.value,
            displayOrder: contact.displayOrder,
          })),
          startsAt: point.startsAt.toISOString(),
          endsAt: point.endsAt.toISOString(),
        } satisfies PointDraft,
      };
      await this.deletePendingImage(tx, state);
      await this.saveDraft(tx, ownerId, draft);
      return this.draftReply(ownerId, draft);
    }
    if (command === '/partner_list') {
      const cityId = args[0];
      if (!cityId || !getCityConfig(cityId))
        return respond('Укажите поддерживаемый cityId.');
      const points = await tx.partnerPoint.findMany({
        where: { cityId },
        select: { id: true, title: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return respond(
        points.length
          ? points
              .map(
                (point) =>
                  `${point.id} · ${point.title} · ${{ DRAFT: 'черновик', ACTIVE: 'активно', PAUSED: 'на паузе', ENDED: 'завершено' }[point.status]}`,
              )
              .join('\n')
          : 'Точек нет.',
      );
    }
    if (command === '/partner_stats') {
      const id = args[0];
      if (!id || !UUID.test(id))
        return respond('Укажите UUID точки: /partner_stats UUID');
      const point = await tx.partnerPoint.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          contacts: { select: { id: true, label: true, type: true } },
        },
      });
      if (!point) return respond('Точка не найдена.');
      const rows = await tx.partnerStatDaily.groupBy({
        by: ['action', 'detailId', 'day'],
        where: { partnerPointId: id },
        _sum: { count: true },
      });
      const now = new Date();
      const contacts = point.contacts.map((contact) => ({
        id: contact.id,
        label: contact.label,
      }));
      const periods = (['7', '30', 'ALL'] as const).map(
        (period) =>
          `${period === 'ALL' ? 'Всё время' : `${period} дней`}\n${formatPartnerStatReport(rows, contacts, period, now)}`,
      );
      return respond(`Статистика «${point.title}»\n${periods.join('\n\n')}`);
    }
    if (command === '/partner_banner') {
      const cityId = args[0];
      if (!cityId || !getCityConfig(cityId))
        return respond('Укажите поддерживаемый cityId.');
      const old = await tx.partnerCityBanner.findUnique({ where: { cityId } });
      const availablePoints = await tx.partnerPoint.findMany({
        where: { cityId, status: 'ACTIVE', endsAt: { gt: new Date() } },
        orderBy: { title: 'asc' },
        take: 40,
        select: { id: true, title: true },
      });
      const draft: PartnerDraftState = {
        kind: 'BANNER',
        step: 'TITLE',
        revision: 0,
        payload: {
          cityId,
          preserveEnabled: old?.enabled,
          title: old?.title ?? undefined,
          text: old?.text ?? undefined,
          buttonLabel: old?.buttonLabel ?? undefined,
          buttonUrl: old?.buttonUrl ?? undefined,
          partnerPointId: old?.partnerPointId ?? undefined,
          pointChoices: availablePoints,
          startsAt: old?.startsAt?.toISOString(),
          endsAt: old?.endsAt?.toISOString(),
        } satisfies BannerDraft,
      };
      await this.deletePendingImage(tx, state);
      await this.saveDraft(tx, ownerId, draft);
      return this.draftReply(ownerId, draft);
    }
    if (command === '/partner_banner_quick') {
      const [cityId, field] = args;
      if (!cityId || !getCityConfig(cityId))
        return respond('Укажите поддерживаемый cityId.');
      const old = await tx.partnerCityBanner.findUnique({ where: { cityId } });
      if (!old) return respond('Сначала создайте баннер.');
      const steps = {
        text: ['TITLE', 'TEXT'],
        action: ['BUTTON_LABEL', 'BUTTON_URL'],
        period: ['STARTS_AT', 'ENDS_AT'],
      } as const;
      const selected = steps[field as keyof typeof steps];
      if (!selected) return respond('Выберите поле баннера.');
      const draft: PartnerDraftState = {
        kind: 'BANNER',
        step: selected[0],
        revision: 0,
        payload: {
          cityId,
          preserveEnabled: old.enabled,
          quickEditEndStep: selected[1],
          title: old.title ?? undefined,
          text: old.text ?? undefined,
          buttonLabel: old.buttonLabel ?? undefined,
          buttonUrl: old.buttonUrl ?? undefined,
          partnerPointId: old.partnerPointId ?? undefined,
          startsAt: old.startsAt?.toISOString(),
          endsAt: old.endsAt?.toISOString(),
        } satisfies BannerDraft,
      };
      await this.deletePendingImage(tx, state);
      await this.saveDraft(tx, ownerId, draft);
      return this.draftReply(ownerId, draft);
    }
    if (
      [
        '/partner_banner_enable',
        '/partner_banner_off',
        '/partner_banner_end',
      ].includes(command ?? '')
    ) {
      const cityId = args[0];
      if (!cityId || !getCityConfig(cityId))
        return respond('Укажите поддерживаемый cityId.');
      const action =
        command === '/partner_banner_enable'
          ? 'enable'
          : command === '/partner_banner_end'
            ? 'end'
            : 'pause';
      try {
        await this.management.bannerStatus(tx, cityId, action);
      } catch (error) {
        if (error instanceof BadRequestException) return respond(error.message);
        throw error;
      }
      return respond(
        action === 'enable'
          ? 'Баннер включён.'
          : action === 'end'
            ? 'Баннер завершён и выключен. Срок партнёрской точки не изменён.'
            : 'Баннер выключен.',
      );
    }
    if (
      ['/partner_pause', '/partner_resume', '/partner_end'].includes(
        command ?? '',
      )
    ) {
      const id = args[0];
      if (!id || !UUID.test(id)) return respond('Укажите UUID точки.');
      const action =
        command === '/partner_pause'
          ? 'pause'
          : command === '/partner_resume'
            ? 'resume'
            : 'end';
      try {
        await this.management.pointStatus(tx, id, action);
      } catch (error) {
        if (error instanceof BadRequestException) return respond(error.message);
        throw error;
      }
      return respond(
        action === 'pause'
          ? 'Точка на паузе.'
          : action === 'resume'
            ? 'Точка активна.'
            : 'Точка завершена.',
      );
    }
    if (command === '/partner_price' || command === '/partner_paid') {
      const kind = args[0];
      const id = args[1];
      if (!['point', 'banner'].includes(kind ?? '') || !id || !UUID.test(id))
        return respond(
          'Формат: /partner_price point|banner UUID рубли или /partner_paid point|banner UUID',
        );
      let data: { agreedPriceKopecks: bigint } | { paidAt: Date };
      if (command === '/partner_price') {
        const rubles = args[2];
        if (!rubles || !/^\d{1,9}(?:\.\d{1,2})?$/u.test(rubles))
          return respond(
            'Цена: неотрицательная сумма в рублях, до двух знаков после точки.',
          );
        const [whole, fraction = ''] = rubles.split('.');
        data = {
          agreedPriceKopecks:
            BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')),
        };
      } else data = { paidAt: new Date() };
      const financialWhere =
        command === '/partner_paid'
          ? { id, paidAt: null, agreedPriceKopecks: { not: null } }
          : { id };
      const changed =
        kind === 'point'
          ? await tx.partnerPoint.updateMany({ where: financialWhere, data })
          : await tx.partnerCityBanner.updateMany({
              where: financialWhere,
              data,
            });
      return respond(
        changed.count
          ? 'Ручная финансовая отметка сохранена.'
          : 'Размещение не найдено, цена не указана или оплата уже отмечена.',
      );
    }
    return respond(help);
  }

  private async saveDraft(
    tx: Prisma.TransactionClient,
    ownerId: string,
    state: PartnerDraftState,
  ): Promise<void> {
    await tx.partnerBotDraft.upsert({
      where: { ownerTelegramId: ownerId },
      create: {
        ownerTelegramId: ownerId,
        kind: state.kind,
        step: state.step,
        payload: state.payload as unknown as Prisma.InputJsonValue,
        revision: state.revision,
      },
      update: {
        kind: state.kind,
        step: state.step,
        payload: state.payload as unknown as Prisma.InputJsonValue,
        revision: state.revision,
      },
    });
  }

  private async processCallback(
    tx: Prisma.TransactionClient,
    ownerId: string,
    state: PartnerDraftState | null,
    data: string,
  ): Promise<PartnerBotReply> {
    const dateAction =
      /^pp:date:(now|keep|cancel|back|day\d{1,3}|page\d{1,2}|hour\d{1,2}|minute(?:0|15|30|45)):(\d+)$/u.exec(
        data,
      );
    if (dateAction) {
      if (
        !state ||
        !['STARTS_AT', 'ENDS_AT'].includes(state.step) ||
        Number(dateAction[2]) !== state.revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      if (dateAction[1] === 'cancel')
        return this.processCallback(
          tx,
          ownerId,
          state,
          `pp:cancel:${state.revision}`,
        );
      const city = getCityConfig(state.payload.cityId);
      if (!city?.timeZone)
        return {
          chatId: ownerId,
          callbackText: 'Для города не задан часовой пояс',
        };
      const next = structuredClone(state);
      const payload = next.payload;
      const action = dateAction[1];
      let dateValue: string | null = null;
      if (action === 'now' && state.step === 'STARTS_AT')
        dateValue = new Date().toISOString();
      else if (action === 'keep') dateValue = '/keep';
      else if (action.startsWith('page')) {
        const page = Number(action.slice(4));
        if (page > 51)
          return { chatId: ownerId, callbackText: 'Дата недоступна' };
        payload.dateSelection = { page };
      } else if (action.startsWith('day')) {
        const offset = Number(action.slice(3));
        const day = offset < 365 ? localDay(payload.cityId, offset) : null;
        if (!day) return { chatId: ownerId, callbackText: 'Дата недоступна' };
        payload.dateSelection = { day };
      } else if (action.startsWith('hour')) {
        const hour = Number(action.slice(4));
        if (!payload.dateSelection?.day || hour > 23)
          return { chatId: ownerId, callbackText: 'Сначала выберите дату' };
        payload.dateSelection.hour = hour;
      } else if (action.startsWith('minute')) {
        const minute = Number(action.slice(6));
        const selected = payload.dateSelection;
        if (!selected?.day || selected.hour === undefined)
          return { chatId: ownerId, callbackText: 'Сначала выберите время' };
        const [year, month, day] = selected.day.split('-').map(Number);
        dateValue =
          cityLocalToUtc(
            { year, month, day, hour: selected.hour, minute },
            city.timeZone,
          )?.toISOString() ?? null;
        if (!dateValue)
          return {
            chatId: ownerId,
            callbackText: 'Это местное время недоступно. Выберите другое',
          };
      } else if (action === 'back') {
        if (payload.dateSelection?.hour !== undefined)
          delete payload.dateSelection.hour;
        else payload.dateSelection = { page: 0 };
      } else return { chatId: ownerId, callbackText: 'Кнопка недействительна' };
      if (dateValue !== null) {
        const advanced = advancePartnerDraft(
          state,
          { text: dateValue },
          new Date(),
        );
        if (advanced.error)
          return { chatId: ownerId, callbackText: advanced.error };
        await this.saveDraft(tx, ownerId, advanced.state);
        return this.draftReply(ownerId, advanced.state);
      }
      next.revision += 1;
      await this.saveDraft(tx, ownerId, next);
      return this.draftReply(ownerId, next);
    }
    const bannerPoint = /^pp:bp:(\d+):(\d+)$/u.exec(data);
    if (bannerPoint) {
      if (
        !state ||
        state.kind !== 'BANNER' ||
        state.step !== 'POINT_ID' ||
        Number(bannerPoint[2]) !== state.revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const choice = (state.payload as BannerDraft).pointChoices?.[
        Number(bannerPoint[1])
      ];
      if (!choice) return { chatId: ownerId, callbackText: 'Точка недоступна' };
      const advanced = advancePartnerDraft(
        state,
        { text: choice.id },
        new Date(),
      );
      if (advanced.error)
        return { chatId: ownerId, callbackText: advanced.error };
      await this.saveDraft(tx, ownerId, advanced.state);
      return this.draftReply(ownerId, advanced.state);
    }
    const fields = /^pp:fields:(\d+)$/u.exec(data);
    if (fields) {
      if (
        !state ||
        state.kind !== 'POINT' ||
        state.step !== 'PREVIEW' ||
        Number(fields[1]) !== state.revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const choices = [
        ['Название', 'TITLE'],
        ['Категория', 'CATEGORY'],
        ['Описание', 'DESCRIPTION'],
        ['Координаты', 'COORDINATE'],
        ['Адрес', 'ADDRESS'],
        ['Контакты', 'CONTACT_CHOICE'],
        ['Начало', 'STARTS_AT'],
        ['Окончание', 'ENDS_AT'],
        ['Цвета', 'BACKGROUND_COLOR'],
        ['Изображение', 'IMAGE'],
        ['Промокод', 'PROMO_CODE'],
        ['Условия промокода', 'PROMO_TERMS'],
      ] as const;
      return {
        chatId: ownerId,
        text: 'Какое поле изменить? После ввода вернёмся к полному предпросмотру.',
        keyboard: {
          inline_keyboard: [
            ...choices.map(([label, step]) => [
              {
                text: label,
                callback_data: `pp:field:${step}:${state.revision}`,
              },
            ]),
            [
              {
                text: 'Назад к предпросмотру',
                callback_data: `pp:back:${state.revision}`,
              },
            ],
          ],
        },
      };
    }
    const back = /^pp:back:(\d+)$/u.exec(data);
    if (back) {
      if (
        !state ||
        state.step !== 'PREVIEW' ||
        Number(back[1]) !== state.revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      return this.draftReply(ownerId, state);
    }
    const field =
      /^pp:field:(TITLE|CATEGORY|DESCRIPTION|COORDINATE|ADDRESS|CONTACT_CHOICE|STARTS_AT|ENDS_AT|BACKGROUND_COLOR|IMAGE|PROMO_CODE|PROMO_TERMS):(\d+)$/u.exec(
        data,
      );
    if (field) {
      if (
        !state ||
        state.kind !== 'POINT' ||
        state.step !== 'PREVIEW' ||
        Number(field[2]) !== state.revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const step = field[1];
      const quickEdit =
        step === 'CONTACT_CHOICE'
          ? 'CONTACTS'
          : step === 'IMAGE'
            ? 'IMAGE'
            : step === 'PROMO_CODE'
              ? 'PROMO'
              : 'FIELD';
      const next: PartnerDraftState = {
        ...state,
        step,
        revision: state.revision + 1,
        payload: {
          ...(state.payload as PointDraft),
          quickEdit,
          ...(quickEdit === 'FIELD'
            ? {
                quickEditStep:
                  step === 'BACKGROUND_COLOR' ? 'TEXT_COLOR' : step,
              }
            : {}),
        },
      };
      await this.saveDraft(tx, ownerId, next);
      return this.draftReply(ownerId, next);
    }
    const contactType =
      /^pp:ct:(PHONE|EMAIL|WEBSITE|TELEGRAM|OTHER):(\d+)$/u.exec(data);
    if (contactType) {
      if (
        !state ||
        state.kind !== 'POINT' ||
        state.step !== 'CONTACT_TYPE' ||
        Number(contactType[2]) !== state.revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const advanced = advancePartnerDraft(
        state,
        { text: contactType[1] },
        new Date(),
      );
      if (advanced.error)
        return { chatId: ownerId, callbackText: advanced.error };
      await this.saveDraft(tx, ownerId, advanced.state);
      return this.draftReply(ownerId, advanced.state);
    }
    const coordinate = /^pp:coord:(location|text):(\d+)$/u.exec(data);
    if (coordinate) {
      if (
        !state ||
        state.step !== 'COORDINATE' ||
        Number(coordinate[2]) !== state.revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      return {
        chatId: ownerId,
        text:
          coordinate[1] === 'location'
            ? 'Пришлите геопозицию вложением Telegram. Точка не будет опубликована до подтверждения.'
            : 'Введите координаты в формате «широта, долгота».',
      };
    }
    const contactAction =
      /^pp:contact:(edit|ask|drop|keep|up|down):(\d+):(\d+)$/u.exec(data);
    if (contactAction) {
      if (
        !state ||
        state.kind !== 'POINT' ||
        state.step !== 'CONTACT_CHOICE' ||
        Number(contactAction[3]) !== state.revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const index = Number(contactAction[2]);
      const point = state.payload as PointDraft;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= point.contacts.length
      )
        return { chatId: ownerId, callbackText: 'Контакт изменился' };
      if (contactAction[1] === 'ask')
        return {
          chatId: ownerId,
          text: `Удалить контакт «${point.contacts[index].label}»?`,
          keyboard: {
            inline_keyboard: [
              [
                {
                  text: 'Да, удалить',
                  callback_data: `pp:contact:drop:${index}:${state.revision}`,
                },
              ],
              [
                {
                  text: 'Нет',
                  callback_data: `pp:contact:keep:${index}:${state.revision}`,
                },
              ],
            ],
          },
        };
      if (contactAction[1] === 'keep') return this.draftReply(ownerId, state);
      const next = structuredClone(state);
      const nextPoint = next.payload as PointDraft;
      if (contactAction[1] === 'edit') {
        nextPoint.pendingContact = { editingIndex: index };
        next.step = 'CONTACT_TYPE';
      } else if (contactAction[1] === 'drop') {
        nextPoint.contacts.splice(index, 1);
      } else {
        const other = contactAction[1] === 'up' ? index - 1 : index + 1;
        if (other < 0 || other >= nextPoint.contacts.length)
          return { chatId: ownerId, callbackText: 'Край списка' };
        [nextPoint.contacts[index], nextPoint.contacts[other]] = [
          nextPoint.contacts[other],
          nextPoint.contacts[index],
        ];
      }
      nextPoint.contacts.forEach((contact, order) => {
        contact.displayOrder = order;
      });
      next.revision += 1;
      await this.saveDraft(tx, ownerId, next);
      return this.draftReply(ownerId, next);
    }
    const pushAction = /^pp:push:([0-9a-f-]{36}):(confirm|cancel)$/iu.exec(
      data,
    );
    if (pushAction) {
      if (process.env.PUSH_ENQUEUE_ENABLED !== 'true')
        return {
          chatId: ownerId,
          callbackText: 'Рассылка отключена на сервере',
        };
      const campaignId = pushAction[1];
      if (!UUID.test(campaignId))
        return { chatId: ownerId, callbackText: 'Кнопка недействительна' };
      const campaign = await tx.partnerPushCampaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign || campaign.status !== 'AWAITING_CONFIRMATION')
        return { chatId: ownerId, callbackText: 'Уже обработано' };
      if (pushAction[2] === 'cancel') {
        await tx.partnerPushCampaign.update({
          where: { id: campaignId },
          data: { status: 'CANCELLED' },
        });
        return { chatId: ownerId, callbackText: 'Рассылка отменена' };
      }
      const now = new Date();
      const point = await tx.partnerPoint.findUnique({
        where: { id: campaign.partnerPointId },
      });
      if (
        !point ||
        point.status !== 'ACTIVE' ||
        point.startsAt > now ||
        point.endsAt <= now ||
        point.latitude === null ||
        point.longitude === null
      )
        return { chatId: ownerId, callbackText: 'Точка уже недоступна' };
      const recent = await tx.partnerPushCampaign.findFirst({
        where: {
          partnerPointId: point.id,
          status: 'QUEUED',
          approvedAt: {
            gt: new Date(now.getTime() - PARTNER_PUSH_MIN_INTERVAL_MS),
          },
        },
        select: { id: true },
      });
      if (recent)
        return { chatId: ownerId, callbackText: 'Лимит: один push за 24 часа' };
      await tx.partnerPushCampaign.update({
        where: { id: campaignId },
        data: { status: 'QUEUED', approvedAt: now },
      });
      await queuePartnerPush(tx, {
        id: campaignId,
        partnerPointId: point.id,
        cityId: point.cityId,
      });
      return {
        chatId: ownerId,
        text: 'Рассылка подтверждена и поставлена в очередь. Доставка зависит от настройки APNs/FCM.',
        callbackText: 'Поставлено в очередь',
      };
    }
    const color = /^pp:color:([0-9A-Fa-f]{6}):(\d+)$/u.exec(data);
    if (color) {
      if (
        !state ||
        state.kind !== 'POINT' ||
        !['BACKGROUND_COLOR', 'TEXT_COLOR'].includes(state.step) ||
        Number(color[2]) !== state.revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const advanced = advancePartnerDraft(
        state,
        { text: `#${color[1]}` },
        new Date(),
      );
      if (advanced.error)
        return {
          chatId: ownerId,
          text: advanced.error,
          callbackText: advanced.error,
        };
      await tx.partnerBotDraft.update({
        where: { ownerTelegramId: ownerId },
        data: {
          step: advanced.state.step,
          payload: advanced.state.payload as unknown as Prisma.InputJsonValue,
          revision: advanced.state.revision,
        },
      });
      return this.draftReply(ownerId, advanced.state);
    }
    const match = /^pp:(add|done|confirm|save|cancel):(\d+)$/u.exec(data);
    if (!match || !state || Number(match[2]) !== state.revision)
      return {
        chatId: ownerId,
        callbackText: 'Кнопка устарела или мастер завершён',
      };
    const action = match[1];
    if (action === 'save' && state.kind === 'POINT' && state.step === 'PREVIEW')
      return {
        chatId: ownerId,
        text: 'Черновик сохранён в базе на 24 часа. Точка не опубликована. Для продолжения откройте «Партнёрские точки» → «Продолжить черновик».',
        callbackText: 'Черновик сохранён',
      };
    if (action === 'cancel') {
      await this.deletePendingImage(tx, state);
      await tx.partnerBotDraft.delete({ where: { ownerTelegramId: ownerId } });
      return {
        chatId: ownerId,
        text: 'Мастер отменён. Размещение не изменено.',
        callbackText: 'Отменено',
      };
    }
    if (action === 'add' || action === 'done') {
      if (state.kind !== 'POINT' || state.step !== 'CONTACT_CHOICE')
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const advanced = advancePartnerDraft(
        state,
        { action: action === 'add' ? 'ADD_CONTACT' : 'DONE_CONTACTS' },
        new Date(),
      );
      if (
        action === 'done' &&
        (advanced.state.payload as PointDraft).quickEdit === 'CONTACTS'
      ) {
        advanced.state.step = 'PREVIEW';
      }
      await tx.partnerBotDraft.update({
        where: { ownerTelegramId: ownerId },
        data: {
          step: advanced.state.step,
          payload: advanced.state.payload as unknown as Prisma.InputJsonValue,
          revision: advanced.state.revision,
        },
      });
      return this.draftReply(ownerId, advanced.state);
    }
    if (state.step !== 'PREVIEW')
      return { chatId: ownerId, callbackText: 'Сначала завершите мастер' };
    if (state.kind === 'POINT') {
      const point = state.payload as PointDraft;
      if (
        !point.title ||
        !point.category ||
        point.latitude === undefined ||
        point.longitude === undefined ||
        !point.startsAt ||
        !point.endsAt
      )
        return { chatId: ownerId, callbackText: 'Черновик неполный' };
      if (
        new Date(point.startsAt) >= new Date(point.endsAt) ||
        new Date(point.endsAt) <= new Date()
      )
        return { chatId: ownerId, callbackText: 'Проверьте срок размещения' };
      if (
        point.imageAssetKey &&
        point.imageAssetKey !== point.originalImageAssetKey &&
        !(await tx.partnerImageAsset.findUnique({
          where: { key: point.imageAssetKey },
          select: { key: true },
        }))
      )
        return {
          chatId: ownerId,
          callbackText:
            'Изображение недоступно. Начните редактирование заново.',
        };
      try {
        await this.management.savePoint(tx, point);
      } catch (error) {
        if (error instanceof BadRequestException)
          return { chatId: ownerId, callbackText: error.message };
        throw error;
      }
      await tx.partnerBotDraft.delete({ where: { ownerTelegramId: ownerId } });
      return {
        chatId: ownerId,
        text: 'Точка подтверждена и сохранена. Видимость зависит от срока размещения.',
        callbackText: 'Точка сохранена',
      };
    }
    const banner = state.payload as BannerDraft;
    if (
      !banner.title ||
      !banner.text ||
      !banner.buttonLabel ||
      !banner.buttonUrl ||
      !banner.partnerPointId ||
      !banner.startsAt ||
      !banner.endsAt
    )
      return { chatId: ownerId, callbackText: 'Черновик неполный' };
    try {
      await this.management.saveBanner(
        tx,
        banner,
        banner.preserveEnabled ?? true,
      );
    } catch (error) {
      if (error instanceof BadRequestException)
        return { chatId: ownerId, callbackText: error.message };
      throw error;
    }
    await tx.partnerBotDraft.delete({ where: { ownerTelegramId: ownerId } });
    return {
      chatId: ownerId,
      text:
        banner.preserveEnabled === false
          ? 'Изменения баннера сохранены. Он остаётся выключенным; включите его отдельной кнопкой.'
          : 'Баннер сохранён. Срок и статус точки не изменены.',
      callbackText: 'Баннер сохранён',
    };
  }
}
