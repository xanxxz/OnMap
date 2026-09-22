jest.mock('../../../database/prisma.service', () => ({
  PrismaService: class {},
}));

import type { PrismaService } from '../../../database/prisma.service';
import { BALAKOVO_CITY_CONFIG } from '../../../cities/balakovo/balakovo.config';
import * as cityRegistry from '../../../cities/city.registry';
import type { NormalizedTelegramEvent } from '../ingestion/telegram-ingestion.types';
import { TELEGRAM_EVENT_TTL_MS } from '../../../road-events/road-events.constants';

import { TelegramIngestionPersistenceService } from './telegram-ingestion-persistence.service';

interface FakeState {
  appliedRoadEventId?: string | null;
  appliedSourceTimestamp?: Date | string;
  appliedDecision?: string;
  appliedOutcome?: string;
  activeCanonical?: readonly {
    id: string;
    status: 'ACTIVE' | 'STALE';
    locationPrecision?: NormalizedTelegramEvent['locationPrecision'];
    createdAt?: Date | string;
  }[];
  activeCoordinates?: readonly {
    id: string;
    status: 'ACTIVE' | 'STALE';
    locationPrecision?: NormalizedTelegramEvent['locationPrecision'];
    createdAt?: Date | string;
  }[];
  resolvedCanonical?: readonly { id: string; status: 'RESOLVED' }[];
  resolvedCoordinates?: readonly { id: string; status: 'RESOLVED' }[];
  failMapping?: boolean;
}

const normalizedEvent = (
  overrides: Partial<NormalizedTelegramEvent> = {},
): NormalizedTelegramEvent => ({
  source: 'TELEGRAM',
  cityId: 'balakovo',
  telegramMessageId: 'telegram:-1001:101',
  externalId: 'telegram:-1001:101',
  sourceChatId: '-1001',
  timestamp: '2026-08-31T08:00:00.000Z',
  eventType: 'ACCIDENT',
  intent: 'REPORT',
  state: 'ACTIVE',
  sourceText: 'авария на комарова',
  locationInput: 'Комарова',
  canonicalLocationId: 'komarova',
  canonicalLocationTitle: 'Улица Комарова',
  latitude: 52.02,
  longitude: 47.8,
  geometry: { type: 'Point', coordinates: [47.8, 52.02] },
  locationPrecision: 'LANDMARK',
  geometryProvider: null,
  geometryStatus: null,
  locationConfidence: 0.99,
  parserConfidence: 0.86,
  contextUsed: false,
  replyContextUsed: false,
  resolverStatus: 'RESOLVED',
  decision: 'CREATE',
  reason: 'READY_TO_CREATE',
  ...overrides,
});

const sqlText = (template: unknown): string =>
  Array.isArray(template) ? template.join(' ') : String(template);

const setup = (initial: FakeState = {}) => {
  const state: FakeState = { ...initial };
  const queryRaw = jest.fn(
    (template: unknown, ...values: readonly unknown[]) => {
      const sql = sqlText(template);

      if (
        sql.includes('FROM telegram_road_event_messages') &&
        sql.includes('external_message_id') &&
        sql.includes('LIMIT 1')
      ) {
        return Promise.resolve(
          state.appliedRoadEventId === undefined
            ? []
            : [
                {
                  roadEventId: state.appliedRoadEventId,
                  sourceTimestamp:
                    state.appliedSourceTimestamp ?? '2026-08-31T08:00:00.000Z',
                  appliedDecision: state.appliedDecision ?? 'CREATE',
                  outcome: state.appliedOutcome ?? 'CREATED',
                },
              ],
        );
      }

      if (sql.includes('INSERT INTO road_events')) {
        return Promise.resolve([{ id: 'created-event' }]);
      }

      if (sql.includes('UPDATE road_events')) {
        return Promise.resolve(
          state.appliedRoadEventId === undefined ||
            state.appliedRoadEventId === null
            ? []
            : [{ id: state.appliedRoadEventId }],
        );
      }

      const resolved = values.includes('RESOLVED');

      if (sql.includes('EXISTS (')) {
        const rows = resolved
          ? (state.resolvedCanonical ?? [])
          : (state.activeCanonical ?? []);

        return Promise.resolve(
          rows.map((row) => ({
            ...row,
            createdAt:
              'createdAt' in row && row.createdAt
                ? row.createdAt
                : '2026-08-31T08:00:00.000Z',
          })),
        );
      }

      if (sql.includes('WITH candidate_location')) {
        const rows = resolved
          ? (state.resolvedCoordinates ?? [])
          : (state.activeCoordinates ?? []);

        return Promise.resolve(
          rows.map((row) => ({
            ...row,
            createdAt:
              'createdAt' in row && row.createdAt
                ? row.createdAt
                : '2026-08-31T08:00:00.000Z',
          })),
        );
      }

      return Promise.resolve([]);
    },
  );
  const executeRaw = jest.fn(
    (template: unknown, ...values: readonly unknown[]) => {
      const sql = sqlText(template);

      if (sql.includes('INSERT INTO telegram_road_event_messages')) {
        if (state.failMapping) {
          return Promise.reject(new Error('mapping write failed'));
        }

        const roadEventId = values.find(
          (value) =>
            typeof value === 'string' &&
            (value === 'created-event' || value.startsWith('event-')),
        );
        state.appliedRoadEventId =
          typeof roadEventId === 'string' ? roadEventId : null;
        state.appliedSourceTimestamp = values.find(
          (value): value is Date => value instanceof Date,
        );
      }

      if (sql.includes('UPDATE telegram_road_event_messages')) {
        state.appliedSourceTimestamp = values.find(
          (value): value is Date => value instanceof Date,
        );
        state.appliedDecision = values.find(
          (value) => value === 'UPDATE' || value === 'RESOLVE',
        );
      }

      return Promise.resolve(1);
    },
  );
  const transaction = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  let transactionQueue = Promise.resolve<unknown>(undefined);
  const transactionMock = jest.fn(
    (callback: (client: typeof transaction) => Promise<unknown>) => {
      const result = transactionQueue.then(() => callback(transaction));
      transactionQueue = result.catch(() => undefined);
      return result;
    },
  );
  const prisma = {
    $queryRaw: queryRaw,
    $transaction: transactionMock,
  } as unknown as PrismaService;
  const service = new TelegramIngestionPersistenceService(prisma);

  return { service, state, queryRaw, executeRaw, transactionMock };
};

describe('TelegramIngestionPersistenceService', () => {
  it('creates an ACTIVE Telegram RoadEvent for a CREATE decision', async () => {
    const { service, queryRaw } = setup();

    await expect(service.apply(normalizedEvent())).resolves.toEqual({
      status: 'CREATED',
      roadEventId: 'created-event',
    });

    const insert = queryRaw.mock.calls.find(([template]) =>
      sqlText(template).includes('INSERT INTO road_events'),
    );
    expect(sqlText(insert?.[0])).toContain('\'ACTIVE\'::"RoadEventStatus"');
    expect(sqlText(insert?.[0])).toContain('\'TELEGRAM\'::"RoadEventSource"');
    expect(insert?.slice(1)).toContainEqual(
      new Date(
        Date.parse('2026-08-31T08:00:00.000Z') +
          TELEGRAM_EVENT_TTL_MS.ACCIDENT!,
      ),
    );
  });

  it('persists sourceText, location precision and geometry for Telegram CREATE', async () => {
    const { service, queryRaw } = setup();

    await service.apply(
      normalizedEvent({
        sourceText: 'Комарова притерлись',
        locationPrecision: 'STREET',
        geometry: {
          type: 'LineString',
          coordinates: [
            [47.79, 52.01],
            [47.8, 52.02],
          ],
        },
      }),
    );

    const insert = queryRaw.mock.calls.find(([template]) =>
      sqlText(template).includes('INSERT INTO road_events'),
    );
    const sql = sqlText(insert?.[0]);

    expect(sql).toContain('ST_GeomFromGeoJSON');
    expect(sql).toContain('location_precision');
    expect(sql).toContain('source_text');
    expect(insert?.slice(1)).toContain('Комарова притерлись');
    expect(insert?.slice(1)).toContain('STREET');
  });

  it('refines STREET geometry to LANDMARK on a more precise UPDATE', async () => {
    const { service, queryRaw } = setup({
      activeCanonical: [
        { id: 'event-1', status: 'ACTIVE', locationPrecision: 'STREET' },
      ],
    });

    await service.apply(
      normalizedEvent({
        intent: 'UPDATE',
        decision: 'UPDATE',
        reason: 'UPDATE_CANDIDATE',
        locationPrecision: 'LANDMARK',
      }),
    );

    expect(
      queryRaw.mock.calls.some(([template]) =>
        sqlText(template).includes('ST_GeomFromGeoJSON'),
      ),
    ).toBe(true);
  });

  it('does not replace a more precise location with STREET geometry', async () => {
    const { service, queryRaw } = setup({
      activeCanonical: [
        { id: 'event-1', status: 'ACTIVE', locationPrecision: 'EXACT' },
      ],
    });

    await service.apply(
      normalizedEvent({
        intent: 'UPDATE',
        decision: 'UPDATE',
        reason: 'UPDATE_CANDIDATE',
        locationPrecision: 'STREET',
        geometry: {
          type: 'LineString',
          coordinates: [
            [47.79, 52.01],
            [47.8, 52.02],
          ],
        },
      }),
    );

    const eventUpdates = queryRaw.mock.calls.filter(([template]) =>
      sqlText(template).includes('UPDATE road_events'),
    );
    expect(
      eventUpdates.some(([template]) =>
        sqlText(template).includes('ST_GeomFromGeoJSON'),
      ),
    ).toBe(false);
  });

  it('returns ALREADY_APPLIED for the same persisted message', async () => {
    const { service, transactionMock } = setup({
      appliedRoadEventId: 'event-1',
    });

    await expect(service.apply(normalizedEvent())).resolves.toEqual({
      status: 'NOOP',
      reason: 'ALREADY_APPLIED',
      roadEventId: 'event-1',
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('treats the same edited version as ALREADY_APPLIED', async () => {
    const { service } = setup({
      appliedRoadEventId: 'event-1',
      appliedSourceTimestamp: '2026-08-31T08:10:00.000Z',
    });

    await expect(
      service.apply(
        normalizedEvent({ messageVersion: '2026-08-31T08:10:00.000Z' }),
      ),
    ).resolves.toMatchObject({
      status: 'NOOP',
      reason: 'ALREADY_APPLIED',
      roadEventId: 'event-1',
    });
  });

  it('treats a newer edited REPORT as an UPDATE of its mapped RoadEvent', async () => {
    const { service, queryRaw, executeRaw } = setup({
      appliedRoadEventId: 'event-1',
      appliedSourceTimestamp: '2026-08-31T08:00:00.000Z',
    });

    await expect(
      service.apply(
        normalizedEvent({ messageVersion: '2026-08-31T08:10:00.000Z' }),
      ),
    ).resolves.toEqual({ status: 'UPDATED', roadEventId: 'event-1' });
    expect(
      queryRaw.mock.calls.filter(([template]) =>
        sqlText(template).includes('INSERT INTO road_events'),
      ),
    ).toHaveLength(0);
    expect(
      executeRaw.mock.calls.some(([template]) =>
        sqlText(template).includes('UPDATE telegram_road_event_messages'),
      ),
    ).toBe(true);
    const eventUpdate = queryRaw.mock.calls.find(([template]) =>
      sqlText(template).includes('UPDATE road_events'),
    );
    expect(eventUpdate?.slice(1)).toContainEqual(
      new Date(
        Date.parse('2026-08-31T08:10:00.000Z') +
          TELEGRAM_EVENT_TTL_MS.ACCIDENT!,
      ),
    );
  });

  it('allows a newer edited version to resolve its mapped RoadEvent', async () => {
    const { service } = setup({
      appliedRoadEventId: 'event-1',
      appliedSourceTimestamp: '2026-08-31T08:00:00.000Z',
    });

    await expect(
      service.apply(
        normalizedEvent({
          messageVersion: '2026-08-31T08:15:00.000Z',
          decision: 'RESOLVE',
          intent: 'RESOLUTION',
          state: 'RESOLVED',
          reason: 'RESOLVE_CANDIDATE',
        }),
      ),
    ).resolves.toEqual({ status: 'RESOLVED', roadEventId: 'event-1' });
  });

  it('does not replay an older message version', async () => {
    const { service, queryRaw } = setup({
      appliedRoadEventId: 'event-1',
      appliedSourceTimestamp: '2026-08-31T08:10:00.000Z',
    });

    await expect(
      service.apply(
        normalizedEvent({ messageVersion: '2026-08-31T08:05:00.000Z' }),
      ),
    ).resolves.toMatchObject({ status: 'NOOP', reason: 'ALREADY_APPLIED' });
    expect(
      queryRaw.mock.calls.filter(([template]) =>
        sqlText(template).includes('UPDATE road_events'),
      ),
    ).toHaveLength(0);
  });

  it('deduplicates a different message at the same canonical location', async () => {
    const { service } = setup({
      activeCanonical: [{ id: 'event-1', status: 'ACTIVE' }],
    });

    await expect(service.apply(normalizedEvent())).resolves.toEqual({
      status: 'NOOP',
      reason: 'DUPLICATE_ACTIVE_EVENT',
      roadEventId: 'event-1',
    });
  });

  it('falls back to spatial semantic deduplication', async () => {
    const { service } = setup({
      activeCoordinates: [{ id: 'event-2', status: 'ACTIVE' }],
    });

    await expect(
      service.apply(normalizedEvent({ canonicalLocationId: null })),
    ).resolves.toMatchObject({
      status: 'NOOP',
      reason: 'DUPLICATE_ACTIVE_EVENT',
      roadEventId: 'event-2',
    });
  });

  it('limits semantic matching to TELEGRAM-owned events', async () => {
    const { service, queryRaw } = setup();

    await service.apply(normalizedEvent());

    const targetQueries = queryRaw.mock.calls
      .map(([template]) => sqlText(template))
      .filter((sql) => sql.includes('FROM road_events road_event'));
    expect(targetQueries).not.toHaveLength(0);
    expect(
      targetQueries.every((sql) =>
        sql.includes("road_event.source = 'TELEGRAM'"),
      ),
    ).toBe(true);
  });

  it('passes a synthetic city id into create and dedup SQL', async () => {
    const testCity = {
      ...BALAKOVO_CITY_CONFIG,
      id: 'test-city',
      name: 'Тестовый город',
    };
    const citySpy = jest
      .spyOn(cityRegistry, 'getCityConfig')
      .mockImplementation((cityId) =>
        cityId === testCity.id ? testCity : BALAKOVO_CITY_CONFIG,
      );

    try {
      const { service, queryRaw } = setup();

      await service.apply(normalizedEvent({ cityId: testCity.id }));

      const relevantCalls = queryRaw.mock.calls.filter(([template]) => {
        const sql = sqlText(template);

        return (
          sql.includes('INSERT INTO road_events') ||
          sql.includes('FROM road_events road_event')
        );
      });
      expect(relevantCalls).not.toHaveLength(0);
      expect(
        relevantCalls.every((call) => call.slice(1).includes(testCity.id)),
      ).toBe(true);
    } finally {
      citySpy.mockRestore();
    }
  });

  it('limits RESOLVE target lookup to the trusted synthetic city', async () => {
    const testCity = {
      ...BALAKOVO_CITY_CONFIG,
      id: 'city-a',
      name: 'Город A',
    };
    const citySpy = jest
      .spyOn(cityRegistry, 'getCityConfig')
      .mockImplementation((cityId) =>
        cityId === testCity.id ? testCity : BALAKOVO_CITY_CONFIG,
      );

    try {
      const { service, queryRaw } = setup({
        activeCanonical: [{ id: 'city-a-event', status: 'ACTIVE' }],
      });

      await service.apply(
        normalizedEvent({
          cityId: testCity.id,
          decision: 'RESOLVE',
          intent: 'RESOLUTION',
          state: 'RESOLVED',
          reason: 'RESOLVE_CANDIDATE',
        }),
      );

      const targetCall = queryRaw.mock.calls.find(([template]) =>
        sqlText(template).includes('FROM road_events road_event'),
      );
      expect(sqlText(targetCall?.[0])).toContain('road_event.city_id =');
      expect(targetCall?.slice(1)).toContain(testCity.id);
      expect(targetCall?.slice(1)).not.toContain('city-b');
    } finally {
      citySpy.mockRestore();
    }
  });

  it('resolves one active matching Telegram event', async () => {
    const { service, executeRaw } = setup({
      activeCanonical: [{ id: 'event-1', status: 'ACTIVE' }],
    });

    await expect(
      service.apply(
        normalizedEvent({
          decision: 'RESOLVE',
          intent: 'RESOLUTION',
          state: 'RESOLVED',
          reason: 'RESOLVE_CANDIDATE',
        }),
      ),
    ).resolves.toEqual({ status: 'RESOLVED', roadEventId: 'event-1' });
    expect(
      executeRaw.mock.calls.some(([template]) =>
        sqlText(template).includes("status = 'RESOLVED'"),
      ),
    ).toBe(true);
  });

  it('returns TARGET_NOT_FOUND when resolve has no target', async () => {
    const { service } = setup();

    await expect(
      service.apply(
        normalizedEvent({
          decision: 'RESOLVE',
          intent: 'RESOLUTION',
          state: 'RESOLVED',
          reason: 'RESOLVE_CANDIDATE',
        }),
      ),
    ).resolves.toEqual({ status: 'NOOP', reason: 'TARGET_NOT_FOUND' });
  });

  it('returns AMBIGUOUS_TARGET for two active resolve matches', async () => {
    const { service } = setup({
      activeCanonical: [
        { id: 'event-1', status: 'ACTIVE' },
        { id: 'event-2', status: 'ACTIVE' },
      ],
    });

    await expect(
      service.apply(
        normalizedEvent({
          decision: 'RESOLVE',
          intent: 'RESOLUTION',
          state: 'RESOLVED',
          reason: 'RESOLVE_CANDIDATE',
        }),
      ),
    ).resolves.toEqual({
      status: 'REVIEW',
      reason: 'AMBIGUOUS_TARGET',
      candidateCount: 2,
    });
  });

  it('returns ALREADY_RESOLVED for one resolved target', async () => {
    const { service } = setup({
      resolvedCanonical: [{ id: 'event-1', status: 'RESOLVED' }],
    });

    await expect(
      service.apply(
        normalizedEvent({
          decision: 'RESOLVE',
          intent: 'RESOLUTION',
          state: 'RESOLVED',
          reason: 'RESOLVE_CANDIDATE',
        }),
      ),
    ).resolves.toEqual({
      status: 'NOOP',
      reason: 'ALREADY_RESOLVED',
      roadEventId: 'event-1',
    });
  });

  it('never updates a USER RoadEvent during resolve', async () => {
    const { service, executeRaw } = setup();

    await service.apply(
      normalizedEvent({
        decision: 'RESOLVE',
        intent: 'RESOLUTION',
        state: 'RESOLVED',
        reason: 'RESOLVE_CANDIDATE',
      }),
    );

    expect(
      executeRaw.mock.calls.some(([template]) =>
        sqlText(template).includes('UPDATE road_events'),
      ),
    ).toBe(false);
  });

  it('uses strict same-type matching for resolve', async () => {
    const { service, queryRaw } = setup();

    await service.apply(
      normalizedEvent({
        decision: 'RESOLVE',
        intent: 'RESOLUTION',
        state: 'RESOLVED',
        reason: 'RESOLVE_CANDIDATE',
      }),
    );

    const targetCall = queryRaw.mock.calls.find(([template]) =>
      sqlText(template).includes('FROM road_events road_event'),
    );
    expect(targetCall?.slice(1)).toContain('ACCIDENT');
    expect(sqlText(targetCall?.[0])).toContain('road_event.type =');
  });

  it('updates only one unambiguous active target', async () => {
    const { service, queryRaw } = setup({
      activeCanonical: [{ id: 'event-1', status: 'ACTIVE' }],
    });

    await expect(
      service.apply(
        normalizedEvent({
          decision: 'UPDATE',
          intent: 'UPDATE',
          reason: 'UPDATE_CANDIDATE',
        }),
      ),
    ).resolves.toEqual({ status: 'UPDATED', roadEventId: 'event-1' });

    const updateSql = queryRaw.mock.calls
      .map(([template]) => sqlText(template))
      .find((sql) => sql.includes('UPDATE road_events'));
    expect(updateSql).toContain('expires_at =');
    expect(updateSql).toContain('updated_at = NOW()');
    expect(updateSql).not.toContain('longitude =');
  });

  it('extends TTL from the latest Telegram message source timestamp', async () => {
    const { service, queryRaw } = setup({
      activeCanonical: [{ id: 'event-1', status: 'ACTIVE' }],
    });
    const timestamp = '2026-08-31T09:00:00.000Z';

    await service.apply(
      normalizedEvent({
        decision: 'UPDATE',
        intent: 'UPDATE',
        timestamp,
        messageVersion: '2026-08-31T09:05:00.000Z',
        reason: 'UPDATE_CANDIDATE',
      }),
    );

    const update = queryRaw.mock.calls.find(([template]) =>
      sqlText(template).includes('UPDATE road_events'),
    );
    expect(update?.slice(1)).toContainEqual(
      new Date(
        Date.parse('2026-08-31T09:05:00.000Z') +
          TELEGRAM_EVENT_TTL_MS.ACCIDENT!,
      ),
    );
  });

  it('reviews an ambiguous update', async () => {
    const { service } = setup({
      activeCanonical: [
        { id: 'event-1', status: 'ACTIVE' },
        { id: 'event-2', status: 'ACTIVE' },
      ],
    });

    await expect(
      service.apply(
        normalizedEvent({
          decision: 'UPDATE',
          intent: 'UPDATE',
          reason: 'UPDATE_CANDIDATE',
        }),
      ),
    ).resolves.toMatchObject({
      status: 'REVIEW',
      reason: 'AMBIGUOUS_TARGET',
    });
  });

  it.each(['REVIEW', 'IGNORE'] as const)(
    '%s never opens a database transaction',
    async (decision) => {
      const { service, transactionMock } = setup();

      await expect(
        service.apply(normalizedEvent({ decision })),
      ).resolves.toEqual({ status: 'NOOP', reason: 'UNSUPPORTED_DECISION' });
      expect(transactionMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { latitude: null },
    { longitude: Number.NaN },
    { latitude: 51.5 },
    { longitude: 49 },
  ])('rejects invalid or outside coordinates: %o', async (coordinates) => {
    const { service, transactionMock } = setup();

    await expect(service.apply(normalizedEvent(coordinates))).resolves.toEqual({
      status: 'NOOP',
      reason: 'INVALID_COORDINATES',
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid source timestamp', async () => {
    const { service, transactionMock } = setup();

    await expect(
      service.apply(normalizedEvent({ timestamp: 'invalid' })),
    ).resolves.toEqual({ status: 'NOOP', reason: 'INVALID_TIMESTAMP' });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('stores source metadata without author PII or raw text', async () => {
    const { service, executeRaw } = setup();
    const event = normalizedEvent();

    await service.apply(event);

    const mappingCall = executeRaw.mock.calls.find(([template]) =>
      sqlText(template).includes('INSERT INTO telegram_road_event_messages'),
    );
    const mappingSql = sqlText(mappingCall?.[0]);
    expect(mappingSql).toContain('source_chat_id');
    expect(mappingSql).toContain('external_message_id');
    expect(mappingSql).toContain('canonical_location_id');
    expect(mappingSql).toContain('source_timestamp');
    expect(mappingSql).not.toContain('author');
    expect(mappingSql).not.toContain('text');
  });

  it('propagates mapping failure so the transaction can roll back', async () => {
    const { service } = setup({ failMapping: true });

    await expect(service.apply(normalizedEvent())).rejects.toThrow(
      'mapping write failed',
    );
  });

  it('serial repeated applies create only one RoadEvent', async () => {
    const { service, queryRaw } = setup();

    const first = await service.apply(normalizedEvent());
    const second = await service.apply(normalizedEvent());

    expect(first.status).toBe('CREATED');
    expect(second).toMatchObject({ status: 'NOOP', reason: 'ALREADY_APPLIED' });
    expect(
      queryRaw.mock.calls.filter(([template]) =>
        sqlText(template).includes('INSERT INTO road_events'),
      ),
    ).toHaveLength(1);
  });

  it('concurrent repeated applies create only one RoadEvent', async () => {
    const { service, queryRaw } = setup();

    const results = await Promise.all([
      service.apply(normalizedEvent()),
      service.apply(normalizedEvent()),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'CREATED',
      'NOOP',
    ]);
    expect(
      queryRaw.mock.calls.filter(([template]) =>
        sqlText(template).includes('INSERT INTO road_events'),
      ),
    ).toHaveLength(1);
  });

  it('maps DPS to a ROAD_PATROL RoadEvent', async () => {
    const { service, queryRaw, transactionMock } = setup();

    await expect(
      service.apply(normalizedEvent({ eventType: 'DPS' })),
    ).resolves.toEqual({
      status: 'CREATED',
      roadEventId: 'created-event',
    });
    const insert = queryRaw.mock.calls.find(([template]) =>
      sqlText(template).includes('INSERT INTO road_events'),
    );
    expect(insert?.slice(1)).toContain('ROAD_PATROL');
    expect(insert?.slice(1)).toContainEqual(
      new Date(
        Date.parse('2026-08-31T08:00:00.000Z') +
          TELEGRAM_EVENT_TTL_MS.ROAD_PATROL!,
      ),
    );
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('extends a nearby active DPS marker instead of creating a duplicate', async () => {
    const { service, queryRaw } = setup({
      activeCanonical: [
        {
          id: 'event-1',
          status: 'ACTIVE',
          locationPrecision: 'LANDMARK',
          createdAt: '2026-08-31T08:00:00.000Z',
        },
      ],
    });

    await expect(
      service.apply(
        normalizedEvent({
          eventType: 'DPS',
          timestamp: '2026-08-31T08:15:00.000Z',
          messageVersion: '2026-08-31T08:15:00.000Z',
        }),
      ),
    ).resolves.toEqual({ status: 'UPDATED', roadEventId: 'event-1' });

    expect(
      queryRaw.mock.calls.filter(([template]) =>
        sqlText(template).includes('INSERT INTO road_events'),
      ),
    ).toHaveLength(0);
    expect(
      queryRaw.mock.calls.some(([template]) =>
        sqlText(template).includes('UPDATE road_events'),
      ),
    ).toBe(true);
  });

  it('reactivates a stale DPS marker after a fresh Telegram report', async () => {
    const { service, queryRaw } = setup({
      activeCanonical: [
        {
          id: 'event-1',
          status: 'STALE',
          locationPrecision: 'LANDMARK',
          createdAt: '2026-08-31T08:00:00.000Z',
        },
      ],
    });

    await expect(
      service.apply(
        normalizedEvent({
          eventType: 'DPS',
          timestamp: '2026-08-31T08:16:00.000Z',
          messageVersion: '2026-08-31T08:16:00.000Z',
        }),
      ),
    ).resolves.toEqual({ status: 'UPDATED', roadEventId: 'event-1' });

    const updateSql = queryRaw.mock.calls
      .map(([template]) => sqlText(template))
      .find((sql) => sql.includes('UPDATE road_events'));

    expect(updateSql).toContain(`THEN 'ACTIVE'::"RoadEventStatus"`);
    expect(updateSql).toContain(`status = 'STALE'::"RoadEventStatus"`);
  });

  it('keeps source timestamp and canonical id in the mapping write', async () => {
    const { service, executeRaw } = setup();
    const event = normalizedEvent();

    await service.apply(event);

    const mappingCall = executeRaw.mock.calls.find(([template]) =>
      sqlText(template).includes('INSERT INTO telegram_road_event_messages'),
    );
    expect(mappingCall?.slice(1)).toEqual(
      expect.arrayContaining([
        event.sourceChatId,
        event.externalId,
        event.canonicalLocationId,
        new Date(event.timestamp),
      ]),
    );
  });
});
