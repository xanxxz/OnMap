jest.mock('../../../database/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('../../../road-events/realtime/road-events.gateway', () => ({
  RoadEventsGateway: class {},
}));

import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../database/prisma.service';
import type { RoadEventsGateway } from '../../../road-events/realtime/road-events.gateway';
import type { PartnerBotService } from '../../../partner-placements/partner-bot.service';
import {
  formatModerationPollingFailure,
  TelegramModerationBotService,
} from './telegram-moderation-bot.service';
import type { ModerationCallbackAction } from './telegram-moderation.constants';

const EVENT_ID = '00000000-0000-4000-8000-000000000001';
const AUTHOR_ID = '00000000-0000-4000-8000-000000000002';
const OWNER_ID = '123456';

const createService = (expiresAt = new Date(Date.now() + 60_000)) => {
  const event = {
    id: EVENT_ID,
    cityId: 'balakovo',
    type: 'ACCIDENT',
    status: 'HIDDEN_PENDING_REVIEW',
    title: 'ДТП',
    description: null,
    longitude: 47.8,
    latitude: 52.02,
    createdAt: new Date(),
    expiresAt,
    createdByActorId: AUTHOR_ID,
    statusBeforeModeration: 'ACTIVE',
    confirmationCount: 1,
    rejectionCount: 0,
    confidence: 0.4,
    lastConfirmedAt: null,
  };
  const queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    if (sql.includes('WITH candidate'))
      return [
        {
          id: '00000000-0000-4000-8000-000000000003',
          roadEventId: EVENT_ID,
          attempts: 1,
        },
      ];
    if (sql.includes('created_by_installation_id AS "authorId"'))
      return [{ ...event, authorId: AUTHOR_ID }];
    if (sql.includes('FROM road_event_reports report'))
      return [{ reason: 'WRONG_TYPE', count: 10 }];
    if (sql.includes('INSERT INTO telegram_moderation_updates'))
      return [{ updateId: 1n }];
    if (sql.includes('FROM road_events') && sql.includes('FOR UPDATE'))
      return [event];
    if (sql.includes('FROM road_event_moderation_cases'))
      return [{ state: 'PENDING_REVIEW' }];
    if (sql.includes('UPDATE road_events') && sql.includes('RETURNING')) {
      return [{ ...event, status: 'ACTIVE', statusBeforeModeration: null }];
    }
    return [];
  });
  const executedSql: string[] = [];
  const executeRaw = jest.fn((...args: unknown[]) => {
    const template = args[0] as TemplateStringsArray | undefined;
    if (template) executedSql.push(template.join(' '));
    return 1;
  });
  const prisma = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: queryRaw,
        $executeRaw: executeRaw,
      }),
    ),
  };
  const config = {
    get: (key: string) =>
      key === 'TELEGRAM_MODERATION_CHAT_ID'
        ? OWNER_ID
        : key === 'TELEGRAM_MODERATION_RESTRICTION_HOURS'
          ? '24,168,720'
          : '',
  };
  const gateway = { broadcastUpdated: jest.fn(), broadcastResolved: jest.fn() };
  const service = new TelegramModerationBotService(
    config as unknown as ConfigService,
    prisma as unknown as PrismaService,
    gateway as unknown as RoadEventsGateway,
    {
      tryAcquire: jest.fn().mockResolvedValue(true),
      release: jest.fn(),
    } as never,
    {
      shouldHandle: jest.fn().mockResolvedValue(false),
      process: jest.fn(),
    } as unknown as PartnerBotService,
  );
  const privateService = service as unknown as {
    active: boolean;
    processUpdate(update: unknown): Promise<void>;
    processOneOutbox(): Promise<void>;
    processCallbackUpdate(
      updateId: number,
      action: ModerationCallbackAction,
      callback: Record<string, unknown>,
    ): Promise<{ status: string; event?: typeof event }>;
  };
  return { service, privateService, prisma, gateway, event, executedSql };
};

describe('TelegramModerationBotService', () => {
  it('keeps provider and database details out of polling diagnostics', () => {
    const databaseError = Object.assign(
      new Error('secret database URL and query payload'),
      { code: 'P2010', meta: { code: '42P01' } },
    );
    expect(formatModerationPollingFailure('CURSOR_QUERY', databaseError)).toBe(
      'stage=CURSOR_QUERY type=DATABASE code=42P01',
    );
    expect(
      formatModerationPollingFailure('GET_UPDATES', new Error('BOT_HTTP_409')),
    ).toBe('stage=GET_UPDATES type=HTTP status=409');
    expect(
      formatModerationPollingFailure('GET_UPDATES', new Error('BOT_API_401')),
    ).toBe('stage=GET_UPDATES type=API_RESPONSE status=401');
    expect(
      formatModerationPollingFailure(
        'GET_UPDATES',
        new Error('bot URL with private token'),
      ),
    ).toBe('stage=GET_UPDATES type=UNKNOWN code=none');
  });

  it('consumes the setup /start update without sending a message', async () => {
    const { privateService } = createService();
    const fetchSpy = jest.spyOn(global, 'fetch');
    await privateService.processUpdate({
      update_id: 2,
      message: {
        text: '/start',
        from: { id: Number(OWNER_ID) },
        chat: { id: Number(OWNER_ID), type: 'private' },
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps the existing owner /queue command on the moderation path', async () => {
    const { privateService, prisma } = createService();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    } as Response);
    await privateService.processUpdate({
      update_id: 3,
      message: {
        text: '/queue',
        from: { id: Number(OWNER_ID) },
        chat: { id: Number(OWNER_ID), type: 'private' },
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('ignores commands and callbacks from another Telegram user', async () => {
    const { privateService, prisma } = createService();
    const fetchSpy = jest.spyOn(global, 'fetch');
    await privateService.processUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-1',
        data: `restore:${EVENT_ID}`,
        from: { id: 999 },
        message: {
          message_id: 10,
          text: 'Case',
          chat: { id: Number(OWNER_ID), type: 'private' },
        },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('restores an unexpired hidden event once and writes an audit decision', async () => {
    const { privateService, executedSql, gateway } = createService();
    const callback = {
      from: { id: Number(OWNER_ID) },
    };
    await expect(
      privateService.processCallbackUpdate(
        42,
        { kind: 'RESTORE', eventId: EVENT_ID },
        callback,
      ),
    ).resolves.toMatchObject({
      status: 'RESTORED',
      event: { status: 'ACTIVE' },
    });
    expect(executedSql.some((sql) => sql.includes("'RESTORED'"))).toBe(true);
    expect(gateway.broadcastUpdated).not.toHaveBeenCalled();
  });

  it('does not restore an expired event and records the expired decision', async () => {
    const { privateService, executedSql } = createService(
      new Date(Date.now() - 1),
    );
    await expect(
      privateService.processCallbackUpdate(
        43,
        { kind: 'RESTORE', eventId: EVENT_ID },
        { from: { id: Number(OWNER_ID) } },
      ),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
    expect(executedSql.some((sql) => sql.includes('resolved_at'))).toBe(true);
  });

  it('restricts only the linked author for a finite configured duration', async () => {
    const { privateService, executedSql } = createService();
    await expect(
      privateService.processCallbackUpdate(
        44,
        { kind: 'RESTRICT', eventId: EVENT_ID, hours: 168 },
        { from: { id: Number(OWNER_ID) } },
      ),
    ).resolves.toMatchObject({ status: 'RESTRICTED' });
    expect(
      executedSql.some((sql) => sql.includes('INSERT INTO actor_restrictions')),
    ).toBe(true);
  });

  it('treats already processed callback updates as idempotent', async () => {
    const { privateService, prisma } = createService();
    prisma.$transaction.mockImplementationOnce(
      (callback: (tx: unknown) => unknown) =>
        callback({
          $queryRaw: jest.fn().mockResolvedValue([]),
          $executeRaw: jest.fn(),
        }),
    );
    await expect(
      privateService.processCallbackUpdate(
        45,
        { kind: 'RESTORE', eventId: EVENT_ID },
        { from: { id: Number(OWNER_ID) } },
      ),
    ).resolves.toEqual({ status: 'DUPLICATE' });
  });

  it('sends one safe outbox notification with a stable case ID', async () => {
    const { privateService } = createService();
    privateService.active = true;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), {
        status: 200,
      }),
    );

    await privateService.processOneOutbox();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBodyText = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof requestBodyText).toBe('string');
    const requestBody = JSON.parse(requestBodyText as string) as {
      text: string;
    };
    expect(requestBody.text).toContain(
      'Дело: 00000000-0000-4000-8000-000000000003',
    );
    expect(requestBody.text).toContain(`ID: ${EVENT_ID}`);
    expect(requestBody.text).not.toContain('sourceText');
    expect(requestBody.text).not.toContain('reporter');
    fetchMock.mockRestore();
  });
});
