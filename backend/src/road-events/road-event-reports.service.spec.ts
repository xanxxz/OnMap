jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./realtime/road-events.gateway', () => ({
  RoadEventsGateway: class {},
}));

import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { RoadEventsGateway } from './realtime/road-events.gateway';
import { RoadEventReportsService } from './road-event-reports.service';

const EVENT_ID = '00000000-0000-4000-8000-000000000123';
const AUTHOR_ID = '00000000-0000-4000-8000-000000000001';
const REPORTER_ID = '00000000-0000-4000-8000-000000000002';

const setup = (
  options: { duplicate?: boolean; total?: number; own?: boolean } = {},
) => {
  let eventStatus = 'ACTIVE';
  let hiddenTransitions = 0;
  const queryValues: unknown[][] = [];
  const executeValues: unknown[][] = [];
  const executeStatements: string[] = [];
  const executeRaw = jest.fn((...args: unknown[]) => {
    const strings = args[0] as TemplateStringsArray;
    executeValues.push(args.slice(1));
    executeStatements.push(strings.join(' '));
    if (strings.join(' ').includes('UPDATE road_events')) {
      if (eventStatus !== 'ACTIVE') return 0;
      eventStatus = 'HIDDEN_PENDING_REVIEW';
      hiddenTransitions += 1;
    }
    return 1;
  });
  const queryRaw = jest.fn((...args: unknown[]) => {
    const strings = args[0] as TemplateStringsArray;
    queryValues.push(args.slice(1));
    const sql = strings.join(' ');
    if (sql.includes('FROM road_events') && sql.includes('FOR UPDATE')) {
      return [
        {
          id: EVENT_ID,
          cityId: 'balakovo',
          type: 'ACCIDENT',
          status: eventStatus,
          expiresAt: new Date(Date.now() + 60_000),
          createdByActorId: options.own ? REPORTER_ID : AUTHOR_ID,
        },
      ];
    }
    if (sql.includes('COUNT(*)') && sql.includes("INTERVAL '1 hour'"))
      return [{ count: 0 }];
    if (sql.includes('COUNT(DISTINCT report.reporter_actor_id)'))
      return [{ count: options.total ?? 1 }];
    if (
      sql.includes('FROM road_event_reports') &&
      sql.includes('reporter_actor_id')
    ) {
      return options.duplicate ? [{ id: 'previous-report' }] : [];
    }
    if (sql.includes('UPDATE road_events') && sql.includes('RETURNING')) {
      if (eventStatus !== 'ACTIVE') return [];
      eventStatus = 'HIDDEN_PENDING_REVIEW';
      hiddenTransitions += 1;
      return [{ id: EVENT_ID }];
    }
    return [];
  });
  const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const prisma = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const gateway = { broadcastHidden: jest.fn() };
  return {
    service: new RoadEventReportsService(
      prisma as unknown as PrismaService,
      gateway as unknown as RoadEventsGateway,
    ),
    prisma,
    gateway,
    queryValues,
    executeValues,
    executeStatements,
    get hiddenTransitions() {
      return hiddenTransitions;
    },
    get eventStatus() {
      return eventStatus;
    },
  };
};

describe('RoadEventReportsService', () => {
  it('counts one report per identity and makes repeated submissions idempotent', async () => {
    const { service, gateway, executeStatements } = setup({
      duplicate: true,
      total: 10,
    });
    await expect(
      service.report(EVENT_ID, REPORTER_ID, 'DUPLICATE'),
    ).resolves.toEqual({
      accepted: true,
      duplicate: true,
      hidden: false,
    });
    expect(
      executeStatements.some((sql) => sql.includes('pg_advisory_xact_lock')),
    ).toBe(true);
    expect(executeStatements.some((sql) => sql.includes('INSERT INTO'))).toBe(
      false,
    );
    expect(gateway.broadcastHidden).not.toHaveBeenCalled();
  });

  it('does not hide below ten unique identities', async () => {
    const { service, gateway } = setup({ total: 9 });
    await expect(
      service.report(EVENT_ID, REPORTER_ID, 'WRONG_TYPE'),
    ).resolves.toMatchObject({
      hidden: false,
      duplicate: false,
    });
    expect(gateway.broadcastHidden).not.toHaveBeenCalled();
  });

  it('hides at ten unique reports and creates notification/outbox in the same transaction', async () => {
    const { service, gateway, executeStatements } = setup({ total: 10 });
    await expect(
      service.report(EVENT_ID, REPORTER_ID, 'WRONG_LOCATION'),
    ).resolves.toMatchObject({
      hidden: true,
    });
    expect(gateway.broadcastHidden).toHaveBeenCalledTimes(1);
    expect(
      executeStatements.some((sql) =>
        sql.includes('road_event_author_notices'),
      ),
    ).toBe(true);
    expect(
      executeStatements.some((sql) =>
        sql.includes('telegram_moderation_outbox'),
      ),
    ).toBe(true);
  });

  it('does not allow an event author to report their own event', async () => {
    const { service, executeStatements } = setup({ own: true });
    await expect(
      service.report(EVENT_ID, REPORTER_ID, 'OTHER_ABUSE'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      executeStatements.some((sql) => sql.includes('pg_advisory_xact_lock')),
    ).toBe(true);
    expect(executeStatements.some((sql) => sql.includes('INSERT INTO'))).toBe(
      false,
    );
  });

  it('broadcasts only one hide transition under concurrent threshold crossings', async () => {
    const state = setup({ total: 10 });
    await Promise.all([
      state.service.report(EVENT_ID, REPORTER_ID, 'DUPLICATE'),
      state.service.report(
        EVENT_ID,
        '00000000-0000-4000-8000-000000000003',
        'WRONG_TYPE',
      ),
    ]);
    expect(state.hiddenTransitions).toBe(1);
    expect(state.gateway.broadcastHidden).toHaveBeenCalledTimes(1);
  });

  it('returns author notices only through the actor-scoped query and supports acknowledgement', async () => {
    const { service, queryValues, executeValues } = setup();
    await service.getAuthorNotices(AUTHOR_ID);
    await service.acknowledgeAuthorNotice(
      '00000000-0000-4000-8000-000000000456',
      AUTHOR_ID,
    );
    expect(queryValues.flat()).toContain(AUTHOR_ID);
    expect(executeValues.flat()).toContain(AUTHOR_ID);
  });
});
