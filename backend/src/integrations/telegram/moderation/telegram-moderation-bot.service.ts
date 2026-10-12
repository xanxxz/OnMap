import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { RoadEventsGateway } from '../../../road-events/realtime/road-events.gateway';
import type { RoadEventRealtimePayload } from '../../../road-events/road-events.types';
import { sanitizeTelegramSourceText } from '../../../road-events/telegram-source-text';
import { PartnerBotService } from '../../../partner-placements/partner-bot.service';
import {
  downloadPartnerTelegramImage,
  telegramImageReference,
} from '../../../partner-placements/partner-telegram-image';
import { TelegramSingletonLockService } from '../telegram-singleton-lock.service';
import type { ExternalRoadEventGeometry } from '../../tomtom/tomtom.types';
import { isAuthorizedModerationUpdate } from './telegram-moderation.access';
import {
  ModerationCallbackAction,
  parseModerationCallback,
  parseRestrictionHours,
  TELEGRAM_MODERATION_CONFIG,
} from './telegram-moderation.constants';

interface TelegramApiResult<T = unknown> {
  ok?: boolean;
  result?: T;
  error_code?: unknown;
}

interface TelegramUpdate {
  update_id?: unknown;
  message?: unknown;
  callback_query?: unknown;
}

interface ClaimedOutbox {
  id: string;
  roadEventId: string;
  attempts: number;
}

interface ModerationEventRow {
  id: string;
  cityId: string;
  type: string;
  source: 'USER' | 'TELEGRAM';
  status: string;
  title: string;
  description: string | null;
  longitude: number;
  latitude: number;
  createdAt: Date | string;
  expiresAt: Date | string;
  createdByActorId: string | null;
  statusBeforeModeration: string | null;
  confirmationCount: number;
  rejectionCount: number;
  confidence: number;
  lastConfirmedAt: Date | string | null;
  geometry: ExternalRoadEventGeometry | null;
  sourceText: string | null;
  locationPrecision: string | null;
  locationLabel: string | null;
}

interface TelegramMessageRef {
  chatId: string | number;
  messageId: string | number;
  text: string;
}

type CallbackOutcome = {
  status:
    | 'DUPLICATE'
    | 'INVALID'
    | 'NO_CASE'
    | 'ALREADY_DECIDED'
    | 'RESTORED'
    | 'RESTRICTED'
    | 'EXPIRED'
    | 'AUTHOR_UNAVAILABLE'
    | 'CHOOSE_RESTRICTION';
  event?: ModerationEventRow;
};

const REPORT_REASON_LABELS: Record<string, string> = {
  WRONG_TYPE: 'Неверный тип',
  WRONG_LOCATION: 'Неверная точка',
  DUPLICATE: 'Дубль',
  OTHER_ABUSE: 'Злоупотребление',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

const idString = (value: unknown): string | null =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : null;

type ModerationPollingStage = 'CURSOR_QUERY' | 'GET_UPDATES' | 'UPDATE_PROCESS';

const SAFE_DATABASE_ERROR_CODES = new Set([
  '42P01',
  '22P02',
  '28P01',
  '08001',
  'P1001',
  'P2010',
]);

/** Keep provider URLs, tokens, payloads and exception messages out of runtime logs. */
export const formatModerationPollingFailure = (
  stage: ModerationPollingStage,
  error: unknown,
): string => {
  const details = asRecord(error);
  const message = error instanceof Error ? error.message : '';
  const httpStatus = /^BOT_HTTP_(\d{3})$/u.exec(message)?.[1];
  if (httpStatus) return `stage=${stage} type=HTTP status=${httpStatus}`;
  const apiStatus = /^BOT_API_(\d{3})$/u.exec(message)?.[1];
  if (apiStatus) return `stage=${stage} type=API_RESPONSE status=${apiStatus}`;
  if (message === 'BOT_TIMEOUT')
    return `stage=${stage} type=TIMEOUT status=none`;
  if (message === 'BOT_NETWORK_ERROR')
    return `stage=${stage} type=NETWORK status=none`;
  if (message === 'BOT_API_FAILED')
    return `stage=${stage} type=API_RESPONSE status=none`;
  if (message === 'BOT_INVALID_RESPONSE')
    return `stage=${stage} type=INVALID_RESPONSE status=none`;

  const meta = asRecord(details?.meta);
  const rawCode = meta?.code ?? details?.code;
  const code =
    typeof rawCode === 'string' && SAFE_DATABASE_ERROR_CODES.has(rawCode)
      ? rawCode
      : 'none';
  return `stage=${stage} type=${stage === 'CURSOR_QUERY' ? 'DATABASE' : 'UNKNOWN'} code=${code}`;
};

@Injectable()
export class TelegramModerationBotService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramModerationBotService.name);
  private readonly token: string;
  private readonly ownerChatId: string;
  private readonly restrictionHours: number[];
  private stopped = false;
  private active = false;
  private outboxTimer?: NodeJS.Timeout;
  private pollAbort?: AbortController;
  private outboxRunning = false;
  private pollLoopPromise: Promise<void> | undefined;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly gateway: RoadEventsGateway,
    private readonly singletonLock: TelegramSingletonLockService,
    private readonly partnerBot: PartnerBotService,
  ) {
    this.token =
      config.get<string>(TELEGRAM_MODERATION_CONFIG.tokenEnv)?.trim() ?? '';
    this.ownerChatId =
      config.get<string>(TELEGRAM_MODERATION_CONFIG.chatIdEnv)?.trim() ?? '';
    this.restrictionHours = parseRestrictionHours(
      config.get<string>(TELEGRAM_MODERATION_CONFIG.restrictionHoursEnv),
    );
  }

  onApplicationBootstrap(): void {
    void this.startPoller();
  }

  private async startPoller(): Promise<void> {
    if (!this.token || !/^\d+$/.test(this.ownerChatId)) {
      this.logger.warn(
        'Telegram moderation bot disabled: set TELEGRAM_MODERATION_BOT_TOKEN and TELEGRAM_MODERATION_CHAT_ID',
      );
      return;
    }
    try {
      if (
        !(await this.singletonLock.tryAcquire('moderation-bot', () => {
          this.logger.error(
            'Telegram moderation poller stopped: singleton lock connection lost',
          );
          this.stopped = true;
          this.pollAbort?.abort();
          if (this.outboxTimer) clearInterval(this.outboxTimer);
        }))
      ) {
        this.logger.warn(
          'Telegram moderation poller not started: singleton lock is held by another instance',
        );
        return;
      }
    } catch {
      this.logger.error(
        'Telegram moderation poller not started: singleton lock unavailable',
      );
      return;
    }

    if (this.stopped) {
      await this.singletonLock.release('moderation-bot');
      return;
    }
    this.active = true;
    this.stopped = false;
    this.outboxTimer = setInterval(
      () => void this.processOneOutbox(),
      TELEGRAM_MODERATION_CONFIG.outboxPollIntervalMs,
    );
    this.outboxTimer.unref();
    this.pollLoopPromise = this.pollLoop();
    void this.processOneOutbox();
    this.logger.log('Telegram moderation bot enabled');
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.pollAbort?.abort();
    if (this.outboxTimer) clearInterval(this.outboxTimer);
    await this.pollLoopPromise?.catch(() => undefined);
    this.active = false;
    await this.singletonLock.release('moderation-bot');
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopped) {
      let stage: ModerationPollingStage = 'CURSOR_QUERY';
      try {
        const cursors = await this.prisma.$queryRaw<
          readonly { nextOffset: bigint | number | null }[]
        >`
          SELECT COALESCE(MAX(update_id) + 1, 0)::bigint AS "nextOffset"
          FROM telegram_moderation_updates
        `;
        const offset = Number(cursors[0]?.nextOffset ?? 0);
        this.pollAbort = new AbortController();
        const pollSignal = AbortSignal.any([
          this.pollAbort.signal,
          AbortSignal.timeout(TELEGRAM_MODERATION_CONFIG.pollingTimeoutMs),
        ]);
        stage = 'GET_UPDATES';
        const updates = await this.callApi<TelegramUpdate[]>(
          'getUpdates',
          {
            offset,
            limit: 100,
            timeout: TELEGRAM_MODERATION_CONFIG.pollingTimeoutSeconds,
            allowed_updates: ['message', 'callback_query'],
          },
          pollSignal,
        );
        this.pollAbort = undefined;
        for (const update of updates) {
          if (this.stopped) break;
          try {
            await this.processUpdate(update);
          } catch (error) {
            this.logger.warn(
              `Telegram moderation update processing failed ${formatModerationPollingFailure('UPDATE_PROCESS', error)}`,
            );
            break;
          }
        }
      } catch (error) {
        this.pollAbort = undefined;
        if (!this.stopped) {
          this.logger.warn(
            `Telegram moderation polling unavailable; retrying ${formatModerationPollingFailure(stage, error)}`,
          );
          await this.delay(1_500);
        }
      }
    }
  }

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    const updateId = update.update_id;
    if (typeof updateId !== 'number' || !Number.isSafeInteger(updateId)) return;

    if (await this.partnerBot.shouldHandle(update)) {
      const imageReference = telegramImageReference(update.message);
      let imageInput: { bytes: Buffer } | { error: string } | undefined;
      if (imageReference && (await this.partnerBot.isAwaitingImage(update))) {
        try {
          imageInput = {
            bytes: await downloadPartnerTelegramImage(
              imageReference,
              this.token,
              (fileId) =>
                this.callApi<{ file_path?: unknown; file_size?: unknown }>(
                  'getFile',
                  { file_id: fileId },
                ),
            ),
          };
        } catch {
          imageInput = {
            error:
              'Не удалось загрузить изображение. Пришлите PNG, JPEG или WebP до 4 МБ ещё раз.',
          };
        }
      }
      const reply = await this.partnerBot.process(update, imageInput);
      const callback = asRecord(update.callback_query);
      const callbackId = idString(callback?.id);
      if (callbackId) {
        await this.safeApiCall('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: reply.duplicate
            ? 'Уже обработано'
            : (reply.callbackText ?? 'Готово'),
        });
      }
      if (reply.duplicate) return;
      if (reply.text) {
        await this.safeApiCall('sendMessage', {
          chat_id: reply.chatId,
          text: reply.text.slice(0, 4_000),
          ...(reply.keyboard ? { reply_markup: reply.keyboard } : {}),
        });
      }
      return;
    }

    if (!isAuthorizedModerationUpdate(update, this.ownerChatId)) {
      await this.markUpdateProcessed(updateId);
      return;
    }

    const callback = asRecord(update.callback_query);
    if (callback) {
      const callbackId = idString(callback.id);
      const data = typeof callback.data === 'string' ? callback.data : '';
      const parsed = parseModerationCallback(data, this.restrictionHours);
      const outcome = await this.processCallbackUpdate(
        updateId,
        parsed,
        callback,
      );
      if (callbackId) {
        const message = this.callbackMessage(callback);
        await this.safeApiCall('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: this.callbackStatusText(outcome.status),
          show_alert:
            outcome.status === 'EXPIRED' || outcome.status === 'NO_CASE',
        });
        if (message && parsed)
          await this.updateModerationMessage(message, parsed, outcome);
      }
      if (outcome.status === 'RESTORED' && outcome.event) {
        this.gateway.broadcastUpdated(this.toRealtimeEvent(outcome.event));
      }
      if (outcome.status === 'EXPIRED' && outcome.event) {
        this.gateway.broadcastResolved({
          id: outcome.event.id,
          cityId: outcome.event.cityId,
          resolvedAt: new Date().toISOString(),
        });
      }
      return;
    }

    const message = asRecord(update.message);
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    const inserted = await this.markUpdateProcessed(updateId);
    if (!inserted) return;
    const command = text.split(/\s/u, 1)[0]?.split('@', 1)[0]?.toLowerCase();
    if (command === '/help') {
      await this.safeApiCall('sendMessage', {
        chat_id: this.ownerChatId,
        text: 'OnMap moderation is active. New reports will appear here with review actions. Use /queue to list open cases.',
      });
    } else if (command === '/queue') {
      await this.sendPendingQueue();
    }
  }

  private async markUpdateProcessed(updateId: number): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<readonly { updateId: bigint }[]>`
      INSERT INTO telegram_moderation_updates (update_id)
      VALUES (${BigInt(updateId)})
      ON CONFLICT (update_id) DO NOTHING
      RETURNING update_id AS "updateId"
    `;
    return rows.length > 0;
  }

  private async processCallbackUpdate(
    updateId: number,
    action: ModerationCallbackAction | null,
    callback: Record<string, unknown>,
  ): Promise<CallbackOutcome> {
    const moderatorId =
      idString(asRecord(callback.from)?.id) ?? this.ownerChatId;
    return this.prisma.$transaction(async (tx) => {
      const processed = await tx.$queryRaw<readonly { updateId: bigint }[]>`
        INSERT INTO telegram_moderation_updates (update_id)
        VALUES (${BigInt(updateId)})
        ON CONFLICT (update_id) DO NOTHING
        RETURNING update_id AS "updateId"
      `;
      if (processed.length === 0) return { status: 'DUPLICATE' };
      if (!action) return { status: 'INVALID' };
      if (action.kind === 'CHOOSE_RESTRICTION') {
        const cases = await tx.$queryRaw<readonly { state: string }[]>`
          SELECT state FROM road_event_moderation_cases
          WHERE road_event_id = ${action.eventId}::uuid FOR UPDATE
        `;
        return cases[0]?.state === 'PENDING_REVIEW'
          ? { status: 'CHOOSE_RESTRICTION' }
          : { status: 'ALREADY_DECIDED' };
      }

      const events = await tx.$queryRaw<ModerationEventRow[]>`
        SELECT
          id::text AS id,
          city_id AS "cityId",
          type::text AS type,
          source::text AS source,
          status::text AS status,
          title,
          description,
          longitude,
          latitude,
          created_at AS "createdAt",
          expires_at AS "expiresAt",
          created_by_installation_id AS "createdByActorId",
          status_before_moderation::text AS "statusBeforeModeration",
          confirmation_count AS "confirmationCount",
          rejection_count AS "rejectionCount",
          confidence,
          last_confirmed_at AS "lastConfirmedAt",
          ST_AsGeoJSON(location)::json AS geometry,
          source_text AS "sourceText",
          location_precision::text AS "locationPrecision",
          location_label AS "locationLabel"
        FROM road_events WHERE id = ${action.eventId}::uuid FOR UPDATE
      `;
      const event = events[0];
      if (!event) return { status: 'NO_CASE' };
      const cases = await tx.$queryRaw<readonly { state: string }[]>`
        SELECT state FROM road_event_moderation_cases
        WHERE road_event_id = ${action.eventId}::uuid FOR UPDATE
      `;
      if (cases[0]?.state !== 'PENDING_REVIEW')
        return { status: 'ALREADY_DECIDED', event };

      const now = new Date();
      if (
        event.status !== 'HIDDEN_PENDING_REVIEW' ||
        new Date(event.expiresAt).getTime() <= now.getTime()
      ) {
        if (event.status === 'HIDDEN_PENDING_REVIEW') {
          await tx.$executeRaw`
            UPDATE road_events SET status = 'RESOLVED'::"RoadEventStatus",
              resolved_at = COALESCE(resolved_at, ${now}),
              status_before_moderation = NULL, hidden_at = NULL, updated_at = ${now}
            WHERE id = ${action.eventId}::uuid
          `;
        }
        await tx.$executeRaw`
          UPDATE road_event_moderation_cases SET state = 'EXPIRED',
            decision_at = ${now}, moderator_telegram_id = ${moderatorId}, updated_at = ${now}
          WHERE road_event_id = ${action.eventId}::uuid AND state = 'PENDING_REVIEW'
        `;
        await tx.$executeRaw`
          INSERT INTO road_event_moderation_audit
            (id, road_event_id, moderator_telegram_id, decision, telegram_update_id)
          VALUES (${randomUUID()}::uuid, ${action.eventId}::uuid, ${moderatorId}, 'EXPIRED', ${BigInt(updateId)})
          ON CONFLICT (telegram_update_id) DO NOTHING
        `;
        return { status: 'EXPIRED', event: { ...event, status: 'RESOLVED' } };
      }

      if (action.kind === 'RESTORE') {
        const restoredStatus = event.statusBeforeModeration ?? 'ACTIVE';
        const updated = await tx.$queryRaw<ModerationEventRow[]>`
          UPDATE road_events SET status = ${restoredStatus}::"RoadEventStatus",
            status_before_moderation = NULL, hidden_at = NULL, updated_at = ${now}
          WHERE id = ${action.eventId}::uuid
            AND status = 'HIDDEN_PENDING_REVIEW'::"RoadEventStatus"
            AND expires_at > ${now}
          RETURNING
            id::text AS id, city_id AS "cityId", type::text AS type,
            status::text AS status, title, description, longitude, latitude,
            created_at AS "createdAt", expires_at AS "expiresAt",
            source::text AS source,
            created_by_installation_id AS "createdByActorId",
            status_before_moderation::text AS "statusBeforeModeration",
            confirmation_count AS "confirmationCount", rejection_count AS "rejectionCount",
            confidence, last_confirmed_at AS "lastConfirmedAt",
            ST_AsGeoJSON(location)::json AS geometry,
            source_text AS "sourceText",
            location_precision::text AS "locationPrecision",
            location_label AS "locationLabel"
        `;
        const restored = updated[0];
        if (!restored) return { status: 'ALREADY_DECIDED' };
        await tx.$executeRaw`
          UPDATE road_event_moderation_cases SET state = 'RESTORED',
            decision_at = ${now}, moderator_telegram_id = ${moderatorId}, updated_at = ${now}
          WHERE road_event_id = ${action.eventId}::uuid AND state = 'PENDING_REVIEW'
        `;
        await tx.$executeRaw`
          INSERT INTO road_event_moderation_audit
            (id, road_event_id, moderator_telegram_id, decision, telegram_update_id)
          VALUES (${randomUUID()}::uuid, ${action.eventId}::uuid, ${moderatorId}, 'RESTORED', ${BigInt(updateId)})
          ON CONFLICT (telegram_update_id) DO NOTHING
        `;
        return { status: 'RESTORED', event: restored };
      }

      if (!event.createdByActorId)
        return { status: 'AUTHOR_UNAVAILABLE', event };
      const blockedUntil = new Date(now.getTime() + action.hours * 60 * 60_000);
      await tx.$executeRaw`
        INSERT INTO actor_restrictions
          (actor_id, blocked_until, created_by_moderator_id, reason)
        VALUES (${event.createdByActorId}, ${blockedUntil}, ${moderatorId}, 'REPORT_REVIEW')
        ON CONFLICT (actor_id) DO UPDATE SET
          blocked_until = GREATEST(actor_restrictions.blocked_until, EXCLUDED.blocked_until),
          created_at = NOW(), created_by_moderator_id = EXCLUDED.created_by_moderator_id,
          reason = EXCLUDED.reason
      `;
      await tx.$executeRaw`
        UPDATE road_event_moderation_cases SET state = 'AUTHOR_RESTRICTED',
          decision_at = ${now}, moderator_telegram_id = ${moderatorId},
          restriction_hours = ${action.hours}, updated_at = ${now}
        WHERE road_event_id = ${action.eventId}::uuid AND state = 'PENDING_REVIEW'
      `;
      await tx.$executeRaw`
        INSERT INTO road_event_moderation_audit
          (id, road_event_id, moderator_telegram_id, decision, restriction_hours, telegram_update_id)
        VALUES (${randomUUID()}::uuid, ${action.eventId}::uuid, ${moderatorId}, 'AUTHOR_RESTRICTED', ${action.hours}, ${BigInt(updateId)})
        ON CONFLICT (telegram_update_id) DO NOTHING
      `;
      return { status: 'RESTRICTED', event };
    });
  }

  private async updateModerationMessage(
    message: TelegramMessageRef,
    action: ModerationCallbackAction,
    outcome: CallbackOutcome,
  ): Promise<void> {
    if (
      outcome.status === 'CHOOSE_RESTRICTION' &&
      action.kind === 'CHOOSE_RESTRICTION'
    ) {
      const keyboard = this.restrictionHours.map((hours) => [
        {
          text: this.durationLabel(hours),
          callback_data: `ban:${action.eventId}:${hours}`,
        },
      ]);
      await this.safeApiCall('editMessageReplyMarkup', {
        chat_id: message.chatId,
        message_id: message.messageId,
        reply_markup: { inline_keyboard: keyboard },
      });
      return;
    }
    if (
      !['RESTORED', 'RESTRICTED', 'EXPIRED', 'AUTHOR_UNAVAILABLE'].includes(
        outcome.status,
      )
    )
      return;

    const suffix =
      outcome.status === 'RESTORED'
        ? 'Статус рассмотрения: метка восстановлена.'
        : outcome.status === 'RESTRICTED'
          ? `Статус рассмотрения: автор ограничен на ${action.kind === 'RESTRICT' ? this.durationLabel(action.hours) : ''}.`
          : outcome.status === 'AUTHOR_UNAVAILABLE'
            ? 'Статус рассмотрения: ограничение невозможно — автор не связан с identity.'
            : 'Статус рассмотрения: событие истекло и осталось завершённым.';
    await this.safeApiCall('editMessageText', {
      chat_id: message.chatId,
      message_id: message.messageId,
      text: `${message.text}\n\n${suffix}`.slice(0, 4_000),
      reply_markup: { inline_keyboard: [] },
    });
  }

  private callbackMessage(
    callback: Record<string, unknown>,
  ): TelegramMessageRef | null {
    const message = asRecord(callback.message);
    const chat = asRecord(message?.chat);
    if (!chat || !message || typeof message.message_id !== 'number')
      return null;
    return {
      chatId: chat.id as string | number,
      messageId: message.message_id,
      text: typeof message.text === 'string' ? message.text : 'Жалоба OnMap',
    };
  }

  private callbackStatusText(status: CallbackOutcome['status']): string {
    const text: Record<CallbackOutcome['status'], string> = {
      DUPLICATE: 'Действие уже обработано',
      INVALID: 'Неизвестное действие',
      NO_CASE: 'Дело не найдено',
      ALREADY_DECIDED: 'Решение уже принято',
      RESTORED: 'Метка восстановлена',
      RESTRICTED: 'Ограничение установлено',
      EXPIRED: 'Событие истекло, восстановление невозможно',
      AUTHOR_UNAVAILABLE: 'Identity автора недоступна',
      CHOOSE_RESTRICTION: 'Выберите срок ограничения',
    };
    return text[status];
  }

  private async sendPendingQueue(): Promise<void> {
    const rows = await this.prisma.$queryRaw<
      readonly {
        id: string;
        type: string;
        createdAt: Date | string;
        reports: number;
      }[]
    >`
      SELECT event.id::text AS id, event.type::text AS type,
        event.created_at AS "createdAt", COUNT(report.id)::int AS reports
      FROM road_event_moderation_cases moderation
      JOIN road_events event ON event.id = moderation.road_event_id
      JOIN road_event_reports report ON report.road_event_id = event.id
      WHERE moderation.state = 'PENDING_REVIEW'
      GROUP BY event.id
      ORDER BY MIN(moderation.created_at) ASC LIMIT 20
    `;
    const text =
      rows.length === 0
        ? 'Очередь жалоб пуста.'
        : `Открытые дела (${rows.length}):\n${rows
            .map(
              (row) =>
                `• ${row.id} — ${row.type}, ${row.reports} жалоб, ${new Date(row.createdAt).toLocaleString('ru-RU')}`,
            )
            .join('\n')}`;
    await this.safeApiCall('sendMessage', {
      chat_id: this.ownerChatId,
      text: text.slice(0, 4_000),
    });
  }

  private async processOneOutbox(): Promise<void> {
    if (!this.active || this.stopped || this.outboxRunning) return;
    this.outboxRunning = true;
    let claimedItem: ClaimedOutbox | undefined;
    try {
      const claimed = await this.prisma.$transaction(async (tx) => {
        return tx.$queryRaw<ClaimedOutbox[]>`
          WITH candidate AS (
            SELECT id FROM telegram_moderation_outbox
            WHERE (
              (status = 'PENDING' AND next_attempt_at <= NOW()) OR
              (status = 'PROCESSING' AND claimed_at < NOW() - INTERVAL '2 minutes')
            )
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED LIMIT 1
          )
          UPDATE telegram_moderation_outbox outbox
          SET status = 'PROCESSING', claimed_at = NOW(), attempts = attempts + 1
          FROM candidate WHERE outbox.id = candidate.id
          RETURNING outbox.id::text AS id, outbox.road_event_id::text AS "roadEventId",
            outbox.attempts AS attempts
        `;
      });
      claimedItem = claimed[0];
      if (!claimedItem) return;
      const item = claimedItem;
      const eventRows = await this.prisma.$queryRaw<
        readonly {
          id: string;
          type: string;
          createdAt: Date | string;
          authorId: string | null;
          status: string;
        }[]
      >`
        SELECT id::text AS id, type::text AS type, created_at AS "createdAt",
          created_by_installation_id AS "authorId", status::text AS status
        FROM road_events WHERE id = ${item.roadEventId}::uuid
      `;
      const event = eventRows[0];
      if (!event || event.status !== 'HIDDEN_PENDING_REVIEW') {
        await this.prisma.$executeRaw`
          UPDATE telegram_moderation_outbox SET status = 'SENT', sent_at = NOW(), claimed_at = NULL
          WHERE id = ${item.id}::uuid
        `;
        return;
      }
      const summaries = await this.prisma.$queryRaw<
        readonly { reason: string; count: number }[]
      >`
        SELECT report.reason, COUNT(*)::int AS count
        FROM road_event_reports report
        LEFT JOIN actor_restrictions restriction
          ON restriction.actor_id = report.reporter_actor_id
          AND restriction.blocked_until > NOW()
        WHERE report.road_event_id = ${event.id}::uuid
          AND restriction.actor_id IS NULL
        GROUP BY report.reason ORDER BY count DESC
      `;
      const total = summaries.reduce(
        (sum, entry) => sum + Number(entry.count),
        0,
      );
      const reasonLines = summaries.map(
        (entry) =>
          `• ${REPORT_REASON_LABELS[entry.reason] ?? 'Другая причина'}: ${entry.count}`,
      );
      const text = [
        'Метка OnMap скрыта после жалоб',
        `Дело: ${item.id}`,
        `ID: ${event.id}`,
        `Тип: ${event.type}`,
        `Создано: ${new Date(event.createdAt).toISOString()}`,
        `Уникальных жалоб: ${total}`,
        `Причины:\n${reasonLines.join('\n') || '—'}`,
        `Identity автора: ${event.authorId ?? 'не указана'}`,
        'Статус рассмотрения: ожидает решения',
      ].join('\n');
      const keyboard: Array<Array<{ text: string; callback_data: string }>> = [
        [{ text: 'Восстановить метку', callback_data: `restore:${event.id}` }],
      ];
      if (event.authorId) {
        keyboard.push([
          { text: 'Ограничить автора', callback_data: `restrict:${event.id}` },
        ]);
      }
      const sent = await this.callApi<{ message_id?: number }>('sendMessage', {
        chat_id: this.ownerChatId,
        text: text.slice(0, 4_000),
        reply_markup: { inline_keyboard: keyboard },
      });
      await this.prisma.$executeRaw`
        UPDATE telegram_moderation_outbox SET status = 'SENT', sent_at = NOW(),
          claimed_at = NULL, telegram_message_id = ${String(sent.message_id ?? '')}, last_error_code = NULL
        WHERE id = ${item.id}::uuid
      `;
    } catch (error) {
      const safeCode =
        error instanceof Error &&
        /^BOT_(?:HTTP_\d+|API_\d+|API_FAILED|NETWORK_ERROR|TIMEOUT|INVALID_RESPONSE)$/.test(
          error.message,
        )
          ? error.message
          : 'BOT_DELIVERY_FAILED';
      try {
        if (claimedItem) {
          const backoff = Math.min(
            TELEGRAM_MODERATION_CONFIG.outboxRetryBaseMs *
              2 ** Math.min(claimedItem.attempts, 8),
            TELEGRAM_MODERATION_CONFIG.outboxRetryMaxMs,
          );
          await this.prisma.$executeRaw`
            UPDATE telegram_moderation_outbox SET status = 'PENDING', claimed_at = NULL,
              next_attempt_at = NOW() + ${backoff} * INTERVAL '1 millisecond', last_error_code = ${safeCode}
            WHERE id = ${claimedItem.id}::uuid AND status = 'PROCESSING'
          `;
        }
      } catch {
        this.logger.warn('Telegram moderation outbox retry scheduling failed');
      }
    } finally {
      this.outboxRunning = false;
    }
  }

  private toRealtimeEvent(event: ModerationEventRow): RoadEventRealtimePayload {
    return {
      id: event.id,
      source: event.source,
      cityId: event.cityId,
      type: event.type as RoadEventRealtimePayload['type'],
      status: event.status as RoadEventRealtimePayload['status'],
      title: event.title,
      ...(event.description ? { description: event.description } : {}),
      coordinate: [Number(event.longitude), Number(event.latitude)],
      confirmationCount: Number(event.confirmationCount),
      rejectionCount: Number(event.rejectionCount),
      confidence: Number(event.confidence),
      confidencePercent: Math.round(Number(event.confidence) * 100),
      createdAt: new Date(event.createdAt).toISOString(),
      expiresAt: new Date(event.expiresAt).toISOString(),
      ...(event.source === 'TELEGRAM'
        ? {
            geometry: event.geometry ?? {
              type: 'Point' as const,
              coordinates: [
                Number(event.longitude),
                Number(event.latitude),
              ] as [number, number],
            },
            locationPrecision: (event.locationPrecision ??
              'EXACT') as RoadEventRealtimePayload['locationPrecision'],
            ...(event.locationLabel
              ? { locationLabel: event.locationLabel }
              : {}),
            ...(event.sourceText
              ? { sourceText: sanitizeTelegramSourceText(event.sourceText) }
              : {}),
          }
        : {}),
      ...(event.lastConfirmedAt
        ? { lastConfirmedAt: new Date(event.lastConfirmedAt).toISOString() }
        : {}),
    };
  }

  private durationLabel(hours: number): string {
    if (hours % 24 === 0) return `${hours / 24} дн.`;
    return `${hours} ч.`;
  }

  private async safeApiCall(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.callApi(method, payload);
    } catch {
      this.logger.warn('Telegram moderation action response failed');
    }
  }

  private async callApi<T = unknown>(
    method: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(
        `https://api.telegram.org/bot${this.token}/${method}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal:
            signal ??
            AbortSignal.timeout(TELEGRAM_MODERATION_CONFIG.requestTimeoutMs),
        },
      );
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      throw new Error(
        name === 'TimeoutError' ? 'BOT_TIMEOUT' : 'BOT_NETWORK_ERROR',
      );
    }
    if (!response.ok) throw new Error(`BOT_HTTP_${response.status}`);
    let data: TelegramApiResult<T>;
    try {
      data = (await response.json()) as TelegramApiResult<T>;
    } catch {
      throw new Error('BOT_INVALID_RESPONSE');
    }
    if (data.ok !== true) {
      const code = data.error_code;
      if (
        typeof code === 'number' &&
        Number.isInteger(code) &&
        code >= 100 &&
        code <= 599
      )
        throw new Error(`BOT_API_${code}`);
      throw new Error('BOT_API_FAILED');
    }
    return data.result as T;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
