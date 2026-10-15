import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getAvailableCityIds, getCityConfig } from '../cities/city.registry';
import {
  parsePartnerOwnerIds,
  partnerUpdateOwner,
  type PartnerBotReply,
} from '../partner-placements/partner-bot.service';
import {
  formatSaratovTime,
  nextRecurringRun,
  parseCampaignSchedule,
  projectCampaignScheduleToZone,
  type CampaignSchedule,
} from './push-campaign-time';
import { cityLocalParts, formatCityTime } from '../cities/city-local-time';

type DraftStep = 'CITIES' | 'TITLE' | 'BODY' | 'SCHEDULE' | 'PREVIEW';
type Draft = {
  nonce: string;
  kind: 'GENERAL' | 'PARTNER_POINT';
  editingId?: string;
  baseRevision?: number;
  partnerPointId?: string;
  cityIds?: string[];
  title?: string;
  body?: string;
  scheduleMode?: 'ONCE' | 'DAILY' | 'WEEKLY';
  scheduleWeekday?: number;
  scheduleSelection?: {
    stage: 'FIRST' | 'END';
    page?: number;
    day?: string;
    hour?: number;
    firstLocal?: string;
    preserveEnd?: boolean;
  };
  schedule?: {
    kind: CampaignSchedule['kind'];
    localTime: string | null;
    weekday: number | null;
    firstRunAt: string;
    endsAt: string | null;
  };
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

const campaignLocalDay = (
  draft: Draft,
  offset: number,
  now = new Date(),
): string | null => {
  const zone = draft.cityIds?.[0]
    ? getCityConfig(draft.cityIds[0])?.timeZone
    : null;
  if (!zone) return null;
  const p = cityLocalParts(now, zone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + offset))
    .toISOString()
    .slice(0, 10);
};

const scheduleDateKeyboard = (
  draft: Draft,
  revision: number,
): PartnerBotReply['keyboard'] => {
  const selected = draft.scheduleSelection;
  const button = (text: string, action: string) => ({
    text,
    callback_data: `pc:date:${action}:${revision}`,
  });
  if (selected?.day && selected.hour !== undefined)
    return {
      inline_keyboard: [
        [0, 15, 30, 45].map((minute) =>
          button(`:${String(minute).padStart(2, '0')}`, `minute${minute}`),
        ),
        [button('← Часы', 'back')],
        [button('Отмена', 'cancel')],
      ],
    };
  if (selected?.day && selected.stage === 'FIRST')
    return {
      inline_keyboard: [
        ...Array.from({ length: 4 }, (_rowValue, rowIndex) =>
          Array.from({ length: 4 }, (_columnValue, columnIndex) => {
            const hour = 8 + rowIndex * 4 + columnIndex;
            return hour < 22
              ? button(`${String(hour).padStart(2, '0')}:00`, `hour${hour}`)
              : button('·', 'back');
          }),
        ),
        [button('← Дата', 'back')],
        [button('Отмена', 'cancel')],
      ],
    };
  if (selected?.page !== undefined)
    return {
      inline_keyboard: [
        ...Array.from({ length: 7 }, (_, index) => {
          const offset = selected.page! * 7 + index;
          return [
            button(
              campaignLocalDay(draft, offset) ?? `День ${offset}`,
              `day${offset}`,
            ),
          ];
        }),
        [
          ...(selected.page > 0
            ? [button('← Раньше', `page${selected.page - 1}`)]
            : []),
          ...(selected.page < 12
            ? [button('Позже →', `page${selected.page + 1}`)]
            : []),
        ],
        [button('Отмена', 'cancel')],
      ],
    };
  return {
    inline_keyboard: [
      [button('Сегодня', 'day0'), button('Завтра', 'day1')],
      [button('Выбрать дату', 'page0')],
      [button('Отмена', 'cancel')],
    ],
  };
};

const scheduleFromRow = (row: {
  scheduleKind: CampaignSchedule['kind'];
  localTime: string | null;
  weekday: number | null;
  nextRunAt: Date | null;
  endsAt: Date | null;
}): Draft['schedule'] | undefined =>
  row.nextRunAt
    ? {
        kind: row.scheduleKind,
        localTime: row.localTime,
        weekday: row.weekday,
        firstRunAt: row.nextRunAt.toISOString(),
        endsAt: row.endsAt?.toISOString() ?? null,
      }
    : undefined;

const prompt = (step: DraftStep, draft: Draft): string => {
  const keep = draft.editingId
    ? ' Ответьте /keep, чтобы сохранить прежнее значение.'
    : '';
  switch (step) {
    case 'CITIES':
      return `Выберите один или несколько городов кнопками и нажмите «Готово». Сейчас: ${draft.cityIds?.join(', ') || 'не выбраны'}. Все города также доступны одной кнопкой.${keep}`;
    case 'TITLE':
      return `Заголовок push (1–100 символов).${keep}${draft.kind === 'PARTNER_POINT' ? ' Пример: Предложение партнёра OnMap.' : ' Пример: Новости OnMap.'}`;
    case 'BODY':
      return `Текст push (1–240 символов).${keep}`;
    case 'SCHEDULE':
      if (
        draft.scheduleMode === 'WEEKLY' &&
        draft.scheduleWeekday === undefined
      )
        return 'Еженедельно. Сначала выберите день недели кнопкой.';
      if (draft.scheduleMode)
        return `Выберите ${draft.scheduleSelection?.stage === 'END' ? 'дату окончания' : 'дату и время первого запуска'} кнопками. Местное время города: ${draft.cityIds?.[0] ? (getCityConfig(draft.cityIds[0])?.timeZone ?? 'не задано') : 'город не выбран'}.${draft.scheduleSelection?.day ? ` Выбрано: ${draft.scheduleSelection.day}.` : ''}`;
      return (
        'Выберите режим отправки. Местный часовой пояс выбранного города указан на следующем шаге. Время 08:00–21:59; повтор не дольше 90 дней.' +
        keep
      );
    case 'PREVIEW':
      return 'Проверьте предпросмотр и нажмите кнопку подтверждения.';
  }
};

const draftKeyboard = (
  step: DraftStep,
  draft: Draft,
  revision: number,
): PartnerBotReply['keyboard'] => {
  if (step === 'CITIES')
    return {
      inline_keyboard: [
        ...getAvailableCityIds().map((cityId) => [
          {
            text: `${draft.cityIds?.includes(cityId) ? '✓ ' : ''}${cityId}`,
            callback_data: `pc:city:${cityId}:${revision}`,
          },
        ]),
        [{ text: 'Все города', callback_data: `pc:city:all:${revision}` }],
        [{ text: 'Готово', callback_data: `pc:city:done:${revision}` }],
      ],
    };
  if (step === 'SCHEDULE') {
    if (draft.scheduleMode === 'WEEKLY' && draft.scheduleWeekday === undefined)
      return {
        inline_keyboard: [
          ...(['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const).map(
            (label, index) => [
              {
                text: label,
                callback_data: `pc:weekday:${index + 1}:${revision}`,
              },
            ],
          ),
        ],
      };
    if (!draft.scheduleMode)
      return {
        inline_keyboard: [
          [{ text: 'Сейчас', callback_data: `pc:mode:now:${revision}` }],
          [
            {
              text: 'Один раз позже',
              callback_data: `pc:mode:once:${revision}`,
            },
          ],
          [{ text: 'Каждый день', callback_data: `pc:mode:daily:${revision}` }],
          [
            {
              text: 'Каждую неделю',
              callback_data: `pc:mode:weekly:${revision}`,
            },
          ],
        ],
      };
    return scheduleDateKeyboard(draft, revision);
  }
  return undefined;
};

const startDraft = (kind: Draft['kind'], partnerPointId?: string): Draft => ({
  nonce: randomUUID(),
  kind,
  ...(partnerPointId ? { partnerPointId } : {}),
});

@Injectable()
export class PushCampaignBotService {
  private readonly ownerIds: ReadonlySet<string>;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.ownerIds = parsePartnerOwnerIds(
      config.get<string>('TELEGRAM_PARTNER_OWNER_IDS'),
    );
  }

  private stepReply(
    ownerId: string,
    step: DraftStep,
    draft: Draft,
    revision: number,
  ): PartnerBotReply {
    return {
      chatId: ownerId,
      text: prompt(step, draft),
      ...(draftKeyboard(step, draft, revision)
        ? { keyboard: draftKeyboard(step, draft, revision) }
        : {}),
    };
  }

  async shouldHandle(update: unknown): Promise<boolean> {
    const ownerId = partnerUpdateOwner(update, this.ownerIds);
    if (!ownerId) return false;
    const item = asRecord(update);
    const callback = asRecord(item?.callback_query);
    if (callback)
      return (
        typeof callback.data === 'string' && callback.data.startsWith('pc:')
      );
    const message = asRecord(item?.message);
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (/^\/(?:push(?:_|\s|$)|partner_push(?:\s|$))/iu.test(text)) return true;
    if (text.startsWith('/') && text !== '/keep') return false;
    const draft = await this.prisma.pushBotDraft.findUnique({
      where: { ownerTelegramId: ownerId },
      select: { ownerTelegramId: true },
    });
    return draft !== null;
  }

  async process(update: unknown): Promise<PartnerBotReply> {
    const ownerId = partnerUpdateOwner(update, this.ownerIds);
    if (!ownerId) throw new Error('PUSH_BOT_UNAUTHORIZED');
    const item = asRecord(update);
    const updateId = item?.update_id;
    if (typeof updateId !== 'number' || !Number.isSafeInteger(updateId))
      throw new Error('PUSH_BOT_INVALID_UPDATE');
    const callback = asRecord(item?.callback_query);
    const message = asRecord(item?.message);
    const text = typeof message?.text === 'string' ? message.text.trim() : '';

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<readonly { locked: boolean }[]>`
        SELECT pg_advisory_xact_lock(724513, 2) IS NULL AS locked
      `;
        if (
          await tx.telegramModerationUpdate.findUnique({
            where: { updateId: BigInt(updateId) },
          })
        )
          return {
            chatId: ownerId,
            duplicate: true,
            callbackText: 'Уже обработано',
          };
        const row = await tx.pushBotDraft.findUnique({
          where: { ownerTelegramId: ownerId },
        });
        if (
          row?.updatedAt &&
          row.updatedAt.getTime() < Date.now() - 24 * 60 * 60_000
        ) {
          await tx.pushBotDraft.delete({ where: { ownerTelegramId: ownerId } });
          await tx.telegramModerationUpdate.create({
            data: { updateId: BigInt(updateId) },
          });
          return {
            chatId: ownerId,
            text: 'Незавершённый мастер истёк через 24 часа. Откройте меню и начните заново.',
          };
        }
        const draft = row?.payload as Draft | undefined;
        const reply = callback
          ? await this.processCallback(
              tx,
              ownerId,
              row?.step as DraftStep | undefined,
              draft,
              row?.revision ?? 0,
              typeof callback.data === 'string' ? callback.data : '',
            )
          : text.startsWith('/') && text !== '/keep'
            ? await this.processCommand(
                tx,
                ownerId,
                row?.step as DraftStep | undefined,
                draft,
                text,
              )
            : await this.processDraftText(
                tx,
                ownerId,
                row?.step as DraftStep | undefined,
                draft,
                text,
              );
        await tx.telegramModerationUpdate.create({
          data: { updateId: BigInt(updateId) },
        });
        return reply;
      },
      { timeout: 20_000 },
    );
  }

  private async saveDraft(
    tx: Prisma.TransactionClient,
    ownerId: string,
    step: DraftStep,
    draft: Draft,
    revision: number,
  ): Promise<void> {
    await tx.pushBotDraft.upsert({
      where: { ownerTelegramId: ownerId },
      create: {
        ownerTelegramId: ownerId,
        step,
        revision,
        payload: draft,
      },
      update: {
        step,
        revision,
        payload: draft,
      },
    });
  }

  private async preview(
    tx: Prisma.TransactionClient,
    ownerId: string,
    draft: Draft,
    revision: number,
  ): Promise<PartnerBotReply> {
    const cities = draft.cityIds ?? [];
    const count = await tx.pushDevice.count({
      where: { cityId: { in: cities }, enabled: true, newsPushEnabled: true },
    });
    const schedule = draft.schedule;
    if (!schedule || !draft.title || !draft.body || cities.length === 0)
      return {
        chatId: ownerId,
        text: 'Черновик неполный. Начните заново через /push_new или /partner_push.',
      };
    const repeat =
      schedule.kind === 'DAILY'
        ? 'ежедневно'
        : schedule.kind === 'WEEKLY'
          ? 'еженедельно'
          : 'один раз';
    const referenceZone = getCityConfig(cities[0])?.timeZone;
    if (!referenceZone)
      return { chatId: ownerId, text: 'Для города не задан часовой пояс.' };
    const typedSchedule: CampaignSchedule = {
      kind: schedule.kind,
      localTime: schedule.localTime,
      weekday: schedule.weekday,
      firstRunAt: new Date(schedule.firstRunAt),
      endsAt: schedule.endsAt ? new Date(schedule.endsAt) : null,
    };
    const localRuns = cities.map((cityId) => {
      const zone = getCityConfig(cityId)?.timeZone;
      const projected = zone
        ? projectCampaignScheduleToZone(
            typedSchedule,
            referenceZone,
            zone,
            new Date(),
          )
        : null;
      return zone && projected
        ? `${cityId}: ${formatCityTime(projected.nextRunAt, zone)}`
        : `${cityId}: время недоступно`;
    });
    return {
      chatId: ownerId,
      text: [
        'Предпросмотр push',
        `Заголовок: ${draft.title}`,
        `Текст: ${draft.body}`,
        `Привязка: ${draft.kind === 'GENERAL' ? 'без точки; открывает карту' : `партнёрская точка ${draft.partnerPointId}; открывает её карточку`}`,
        `Города: ${cities.join(', ')}`,
        `Примерно подходящих устройств сейчас: ${count}. Фактическая аудитория выбирается при запуске.`,
        `Первый запуск по местному времени: ${localRuns.join('; ')}`,
        `Повторение: ${repeat}`,
        `Окончание: ${schedule.endsAt ? formatCityTime(new Date(schedule.endsAt), referenceZone) : 'после одной отправки'}`,
      ].join('\n'),
      keyboard: {
        inline_keyboard: [
          [
            {
              text: 'Города',
              callback_data: `pc:${draft.nonce}:${revision}:edit-cities`,
            },
            {
              text: 'Заголовок',
              callback_data: `pc:${draft.nonce}:${revision}:edit-title`,
            },
          ],
          [
            {
              text: 'Текст',
              callback_data: `pc:${draft.nonce}:${revision}:edit-body`,
            },
            {
              text: 'Время',
              callback_data: `pc:${draft.nonce}:${revision}:edit-schedule`,
            },
          ],
          [
            {
              text: 'Изменить начало',
              callback_data: `pc:${draft.nonce}:${revision}:edit-start`,
            },
            ...(schedule.kind === 'DAILY' || schedule.kind === 'WEEKLY'
              ? [
                  {
                    text: 'Изменить окончание',
                    callback_data: `pc:${draft.nonce}:${revision}:edit-end`,
                  },
                ]
              : []),
          ],
          [
            {
              text: 'Подтвердить запуск',
              callback_data: `pc:${draft.nonce}:${revision}:confirm`,
            },
          ],
          [
            {
              text: 'Отмена',
              callback_data: `pc:${draft.nonce}:${revision}:cancel`,
            },
          ],
        ],
      },
    };
  }

  private async processCommand(
    tx: Prisma.TransactionClient,
    ownerId: string,
    step: DraftStep | undefined,
    draft: Draft | undefined,
    text: string,
  ): Promise<PartnerBotReply> {
    const [rawCommand, arg] = text.split(/\s+/u);
    const command = rawCommand.split('@', 1)[0].toLowerCase();
    const respond = (body: string): PartnerBotReply => ({
      chatId: ownerId,
      text: body,
    });
    if (command === '/push' || command === '/push_help')
      return respond(
        'Команды: /push_new, /partner_push <UUID>, /push_list, /push_show <UUID>, /push_edit <UUID>, /push_pause <UUID>, /push_resume <UUID>, /push_cancel <UUID>, /push_status, /push_abort.',
      );
    if (command === '/push_status')
      return draft && step
        ? step === 'PREVIEW'
          ? this.preview(
              tx,
              ownerId,
              draft,
              (
                await tx.pushBotDraft.findUnique({
                  where: { ownerTelegramId: ownerId },
                })
              )?.revision ?? 0,
            )
          : this.stepReply(
              ownerId,
              step,
              draft,
              (
                await tx.pushBotDraft.findUnique({
                  where: { ownerTelegramId: ownerId },
                })
              )?.revision ?? 0,
            )
        : respond('Незавершённой рассылки нет.');
    if (command === '/push_abort') {
      if (draft)
        await tx.pushBotDraft.delete({ where: { ownerTelegramId: ownerId } });
      return respond('Черновик рассылки отменён.');
    }
    if (
      command === '/push_new' ||
      command === '/partner_push' ||
      command === '/push_edit'
    ) {
      if (draft)
        return respond(
          'Сначала завершите текущий мастер или выполните /push_abort.',
        );
      if (
        await tx.partnerBotDraft.findUnique({
          where: { ownerTelegramId: ownerId },
          select: { ownerTelegramId: true },
        })
      )
        return respond(
          'Сначала завершите мастер партнёрской точки или выполните /partner_cancel.',
        );
      if (command === '/push_new') {
        const next = startDraft('GENERAL');
        await this.saveDraft(tx, ownerId, 'CITIES', next, 0);
        return this.stepReply(ownerId, 'CITIES', next, 0);
      }
      if (!arg || !UUID.test(arg))
        return respond('Укажите UUID точки или рассылки.');
      if (command === '/partner_push') {
        const point = await tx.partnerPoint.findUnique({ where: { id: arg } });
        const now = new Date();
        if (
          !point ||
          point.status !== 'ACTIVE' ||
          point.startsAt > now ||
          point.endsAt <= now ||
          point.latitude === null ||
          point.longitude === null
        )
          return respond('Партнёрская точка не опубликована или недоступна.');
        const next = {
          ...startDraft('PARTNER_POINT', point.id),
          cityIds: [point.cityId],
        };
        await this.saveDraft(tx, ownerId, 'TITLE', next, 0);
        return this.stepReply(ownerId, 'TITLE', next, 0);
      }
      const campaign = await tx.pushCampaign.findFirst({
        where: { id: arg, ownerTelegramId: ownerId },
      });
      if (!campaign || !['ACTIVE', 'PAUSED'].includes(campaign.status))
        return respond(
          'Редактировать можно только активную или приостановленную рассылку.',
        );
      const next: Draft = {
        nonce: randomUUID(),
        kind: campaign.kind,
        editingId: campaign.id,
        baseRevision: campaign.revision,
        ...(campaign.partnerPointId
          ? { partnerPointId: campaign.partnerPointId }
          : {}),
        cityIds: Array.isArray(campaign.cityIds)
          ? campaign.cityIds.filter(
              (id): id is string => typeof id === 'string',
            )
          : [],
        title: campaign.title,
        body: campaign.body,
        schedule: scheduleFromRow(campaign),
      };
      const nextStep = next.kind === 'GENERAL' ? 'CITIES' : 'TITLE';
      await this.saveDraft(tx, ownerId, nextStep, next, 0);
      return this.stepReply(ownerId, nextStep, next, 0);
    }
    if (command === '/push_list') {
      const rows = await tx.pushCampaign.findMany({
        where: { ownerTelegramId: ownerId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          kind: true,
          status: true,
          title: true,
          nextRunAt: true,
        },
      });
      return respond(
        rows.length
          ? rows
              .map(
                (row) =>
                  `${row.id} · ${row.status} · ${row.kind} · ${row.title} · ${row.nextRunAt ? formatSaratovTime(row.nextRunAt) : 'нет будущего запуска'}`,
              )
              .join('\n')
          : 'Рассылок пока нет.',
      );
    }
    if (!arg || !UUID.test(arg)) return respond('Укажите UUID рассылки.');
    const campaign = await tx.pushCampaign.findFirst({
      where: { id: arg, ownerTelegramId: ownerId },
    });
    if (!campaign) return respond('Рассылка не найдена.');
    if (command === '/push_show') {
      const runs = await tx.pushCampaignRun.findMany({
        where: { campaignId: campaign.id },
        select: { id: true, status: true, audienceCount: true },
        take: 100,
      });
      const sent = await tx.pushOutbox.count({
        where: { campaignRun: { campaignId: campaign.id }, status: 'SENT' },
      });
      const pending = await tx.pushOutbox.count({
        where: {
          campaignRun: { campaignId: campaign.id },
          status: { in: ['PENDING', 'RETRY', 'SENDING'] },
        },
      });
      const cancelled = await tx.pushOutbox.count({
        where: {
          campaignRun: { campaignId: campaign.id },
          status: 'CANCELLED',
        },
      });
      return respond(
        `${campaign.title}\n${campaign.body}\nСтатус: ${campaign.status}\nГорода: ${Array.isArray(campaign.cityIds) ? campaign.cityIds.join(', ') : '—'}\nСледующий запуск: ${campaign.nextRunAt ? formatSaratovTime(campaign.nextRunAt) : 'нет'}\nЗапуски: ${runs.length}; пропущено: ${runs.filter((run) => run.status === 'SKIPPED').length}; отобрано устройств: ${runs.reduce((sum, run) => sum + run.audienceCount, 0)}; принято APNs/FCM: ${sent}; в очереди: ${pending}; отменено: ${cancelled}. Принято провайдером не означает показ на телефоне.`,
      );
    }
    if (command === '/push_pause' || command === '/push_cancel') {
      if (campaign.status === 'CANCELLED' || campaign.status === 'COMPLETED')
        return respond('Рассылка уже завершена.');
      const status = command === '/push_pause' ? 'PAUSED' : 'CANCELLED';
      await tx.pushCampaign.update({
        where: { id: campaign.id },
        data: { status },
      });
      await tx.pushOutbox.updateMany({
        where: {
          campaignRun: { campaignId: campaign.id },
          status: { in: ['PENDING', 'RETRY'] },
        },
        data: { status: 'CANCELLED', leaseUntil: null },
      });
      return respond(
        status === 'PAUSED'
          ? 'Рассылка приостановлена; ожидающие уведомления отменены.'
          : 'Рассылка отменена; ожидающие уведомления отменены.',
      );
    }
    if (command === '/push_resume') {
      if (campaign.status !== 'PAUSED')
        return respond('Возобновить можно только приостановленную рассылку.');
      const now = new Date();
      const schedules = await tx.pushCampaignCitySchedule.findMany({
        where: { campaignId: campaign.id },
      });
      const nextRuns = schedules.map((schedule) => ({
        schedule,
        nextRunAt:
          campaign.scheduleKind === 'DAILY' ||
          campaign.scheduleKind === 'WEEKLY'
            ? campaign.localTime && schedule.endsAt
              ? nextRecurringRun(
                  campaign.scheduleKind,
                  campaign.localTime,
                  campaign.weekday,
                  now,
                  schedule.endsAt,
                  schedule.timeZone,
                )
              : null
            : schedule.nextRunAt && schedule.nextRunAt > now
              ? schedule.nextRunAt
              : null,
      }));
      const future = nextRuns
        .map((item) => item.nextRunAt)
        .filter((date): date is Date => date !== null);
      const nextRunAt = future.length
        ? new Date(Math.min(...future.map((date) => date.getTime())))
        : null;
      if (!nextRunAt)
        return respond('Срок расписания прошёл. Создайте новую рассылку.');
      for (const item of nextRuns)
        await tx.pushCampaignCitySchedule.update({
          where: {
            campaignId_cityId: {
              campaignId: campaign.id,
              cityId: item.schedule.cityId,
            },
          },
          data: { nextRunAt: item.nextRunAt },
        });
      await tx.pushCampaign.update({
        where: { id: campaign.id },
        data: { status: 'ACTIVE', nextRunAt },
      });
      return respond(
        `Рассылка возобновлена. Следующий запуск: ${formatSaratovTime(nextRunAt)}.`,
      );
    }
    return respond('Неизвестная команда. /push — помощь.');
  }

  private async processDraftText(
    tx: Prisma.TransactionClient,
    ownerId: string,
    step: DraftStep | undefined,
    draft: Draft | undefined,
    text: string,
  ): Promise<PartnerBotReply> {
    const respond = (body: string): PartnerBotReply => ({
      chatId: ownerId,
      text: body,
    });
    if (!draft || !step)
      return respond('Нет активного мастера. /push — помощь.');
    if (step === 'PREVIEW') {
      const row = await tx.pushBotDraft.findUnique({
        where: { ownerTelegramId: ownerId },
      });
      return this.preview(tx, ownerId, draft, row?.revision ?? 0);
    }
    const keep = text === '/keep' && Boolean(draft.editingId);
    const next: Draft = { ...draft };
    let nextStep: DraftStep;
    if (step === 'CITIES') {
      if (!keep) {
        const values =
          text.toLowerCase() === 'все'
            ? [...getAvailableCityIds()]
            : [
                ...new Set(
                  text.split(',').map((value) => value.trim().toLowerCase()),
                ),
              ];
        if (!values.length || values.some((id) => !getCityConfig(id)))
          return respond('Неизвестный город. ' + prompt(step, draft));
        next.cityIds = values;
      }
      nextStep = 'TITLE';
    } else if (step === 'TITLE') {
      if (!keep) {
        if (text.length < 1 || text.length > 100)
          return respond('Заголовок должен содержать 1–100 символов.');
        next.title = text;
      }
      nextStep = 'BODY';
    } else if (step === 'BODY') {
      if (!keep) {
        if (text.length < 1 || text.length > 240)
          return respond('Текст должен содержать 1–240 символов.');
        next.body = text;
      }
      nextStep = 'SCHEDULE';
    } else {
      if (!keep) {
        const weekdays = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
        const scheduleText =
          draft.scheduleMode === 'ONCE'
            ? `один ${text}`
            : draft.scheduleMode === 'DAILY'
              ? `каждый день ${text}`
              : draft.scheduleMode === 'WEEKLY' &&
                  draft.scheduleWeekday !== undefined
                ? `каждую неделю ${weekdays[draft.scheduleWeekday]} ${text}`
                : text;
        const timeZone = next.cityIds?.[0]
          ? getCityConfig(next.cityIds[0])?.timeZone
          : undefined;
        if (!timeZone)
          return respond('Для выбранного города не задан часовой пояс.');
        const schedule = parseCampaignSchedule(
          scheduleText,
          new Date(),
          timeZone,
        );
        if (!schedule)
          return respond(
            'Не удалось прочитать расписание. ' + prompt(step, draft),
          );
        next.schedule = {
          kind: schedule.kind,
          localTime: schedule.localTime,
          weekday: schedule.weekday,
          firstRunAt: schedule.firstRunAt.toISOString(),
          endsAt: schedule.endsAt?.toISOString() ?? null,
        };
      } else if (
        !next.schedule ||
        new Date(next.schedule.firstRunAt) <= new Date()
      ) {
        return respond('Старое время уже прошло. Укажите новое расписание.');
      }
      nextStep = 'PREVIEW';
    }
    if (
      (step === 'CITIES' && !next.cityIds?.length) ||
      (step === 'TITLE' && !next.title) ||
      (step === 'BODY' && !next.body)
    )
      return respond('Сохранённое значение отсутствует. Введите новое.');
    const row = await tx.pushBotDraft.findUnique({
      where: { ownerTelegramId: ownerId },
    });
    const revision = (row?.revision ?? 0) + 1;
    await this.saveDraft(tx, ownerId, nextStep, next, revision);
    return nextStep === 'PREVIEW'
      ? this.preview(tx, ownerId, next, revision)
      : this.stepReply(ownerId, nextStep, next, revision);
  }

  private async processCallback(
    tx: Prisma.TransactionClient,
    ownerId: string,
    step: DraftStep | undefined,
    draft: Draft | undefined,
    revision: number,
    data: string,
  ): Promise<PartnerBotReply> {
    const dateAction =
      /^pc:date:(cancel|back|day\d{1,3}|page\d{1,2}|hour\d{1,2}|minute(?:0|15|30|45)):(\d+)$/u.exec(
        data,
      );
    if (dateAction) {
      if (
        !draft ||
        step !== 'SCHEDULE' ||
        !draft.scheduleMode ||
        Number(dateAction[2]) !== revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const zone = draft.cityIds?.[0]
        ? getCityConfig(draft.cityIds[0])?.timeZone
        : undefined;
      if (!zone)
        return {
          chatId: ownerId,
          callbackText: 'Для города не задан часовой пояс',
        };
      const action = dateAction[1];
      if (action === 'cancel') {
        if (draft.schedule) {
          const next = { ...draft, scheduleSelection: undefined };
          await this.saveDraft(tx, ownerId, 'PREVIEW', next, revision + 1);
          return this.preview(tx, ownerId, next, revision + 1);
        }
        await tx.pushBotDraft.delete({ where: { ownerTelegramId: ownerId } });
        return { chatId: ownerId, text: 'Черновик рассылки отменён.' };
      }
      const next: Draft = structuredClone(draft);
      const selection = next.scheduleSelection ?? { stage: 'FIRST' as const };
      next.scheduleSelection = selection;
      const complete = async (
        firstLocal: string,
        endLocal?: string,
      ): Promise<PartnerBotReply | null> => {
        const prefix =
          next.scheduleMode === 'ONCE'
            ? 'один'
            : next.scheduleMode === 'DAILY'
              ? 'каждый день'
              : `каждую неделю ${['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][next.scheduleWeekday ?? 0]}`;
        const parsed = parseCampaignSchedule(
          `${prefix} ${firstLocal}${endLocal ? ` до ${endLocal}` : ''}`,
          new Date(),
          zone,
        );
        if (!parsed)
          return {
            chatId: ownerId,
            callbackText: 'Срок или время недоступны; выберите другие',
          };
        next.schedule = {
          kind: parsed.kind,
          localTime: parsed.localTime,
          weekday: parsed.weekday,
          firstRunAt: parsed.firstRunAt.toISOString(),
          endsAt: parsed.endsAt?.toISOString() ?? null,
        };
        delete next.scheduleSelection;
        await this.saveDraft(tx, ownerId, 'PREVIEW', next, revision + 1);
        return this.preview(tx, ownerId, next, revision + 1);
      };
      if (action.startsWith('page')) {
        const page = Number(action.slice(4));
        if (page > 12)
          return { chatId: ownerId, callbackText: 'Дата недоступна' };
        selection.page = page;
        delete selection.day;
        delete selection.hour;
      } else if (action.startsWith('day')) {
        const offset = Number(action.slice(3));
        const day = offset <= 90 ? campaignLocalDay(next, offset) : null;
        if (!day) return { chatId: ownerId, callbackText: 'Дата недоступна' };
        if (selection.stage === 'END') {
          const firstLocal = selection.firstLocal;
          if (!firstLocal)
            return { chatId: ownerId, callbackText: 'Сначала выберите начало' };
          const completed = await complete(firstLocal, day);
          if (completed) return completed;
        }
        selection.day = day;
        delete selection.page;
        delete selection.hour;
      } else if (action.startsWith('hour')) {
        const hour = Number(action.slice(4));
        if (
          !selection.day ||
          selection.stage !== 'FIRST' ||
          hour < 8 ||
          hour >= 22
        )
          return { chatId: ownerId, callbackText: 'Сначала выберите дату' };
        selection.hour = hour;
      } else if (action.startsWith('minute')) {
        const minute = Number(action.slice(6));
        if (
          !selection.day ||
          selection.hour === undefined ||
          selection.stage !== 'FIRST'
        )
          return { chatId: ownerId, callbackText: 'Сначала выберите час' };
        const firstLocal = `${selection.day} ${String(selection.hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        if (next.scheduleMode === 'ONCE') {
          const completed = await complete(firstLocal);
          if (completed) return completed;
        }
        if (selection.preserveEnd && next.schedule?.endsAt) {
          const end = cityLocalParts(new Date(next.schedule.endsAt), zone);
          const endLocal = `${end.year}-${String(end.month).padStart(2, '0')}-${String(end.day).padStart(2, '0')}`;
          const prefix =
            next.scheduleMode === 'DAILY'
              ? 'каждый день'
              : `каждую неделю ${['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][next.scheduleWeekday ?? 0]}`;
          if (
            parseCampaignSchedule(
              `${prefix} ${firstLocal} до ${endLocal}`,
              new Date(),
              zone,
            )
          ) {
            const completed = await complete(firstLocal, endLocal);
            if (completed) return completed;
          }
        }
        selection.stage = 'END';
        selection.firstLocal = firstLocal;
        delete selection.day;
        delete selection.hour;
        delete selection.page;
      } else if (action === 'back') {
        if (selection.hour !== undefined) delete selection.hour;
        else if (selection.day) {
          delete selection.day;
          selection.page = 0;
        } else if (selection.stage === 'END') selection.stage = 'FIRST';
      }
      await this.saveDraft(tx, ownerId, 'SCHEDULE', next, revision + 1);
      return this.stepReply(ownerId, 'SCHEDULE', next, revision + 1);
    }
    const cityAction = /^pc:city:([a-z0-9_-]+):(\d+)$/u.exec(data);
    if (cityAction) {
      if (!draft || step !== 'CITIES' || Number(cityAction[2]) !== revision)
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const next: Draft = { ...draft };
      const cityId = cityAction[1];
      if (cityId === 'all') next.cityIds = [...getAvailableCityIds()];
      else if (cityId === 'done') {
        if (!next.cityIds?.length)
          return { chatId: ownerId, callbackText: 'Выберите город' };
        await this.saveDraft(tx, ownerId, 'TITLE', next, revision + 1);
        return this.stepReply(ownerId, 'TITLE', next, revision + 1);
      } else {
        if (!getCityConfig(cityId))
          return { chatId: ownerId, callbackText: 'Неизвестный город' };
        const selected = new Set(next.cityIds ?? []);
        if (selected.has(cityId)) selected.delete(cityId);
        else selected.add(cityId);
        next.cityIds = [...selected];
      }
      await this.saveDraft(tx, ownerId, 'CITIES', next, revision + 1);
      return this.stepReply(ownerId, 'CITIES', next, revision + 1);
    }
    const modeAction = /^pc:mode:(now|once|daily|weekly):(\d+)$/u.exec(data);
    if (modeAction) {
      if (!draft || step !== 'SCHEDULE' || Number(modeAction[2]) !== revision)
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const next: Draft = { ...draft };
      if (modeAction[1] === 'now') {
        const timeZone = draft.cityIds?.[0]
          ? getCityConfig(draft.cityIds[0])?.timeZone
          : undefined;
        if (!timeZone)
          return {
            chatId: ownerId,
            callbackText: 'Для города не задан часовой пояс',
          };
        const schedule = parseCampaignSchedule('сейчас', new Date(), timeZone);
        if (!schedule)
          return { chatId: ownerId, callbackText: 'Сейчас недоступно' };
        next.schedule = {
          kind: schedule.kind,
          localTime: schedule.localTime,
          weekday: schedule.weekday,
          firstRunAt: schedule.firstRunAt.toISOString(),
          endsAt: schedule.endsAt?.toISOString() ?? null,
        };
        await this.saveDraft(tx, ownerId, 'PREVIEW', next, revision + 1);
        return this.preview(tx, ownerId, next, revision + 1);
      }
      next.scheduleMode = modeAction[1].toUpperCase() as Draft['scheduleMode'];
      delete next.scheduleWeekday;
      next.scheduleSelection = { stage: 'FIRST' };
      await this.saveDraft(tx, ownerId, 'SCHEDULE', next, revision + 1);
      return this.stepReply(ownerId, 'SCHEDULE', next, revision + 1);
    }
    const weekdayAction = /^pc:weekday:([1-7]):(\d+)$/u.exec(data);
    if (weekdayAction) {
      if (
        !draft ||
        step !== 'SCHEDULE' ||
        draft.scheduleMode !== 'WEEKLY' ||
        Number(weekdayAction[2]) !== revision
      )
        return { chatId: ownerId, callbackText: 'Кнопка устарела' };
      const next = {
        ...draft,
        scheduleWeekday: Number(weekdayAction[1]),
        scheduleSelection: { stage: 'FIRST' as const },
      };
      await this.saveDraft(tx, ownerId, 'SCHEDULE', next, revision + 1);
      return this.stepReply(ownerId, 'SCHEDULE', next, revision + 1);
    }
    const match =
      /^pc:([0-9a-f-]{36}):(\d+):(confirm|cancel|edit-cities|edit-title|edit-body|edit-schedule|edit-start|edit-end)$/iu.exec(
        data,
      );
    if (
      !match ||
      !draft ||
      step !== 'PREVIEW' ||
      match[1] !== draft.nonce ||
      Number(match[2]) !== revision
    )
      return { chatId: ownerId, callbackText: 'Кнопка устарела' };
    if (match[3] === 'cancel') {
      await tx.pushBotDraft.delete({ where: { ownerTelegramId: ownerId } });
      return {
        chatId: ownerId,
        callbackText: 'Отменено',
        text: 'Черновик рассылки удалён.',
      };
    }
    if (match[3] === 'edit-start' || match[3] === 'edit-end') {
      if (!draft.schedule || draft.schedule.kind === 'NOW')
        return { chatId: ownerId, callbackText: 'Сначала выберите расписание' };
      const zone = draft.cityIds?.[0]
        ? getCityConfig(draft.cityIds[0])?.timeZone
        : undefined;
      if (!zone)
        return {
          chatId: ownerId,
          callbackText: 'Для города не задан часовой пояс',
        };
      const first = cityLocalParts(new Date(draft.schedule.firstRunAt), zone);
      const pad = (value: number) => String(value).padStart(2, '0');
      const firstLocal = `${first.year}-${pad(first.month)}-${pad(first.day)} ${pad(first.hour)}:${pad(first.minute)}`;
      const next: Draft = {
        ...draft,
        scheduleMode: draft.schedule.kind,
        scheduleWeekday: draft.schedule.weekday ?? undefined,
        scheduleSelection:
          match[3] === 'edit-end'
            ? { stage: 'END', firstLocal }
            : { stage: 'FIRST', preserveEnd: true },
      };
      await this.saveDraft(tx, ownerId, 'SCHEDULE', next, revision + 1);
      return this.stepReply(ownerId, 'SCHEDULE', next, revision + 1);
    }
    if (match[3].startsWith('edit-')) {
      const target = match[3].slice(5).toUpperCase() as DraftStep;
      if (target === 'CITIES' && draft.kind === 'PARTNER_POINT')
        return { chatId: ownerId, callbackText: 'Город берётся из точки' };
      const next = { ...draft };
      if (target === 'SCHEDULE') {
        delete next.scheduleMode;
        delete next.scheduleWeekday;
        delete next.scheduleSelection;
      }
      await this.saveDraft(tx, ownerId, target, next, revision + 1);
      return this.stepReply(ownerId, target, next, revision + 1);
    }
    const schedule = draft.schedule;
    if (!schedule || !draft.cityIds?.length || !draft.title || !draft.body)
      return { chatId: ownerId, callbackText: 'Черновик неполный' };
    if (process.env.PUSH_ENQUEUE_ENABLED !== 'true')
      return {
        chatId: ownerId,
        callbackText: 'Рассылки пока выключены на сервере',
      };
    const now = new Date();
    const firstRunAt = new Date(schedule.firstRunAt);
    if (firstRunAt.getTime() < now.getTime() - 15 * 60_000)
      return {
        chatId: ownerId,
        callbackText: 'Время устарело; задайте расписание заново',
      };
    if (draft.kind === 'PARTNER_POINT') {
      const point = draft.partnerPointId
        ? await tx.partnerPoint.findUnique({
            where: { id: draft.partnerPointId },
          })
        : null;
      if (
        !point ||
        point.status !== 'ACTIVE' ||
        point.startsAt > now ||
        point.endsAt <= now ||
        point.cityId !== draft.cityIds[0]
      )
        return { chatId: ownerId, callbackText: 'Точка недоступна' };
    }
    const referenceZone = getCityConfig(draft.cityIds[0])?.timeZone;
    if (!referenceZone)
      return {
        chatId: ownerId,
        callbackText: 'Для города не задан часовой пояс',
      };
    const typedSchedule: CampaignSchedule = {
      kind: schedule.kind,
      localTime: schedule.localTime,
      weekday: schedule.weekday,
      firstRunAt,
      endsAt: schedule.endsAt ? new Date(schedule.endsAt) : null,
    };
    const citySchedules = draft.cityIds.map((cityId) => {
      const zone = getCityConfig(cityId)?.timeZone;
      const projected = zone
        ? projectCampaignScheduleToZone(typedSchedule, referenceZone, zone, now)
        : null;
      return zone && projected
        ? { cityId, timeZone: zone, ...projected }
        : null;
    });
    if (citySchedules.some((item) => item === null))
      return {
        chatId: ownerId,
        callbackText: 'Проверьте часовые пояса и время каждого города',
      };
    const schedules = citySchedules.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );
    const earliestRunAt = schedules.reduce(
      (earliest, item) =>
        item.nextRunAt < earliest ? item.nextRunAt : earliest,
      schedules[0].nextRunAt,
    );
    const dataForCampaign = {
      kind: draft.kind,
      partnerPointId: draft.partnerPointId ?? null,
      cityIds: draft.cityIds,
      title: draft.title,
      body: draft.body,
      scheduleKind: schedule.kind,
      localTime: schedule.localTime,
      weekday: schedule.weekday,
      endsAt: schedule.endsAt ? new Date(schedule.endsAt) : null,
      nextRunAt: earliestRunAt,
    };
    let campaignId: string;
    if (draft.editingId) {
      const changed = await tx.pushCampaign.updateMany({
        where: {
          id: draft.editingId,
          ownerTelegramId: ownerId,
          revision: draft.baseRevision,
          status: { in: ['ACTIVE', 'PAUSED'] },
        },
        data: { ...dataForCampaign, revision: { increment: 1 } },
      });
      if (changed.count !== 1)
        return {
          chatId: ownerId,
          callbackText: 'Рассылка изменилась; откройте мастер заново',
        };
      campaignId = draft.editingId;
      await tx.pushCampaignCitySchedule.deleteMany({ where: { campaignId } });
      await tx.pushCampaignCitySchedule.createMany({
        data: schedules.map((item) => ({
          campaignId,
          cityId: item.cityId,
          timeZone: item.timeZone,
          nextRunAt: item.nextRunAt,
          endsAt: item.endsAt,
        })),
      });
      await tx.pushOutbox.updateMany({
        where: {
          campaignRun: { campaignId },
          status: { in: ['PENDING', 'RETRY'] },
        },
        data: { status: 'CANCELLED', leaseUntil: null },
      });
    } else {
      const campaign = await tx.pushCampaign.create({
        data: { ...dataForCampaign, ownerTelegramId: ownerId },
      });
      campaignId = campaign.id;
      await tx.pushCampaignCitySchedule.createMany({
        data: schedules.map((item) => ({
          campaignId,
          cityId: item.cityId,
          timeZone: item.timeZone,
          nextRunAt: item.nextRunAt,
          endsAt: item.endsAt,
        })),
      });
    }
    await tx.pushBotDraft.delete({ where: { ownerTelegramId: ownerId } });
    return {
      chatId: ownerId,
      callbackText: 'Расписание подтверждено',
      text: `Рассылка ${campaignId} подтверждена. Первый запуск по городам: ${schedules.map((item) => `${item.cityId} — ${formatCityTime(item.nextRunAt, item.timeZone)}`).join('; ')}. Статус и результаты: /push_show ${campaignId}.`,
    };
  }
}
