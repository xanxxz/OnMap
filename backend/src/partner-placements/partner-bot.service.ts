import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { getCityConfig } from '../cities/city.registry';
import { PrismaService } from '../database/prisma.service';
import {
  advancePartnerDraft,
  BannerDraft,
  ContactDraft,
  partnerDraftPrompt,
  PartnerDraftState,
  PointDraft,
} from './partner-bot.flow';
import { safePartnerAppearance } from './partner-placement-colors';
import { normalizePartnerImage, PartnerImageError } from './partner-image';
import { queuePartnerPush } from '../push/push-queue';
import { PARTNER_PUSH_MIN_INTERVAL_MS } from '../push/push-policy';

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
        [{ text: 'Добавить контакт', callback_data: `pp:add:${revision}` }],
        [{ text: 'Готово', callback_data: `pp:done:${revision}` }],
        [{ text: 'Отмена', callback_data: `pp:cancel:${revision}` }],
      ],
    };
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
      !/^\/(?:skip|keep|done|add_contact|clear_contacts|clear_promo)(?:\s|$)/iu.test(
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
                step: 'PROMO_CODE',
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
    return {
      chatId: ownerId,
      text: partnerDraftPrompt(state),
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
    if (command === '/partner_edit') {
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
        step: 'TITLE',
        revision: 0,
        payload: {
          cityId: point.cityId,
          editingId: point.id,
          title: point.title,
          category: point.category,
          backgroundColor: point.backgroundColor,
          textColor: point.textColor,
          imageAssetKey: point.imageAssetKey,
          originalImageAssetKey: point.imageAssetKey,
          promoCode: point.promoCode,
          description: point.description,
          latitude: point.latitude ?? undefined,
          longitude: point.longitude ?? undefined,
          displayAddress: point.displayAddress,
          contacts: point.contacts.map((contact) => ({
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
              .map((point) => `${point.id} · ${point.title} · ${point.status}`)
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
      const contactLabels = new Map(
        point.contacts.map((contact) => [
          contact.id,
          `${contact.label} (${contact.type})`,
        ]),
      );
      const today = new Date();
      const start = (days: number) =>
        new Date(
          Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate() - days + 1,
          ),
        );
      const periods = await Promise.all(
        [
          { label: '7 дней', since: start(7) },
          { label: '30 дней', since: start(30) },
          { label: 'Всё время', since: null },
        ].map(async (period) => {
          const rows = await tx.partnerStatDaily.groupBy({
            by: ['action', 'detailId'],
            where: {
              partnerPointId: id,
              ...(period.since ? { day: { gte: period.since } } : {}),
            },
            _sum: { count: true },
          });
          const count = (action: string) =>
            rows
              .filter((row) => row.action === action)
              .reduce((sum, row) => sum + (row._sum.count ?? 0), 0);
          const contacts = rows
            .filter((row) => row.action === 'CONTACT_CLICK')
            .sort((a, b) => (b._sum.count ?? 0) - (a._sum.count ?? 0))
            .slice(0, 8)
            .map(
              (row) =>
                `${contactLabels.get(row.detailId) ?? `удалённый контакт ${row.detailId.slice(0, 8)}`}: ${row._sum.count ?? 0}`,
            );
          return `${period.label}: карточка ${count('POINT_OPEN')}, контакты ${count('CONTACT_CLICK')}, баннер ${count('BANNER_IMPRESSION')} показов / ${count('BANNER_CLICK')} нажатий${contacts.length ? `\nКонтакты: ${contacts.join(', ')}` : ''}`;
        }),
      );
      return respond(`Статистика «${point.title}»\n${periods.join('\n')}`);
    }
    if (command === '/partner_banner') {
      const cityId = args[0];
      if (!cityId || !getCityConfig(cityId))
        return respond('Укажите поддерживаемый cityId.');
      const old = await tx.partnerCityBanner.findUnique({ where: { cityId } });
      const draft: PartnerDraftState = {
        kind: 'BANNER',
        step: 'TITLE',
        revision: 0,
        payload: {
          cityId,
          title: old?.title ?? undefined,
          text: old?.text ?? undefined,
          buttonLabel: old?.buttonLabel ?? undefined,
          buttonUrl: old?.buttonUrl ?? undefined,
          partnerPointId: old?.partnerPointId ?? undefined,
          startsAt: old?.startsAt?.toISOString(),
          endsAt: old?.endsAt?.toISOString(),
        } satisfies BannerDraft,
      };
      await this.deletePendingImage(tx, state);
      await this.saveDraft(tx, ownerId, draft);
      return this.draftReply(ownerId, draft);
    }
    if (command === '/partner_banner_off') {
      const cityId = args[0];
      if (!cityId || !getCityConfig(cityId))
        return respond('Укажите поддерживаемый cityId.');
      const changed = await tx.partnerCityBanner.updateMany({
        where: { cityId, enabled: true },
        data: { enabled: false },
      });
      return respond(
        changed.count
          ? 'Баннер выключен.'
          : 'Баннер уже выключен или не найден.',
      );
    }
    if (
      ['/partner_pause', '/partner_resume', '/partner_end'].includes(
        command ?? '',
      )
    ) {
      const id = args[0];
      if (!id || !UUID.test(id)) return respond('Укажите UUID точки.');
      const now = new Date();
      const where =
        command === '/partner_pause'
          ? { id, status: 'ACTIVE' as const }
          : command === '/partner_resume'
            ? { id, status: 'PAUSED' as const, endsAt: { gt: now } }
            : {
                id,
                status: {
                  in: ['ACTIVE', 'PAUSED'] as Array<'ACTIVE' | 'PAUSED'>,
                },
              };
      const status =
        command === '/partner_pause'
          ? ('PAUSED' as const)
          : command === '/partner_resume'
            ? ('ACTIVE' as const)
            : ('ENDED' as const);
      const changed = await tx.partnerPoint.updateMany({
        where,
        data: { status },
      });
      return respond(
        changed.count
          ? `Статус точки: ${status}.`
          : 'Статус не изменён: точка не найдена или переход невозможен.',
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
    const match = /^pp:(add|done|confirm|cancel):(\d+)$/u.exec(data);
    if (!match || !state || Number(match[2]) !== state.revision)
      return {
        chatId: ownerId,
        callbackText: 'Кнопка устарела или мастер завершён',
      };
    const action = match[1];
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
      const contacts = point.contacts.map((contact: ContactDraft) => ({
        type: contact.type,
        label: contact.label,
        value: contact.value,
        displayOrder: contact.displayOrder,
      }));
      const data = {
        title: point.title,
        category: point.category,
        ...safePartnerAppearance(point.backgroundColor, point.textColor),
        description: point.description ?? null,
        latitude: point.latitude,
        longitude: point.longitude,
        displayAddress: point.displayAddress ?? null,
        imageAssetKey: point.imageAssetKey ?? null,
        promoCode: point.promoCode ?? null,
        startsAt: new Date(point.startsAt),
        endsAt: new Date(point.endsAt),
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
          return {
            chatId: ownerId,
            callbackText: 'Точка недоступна для изменения',
          };
        await tx.partnerPoint.update({
          where: { id: point.editingId },
          data: { ...data, contacts: { deleteMany: {}, create: contacts } },
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
      } else {
        await tx.partnerPoint.create({
          data: {
            cityId: point.cityId,
            ...data,
            status: 'ACTIVE',
            contacts: { create: contacts },
          },
        });
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
    const linked = await tx.partnerPoint.findUnique({
      where: { id: banner.partnerPointId },
    });
    if (
      !linked ||
      linked.cityId !== banner.cityId ||
      linked.status !== 'ACTIVE'
    )
      return {
        chatId: ownerId,
        callbackText: 'Нужна активная точка того же города',
      };
    await tx.partnerCityBanner.upsert({
      where: { cityId: banner.cityId },
      create: {
        cityId: banner.cityId,
        title: banner.title,
        text: banner.text,
        buttonLabel: banner.buttonLabel,
        buttonUrl: banner.buttonUrl,
        partnerPointId: banner.partnerPointId,
        startsAt: new Date(banner.startsAt),
        endsAt: new Date(banner.endsAt),
        enabled: true,
      },
      update: {
        title: banner.title,
        text: banner.text,
        buttonLabel: banner.buttonLabel,
        buttonUrl: banner.buttonUrl,
        partnerPointId: banner.partnerPointId,
        startsAt: new Date(banner.startsAt),
        endsAt: new Date(banner.endsAt),
        enabled: true,
      },
    });
    await tx.partnerBotDraft.delete({ where: { ownerTelegramId: ownerId } });
    return {
      chatId: ownerId,
      text: 'Баннер отдельно подтверждён и включён. Срок и статус точки не изменены.',
      callbackText: 'Баннер включён',
    };
  }
}
