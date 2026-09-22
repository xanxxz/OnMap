import type { TelegramLocationResolutionResult } from '../location-resolver/telegram-location-resolver.types';
import type { CityConfig } from '../../../cities/city.types';
import { TelegramMessageParser } from '../parser/telegram-message.parser';
import type { TelegramParserResult } from '../parser/telegram-parser.types';
import type { TelegramMessage } from '../telegram.types';

import { TelegramDryRunIngestionPipeline } from './telegram-dry-run-ingestion.pipeline';
import { TELEGRAM_INGESTION_THRESHOLDS } from './telegram-ingestion.constants';

const message = (text = 'авария на комарова'): TelegramMessage => ({
  externalId: 'message-1',
  source: 'TELEGRAM',
  cityId: 'balakovo',
  chatId: '-1001',
  text,
  publishedAt: '2026-08-31T08:00:00.000Z',
  rawSourceType: 'message',
});

const parserResult = (
  overrides: Partial<TelegramParserResult> = {},
): TelegramParserResult => ({
  matched: true,
  eventType: 'ACCIDENT',
  intent: 'REPORT',
  state: 'ACTIVE',
  locationText: 'Комарова',
  locationAlias: 'komarova',
  locations: [{ text: 'Комарова', alias: 'komarova' }],
  locationResolutionAllowed: true,
  confidence: 0.86,
  matchedTerms: ['авария'],
  contextUsed: false,
  ...overrides,
});

const resolved = (
  overrides: Partial<
    Extract<
      TelegramLocationResolutionResult,
      { status: 'RESOLVED'; source: 'LOCAL' }
    >
  > = {},
): Extract<
  TelegramLocationResolutionResult,
  { status: 'RESOLVED'; source: 'LOCAL' }
> => ({
  status: 'RESOLVED',
  canonicalTitle: 'Комарова',
  normalizedQuery: 'комарова',
  latitude: 52.02,
  longitude: 47.8,
  confidence: 0.9,
  coordinateSource: 'TOMTOM',
  geometry: { type: 'Point', coordinates: [47.8, 52.02] },
  precision: 'LANDMARK',
  geometryProvider: null,
  geometryStatus: null,
  attemptedQueries: ['Комарова'],
  queryAttempts: [],
  rawCandidateCount: 1,
  acceptedCandidateCount: 1,
  source: 'LOCAL',
  localLocationId: 'komarova',
  matchedAlias: 'комарова',
  ...overrides,
});

const notFound = (): TelegramLocationResolutionResult => ({
  status: 'NOT_FOUND',
  normalizedQuery: 'комарова',
  confidence: null,
  attemptedQueries: ['Комарова'],
  queryAttempts: [],
  rawCandidateCount: 0,
  acceptedCandidateCount: 0,
  reason: 'NO_CANDIDATES',
  precision: 'LANDMARK',
  geometryProvider: null,
  geometryStatus: null,
});

const ambiguous = (): TelegramLocationResolutionResult => ({
  status: 'AMBIGUOUS',
  normalizedQuery: 'комарова',
  confidence: 0.68,
  attemptedQueries: ['Комарова'],
  queryAttempts: [],
  rawCandidateCount: 2,
  acceptedCandidateCount: 2,
  candidates: [
    {
      title: 'Комарова 1',
      address: null,
      latitude: 52.02,
      longitude: 47.8,
      confidence: 0.68,
      source: 'TOMTOM',
    },
    {
      title: 'Комарова 2',
      address: null,
      latitude: 52.021,
      longitude: 47.801,
      confidence: 0.67,
      source: 'TOMTOM',
    },
  ],
  precision: 'LANDMARK',
  geometryProvider: null,
  geometryStatus: null,
});

const setup = (
  parsed: TelegramParserResult,
  resolutions: readonly TelegramLocationResolutionResult[] = [resolved()],
) => {
  const parser = { parse: jest.fn().mockReturnValue(parsed) };
  const resolver = {
    resolveParserResult: jest.fn().mockResolvedValue(resolutions),
  };
  const pipeline = new TelegramDryRunIngestionPipeline(parser, resolver);

  return { parser, resolver, pipeline };
};

const setupWithActualParser = (
  resolutions: readonly TelegramLocationResolutionResult[],
) => {
  const resolver = {
    resolveParserResult: jest.fn().mockResolvedValue(resolutions),
  };
  const pipeline = new TelegramDryRunIngestionPipeline(
    new TelegramMessageParser(),
    resolver,
  );

  return { resolver, pipeline };
};

describe('TelegramDryRunIngestionPipeline', () => {
  it('returns CREATE for a good report with a resolved location', async () => {
    const { pipeline } = setup(parserResult());

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'CREATE',
      reason: 'READY_TO_CREATE',
      latitude: 52.02,
      longitude: 47.8,
      canonicalLocationId: 'komarova',
    });
  });

  it('returns REVIEW when a report location is not found', async () => {
    const { pipeline } = setup(parserResult(), [notFound()]);

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'LOCATION_NOT_FOUND',
    });
  });

  it('returns REVIEW when a report location is ambiguous', async () => {
    const { pipeline } = setup(parserResult(), [ambiguous()]);

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'LOCATION_AMBIGUOUS',
    });
  });

  it('always ignores questions without resolving their location', async () => {
    const { pipeline, resolver } = setup(
      parserResult({ intent: 'QUESTION', state: 'UNKNOWN' }),
    );

    const result = await pipeline.process({
      message: message('как комарова?'),
    });

    expect(result.events[0]).toMatchObject({
      decision: 'IGNORE',
      reason: 'QUESTION',
    });
    expect(resolver.resolveParserResult).not.toHaveBeenCalled();
  });

  it('always ignores parser noise without invoking the resolver', async () => {
    const { pipeline, resolver } = setup(
      parserResult({
        matched: false,
        eventType: 'OTHER',
        intent: 'NOISE',
        state: 'UNKNOWN',
        confidence: 0,
        locationText: null,
        locationAlias: null,
        locations: [],
      }),
    );

    const result = await pipeline.process({ message: message('спасибо') });

    expect(result.events[0]).toMatchObject({
      decision: 'IGNORE',
      reason: 'NOISE',
    });
    expect(resolver.resolveParserResult).not.toHaveBeenCalled();
  });

  it('returns RESOLVE for a resolution with a resolved location', async () => {
    const { pipeline } = setup(
      parserResult({ intent: 'RESOLUTION', state: 'RESOLVED' }),
    );

    const result = await pipeline.process({ message: message('разъехались') });

    expect(result.events[0]).toMatchObject({
      decision: 'RESOLVE',
      reason: 'RESOLVE_CANDIDATE',
    });
  });

  it('reviews a resolution when its location cannot be resolved', async () => {
    const { pipeline } = setup(
      parserResult({ intent: 'RESOLUTION', state: 'RESOLVED' }),
      [notFound()],
    );

    const result = await pipeline.process({ message: message('разъехались') });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'RESOLUTION_WITHOUT_LOCATION',
    });
  });

  it('returns an UPDATE candidate only with parser context', async () => {
    const { pipeline } = setup(
      parserResult({ intent: 'UPDATE', contextUsed: true }),
    );
    const reply = message('авария на комарова');

    const result = await pipeline.process({
      message: { ...message('еще стоит'), externalId: 'message-2' },
      replyMessage: reply,
    });

    expect(result.events[0]).toMatchObject({
      decision: 'UPDATE',
      reason: 'UPDATE_CANDIDATE',
      contextUsed: true,
      replyContextUsed: true,
    });
  });

  it('reviews an update without enough context', async () => {
    const { pipeline } = setup(
      parserResult({ intent: 'UPDATE', contextUsed: false }),
    );

    const result = await pipeline.process({ message: message('еще стоит') });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'MISSING_CONTEXT',
    });
  });

  it('processes DPS reports through the same create policy', async () => {
    const { pipeline, resolver } = setup(parserResult({ eventType: 'DPS' }));

    const result = await pipeline.process({ message: message('дпс комарова') });

    expect(result.events[0]).toMatchObject({
      eventType: 'DPS',
      decision: 'CREATE',
      reason: 'READY_TO_CREATE',
    });
    expect(resolver.resolveParserResult).toHaveBeenCalledTimes(1);
  });

  it('reviews matched events below the auto-action parser threshold', async () => {
    const { pipeline } = setup(parserResult({ confidence: 0.65 }));

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'LOW_CONFIDENCE',
    });
  });

  it('ignores extremely low confidence matches before location lookup', async () => {
    const { pipeline, resolver } = setup(parserResult({ confidence: 0.4 }));

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'IGNORE',
      reason: 'LOW_CONFIDENCE',
    });
    expect(resolver.resolveParserResult).not.toHaveBeenCalled();
  });

  it('handles explicit multiple report locations independently', async () => {
    const parsed = parserResult({
      locationText: 'Комарова',
      locations: [
        { text: 'Комарова', alias: 'komarova' },
        { text: 'Мира', alias: 'mira' },
      ],
    });
    const { pipeline } = setup(parsed, [
      resolved(),
      resolved({
        canonicalTitle: 'Мира',
        normalizedQuery: 'мира',
        latitude: 52.03,
        longitude: 47.81,
        localLocationId: 'mira',
      }),
    ]);

    const result = await pipeline.process({ message: message() });

    expect(result.events).toHaveLength(2);
    expect(result.events.map(({ decision }) => decision)).toEqual([
      'CREATE',
      'CREATE',
    ]);
  });

  it('reviews multiple locations for a non-report intent as ambiguous', async () => {
    const { pipeline } = setup(
      parserResult({
        intent: 'UPDATE',
        contextUsed: true,
        locations: [
          { text: 'Комарова', alias: 'komarова' },
          { text: 'Мира', alias: 'mira' },
        ],
      }),
      [resolved(), resolved({ localLocationId: 'mira' })],
    );

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'MULTI_LOCATION_AMBIGUOUS',
    });
  });

  it('never creates an event outside supported Balakovo bounds', async () => {
    const { pipeline } = setup(parserResult(), [
      resolved({ latitude: 55.75, longitude: 37.61 }),
    ]);

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'LOCATION_OUTSIDE_SUPPORTED_AREA',
    });
  });

  it('never creates an event when resolved coordinates are missing', async () => {
    const malformedResolution = {
      ...resolved(),
      latitude: undefined,
      longitude: undefined,
    } as unknown as TelegramLocationResolutionResult;
    const { pipeline } = setup(parserResult(), [malformedResolution]);

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'MISSING_COORDINATES',
      latitude: null,
      longitude: null,
    });
  });

  it('has no persistence or realtime side effects', async () => {
    const persistence = { create: jest.fn(), update: jest.fn() };
    const realtime = { emit: jest.fn(), broadcast: jest.fn() };
    const { pipeline } = setup(parserResult());

    await pipeline.process({ message: message() });

    expect(persistence.create).not.toHaveBeenCalled();
    expect(persistence.update).not.toHaveBeenCalled();
    expect(realtime.emit).not.toHaveBeenCalled();
    expect(realtime.broadcast).not.toHaveBeenCalled();
  });

  it('does not create from parser confidence 0.74 even with a perfect location', async () => {
    const { pipeline } = setup(parserResult({ confidence: 0.74 }), [
      resolved({ confidence: 0.99 }),
    ]);

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'LOW_CONFIDENCE',
    });
  });

  it('creates at the exact 0.75 parser and 0.90 location boundaries', async () => {
    const { pipeline } = setup(parserResult({ confidence: 0.75 }), [
      resolved({ confidence: 0.9 }),
    ]);

    const result = await pipeline.process({ message: message() });

    expect(result.events[0]).toMatchObject({
      decision: 'CREATE',
      reason: 'READY_TO_CREATE',
    });
  });

  it('resolves at parser confidence 0.60 with location confidence 0.99', async () => {
    const { pipeline } = setup(
      parserResult({
        intent: 'RESOLUTION',
        state: 'RESOLVED',
        confidence: 0.6,
      }),
      [resolved({ confidence: 0.99 })],
    );

    const result = await pipeline.process({ message: message('чисто') });

    expect(result.events[0]).toMatchObject({
      decision: 'RESOLVE',
      reason: 'RESOLVE_CANDIDATE',
    });
  });

  it('reviews a resolution below parser confidence 0.60', async () => {
    const { pipeline } = setup(
      parserResult({
        intent: 'RESOLUTION',
        state: 'RESOLVED',
        confidence: 0.59,
      }),
      [resolved({ confidence: 0.99 })],
    );

    const result = await pipeline.process({ message: message('чисто') });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'LOW_CONFIDENCE',
    });
  });

  it('reviews a resolution below location confidence 0.90', async () => {
    const { pipeline } = setup(
      parserResult({
        intent: 'RESOLUTION',
        state: 'RESOLVED',
        confidence: 0.7,
      }),
      [resolved({ confidence: 0.89 })],
    );

    const result = await pipeline.process({ message: message('чисто') });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'LOW_CONFIDENCE',
    });
  });

  it('keeps an ambiguous resolution in REVIEW', async () => {
    const { pipeline } = setup(
      parserResult({ intent: 'RESOLUTION', state: 'RESOLVED' }),
      [ambiguous()],
    );

    const result = await pipeline.process({ message: message('чисто') });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'LOCATION_AMBIGUOUS',
    });
  });

  it('keeps a multiple-location resolution in REVIEW', async () => {
    const { pipeline } = setup(
      parserResult({
        intent: 'RESOLUTION',
        state: 'RESOLVED',
        locations: [
          { text: 'Генезис', alias: 'genesis' },
          { text: 'Остановка у 38-го училища', alias: 'school-38-stop' },
        ],
      }),
      [resolved(), resolved({ localLocationId: 'school-38-stop' })],
    );

    const result = await pipeline.process({ message: message('чисто') });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'MULTI_LOCATION_AMBIGUOUS',
      resolverStatus: 'MULTIPLE',
    });
  });

  it('keeps explicit CREATE, RESOLVE and UPDATE thresholds independent', () => {
    expect(TELEGRAM_INGESTION_THRESHOLDS).toMatchObject({
      createParserConfidence: 0.75,
      resolveParserConfidence: 0.6,
      updateParserConfidence: 0.75,
      locationConfidence: 0.9,
      updateLocationConfidence: 0.7,
    });
  });

  it('accepts the Ivanovka cemetery resolution policy at confidence 0.60', async () => {
    const { pipeline } = setupWithActualParser([
      resolved({
        canonicalTitle: 'Кладбище у Ивановки',
        normalizedQuery: 'кладбище у ивановки',
        confidence: 0.99,
        localLocationId: 'ivanovka-cemetery',
      }),
    ]);

    const result = await pipeline.process({
      message: message('Ивановка кладбище чисто'),
    });

    expect(result.parserResult.confidence).toBe(0.6);
    expect(result.events[0]).toMatchObject({
      decision: 'RESOLVE',
      canonicalLocationId: 'ivanovka-cemetery',
    });
  });

  it('accepts inherited Transportnaya clean state as a resolution', async () => {
    const { pipeline } = setupWithActualParser([
      resolved({
        canonicalTitle: 'Улица Транспортная',
        normalizedQuery: 'улица транспортная',
        confidence: 0.99,
        localLocationId: 'transportnaya',
      }),
    ]);
    const previousMessage = {
      ...message('Как транспортная?'),
      externalId: 'message-previous',
      publishedAt: '2026-08-31T07:59:00.000Z',
    };

    const result = await pipeline.process({
      message: message('Чисто'),
      previousMessages: [previousMessage],
    });

    expect(result.parserResult).toMatchObject({
      confidence: 0.7,
      contextUsed: true,
    });
    expect(result.events[0]).toMatchObject({
      decision: 'RESOLVE',
      canonicalLocationId: 'transportnaya',
    });
  });

  it('accepts the gateway bridge clean state as a resolution', async () => {
    const { pipeline } = setupWithActualParser([
      resolved({
        canonicalTitle: 'Шлюзовой мост',
        normalizedQuery: 'шлюзовой мост',
        confidence: 0.99,
        localLocationId: 'gateway-bridge',
      }),
    ]);

    const result = await pipeline.process({
      message: message('шлюзы чисто'),
    });

    expect(result.parserResult.confidence).toBe(0.6);
    expect(result.events[0]).toMatchObject({
      decision: 'RESOLVE',
      canonicalLocationId: 'gateway-bridge',
    });
  });

  it('keeps Genesis 38 clean state in REVIEW because location is multiple', async () => {
    const { pipeline } = setupWithActualParser([
      resolved({
        canonicalTitle: 'Генезис',
        normalizedQuery: 'генезис',
        confidence: 0.99,
        localLocationId: 'genesis',
      }),
      resolved({
        canonicalTitle: 'Остановка у 38-го училища',
        normalizedQuery: 'остановка у 38-го училища',
        confidence: 0.99,
        localLocationId: 'school-38-stop',
      }),
    ]);

    const result = await pipeline.process({
      message: message('Генезис 38 чисто'),
    });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'MULTI_LOCATION_AMBIGUOUS',
      resolverStatus: 'MULTIPLE',
    });
  });

  it('passes a synthetic trusted city through resolver and normalized event', async () => {
    const testCity: CityConfig = {
      id: 'test-city',
      name: 'Тестовый город',
      center: { latitude: 52.02, longitude: 47.8 },
      defaultZoom: 12,
      coverageBounds: { north: 53, south: 51, east: 49, west: 46 },
      nearbyAreas: [],
      locations: [],
    };
    const parser = { parse: jest.fn().mockReturnValue(parserResult()) };
    const resolver = {
      resolveParserResult: jest.fn().mockResolvedValue([resolved()]),
    };
    const pipeline = new TelegramDryRunIngestionPipeline(
      parser,
      resolver,
      (cityId) => {
        expect(cityId).toBe(testCity.id);
        return testCity;
      },
    );

    const result = await pipeline.process({
      message: { ...message(), cityId: testCity.id },
    });

    expect(resolver.resolveParserResult).toHaveBeenCalledWith(
      expect.any(Object),
      testCity.id,
    );
    expect(result.events[0]?.cityId).toBe(testCity.id);
  });
});

describe('Telegram approximate STREET ingestion', () => {
  const streetParserResult = parserResult({
    locationText: 'Комарова',
    locationAlias: 'komarova',
    locations: [{ text: 'Комарова', alias: 'komarova' }],
    confidence: TELEGRAM_INGESTION_THRESHOLDS.createParserConfidence,
  });

  it.each(['LineString', 'MultiLineString'] as const)(
    'accepts resolved %s geometry for CREATE without inventing a point',
    async (geometryType) => {
      const geometry =
        geometryType === 'LineString'
          ? {
              type: 'LineString' as const,
              coordinates: [
                [47.79, 52.01],
                [47.8, 52.02],
              ] as Array<[number, number]>,
            }
          : {
              type: 'MultiLineString' as const,
              coordinates: [
                [
                  [47.79, 52.01],
                  [47.8, 52.02],
                ],
                [
                  [47.81, 52.03],
                  [47.82, 52.04],
                ],
              ] as Array<Array<[number, number]>>,
            };
      const { pipeline } = setup(streetParserResult, [
        resolved({
          geometry,
          precision: 'STREET',
          geometryProvider: 'OSM',
          geometryStatus: 'RESOLVED',
          coordinateSource: 'OSM',
          confidence: TELEGRAM_INGESTION_THRESHOLDS.locationConfidence,
        }),
      ]);

      const result = await pipeline.process({
        message: message('Комарова притерлись'),
      });

      expect(result.events[0]).toMatchObject({
        decision: 'CREATE',
        locationPrecision: 'STREET',
        geometry: { type: geometryType },
        sourceText: 'Комарова притерлись',
      });
    },
  );

  it('keeps STREET on REVIEW when geometry is unavailable', async () => {
    const unavailable: TelegramLocationResolutionResult = {
      status: 'NOT_FOUND',
      canonicalTitle: 'Комарова',
      normalizedQuery: 'комарова',
      confidence: null,
      attemptedQueries: [],
      queryAttempts: [],
      rawCandidateCount: 0,
      acceptedCandidateCount: 0,
      reason: 'STREET_GEOMETRY_UNAVAILABLE',
      precision: 'STREET',
      geometryProvider: 'OSM',
      geometryStatus: 'UNAVAILABLE',
    };
    const { pipeline } = setup(streetParserResult, [unavailable]);
    const result = await pipeline.process({
      message: message('Комарова притерлись'),
    });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'STREET_GEOMETRY_UNAVAILABLE',
      geometry: null,
      locationPrecision: 'STREET',
    });
  });

  it('keeps AREA on REVIEW when curated area geometry is unavailable', async () => {
    const unavailable: TelegramLocationResolutionResult = {
      status: 'NOT_FOUND',
      canonicalTitle: '1-й микрорайон',
      normalizedQuery: '1-й микрорайон',
      confidence: null,
      attemptedQueries: [],
      queryAttempts: [],
      rawCandidateCount: 0,
      acceptedCandidateCount: 0,
      reason: 'AREA_GEOMETRY_UNAVAILABLE',
      precision: 'AREA',
      geometryProvider: null,
      geometryStatus: null,
    };
    const { pipeline } = setup(
      parserResult({
        eventType: 'DPS',
        locationText: '1-й микрорайон',
        locationAlias: 'first-microdistrict',
      }),
      [unavailable],
    );

    const result = await pipeline.process({
      message: message('В первом стоят'),
    });

    expect(result.events[0]).toMatchObject({
      decision: 'REVIEW',
      reason: 'AREA_GEOMETRY_UNAVAILABLE',
      locationPrecision: 'AREA',
    });
  });

  it.each([
    ['Комарова притерлись', 'ACCIDENT'],
    ['Комарова актив', 'DPS'],
  ] as const)(
    'keeps real parser classification for %s and creates a STREET candidate',
    async (text, eventType) => {
      const { pipeline } = setupWithActualParser([
        resolved({
          geometry: {
            type: 'LineString',
            coordinates: [
              [47.79, 52.01],
              [47.8, 52.02],
            ],
          },
          precision: 'STREET',
          geometryProvider: 'OSM',
          geometryStatus: 'RESOLVED',
          coordinateSource: 'OSM',
          confidence: 0.95,
        }),
      ]);

      const result = await pipeline.process({ message: message(text) });

      expect(result.parserResult).toMatchObject({
        eventType,
        intent: 'REPORT',
        state: 'ACTIVE',
        locationAlias: 'komarova',
      });
      expect(result.events[0]).toMatchObject({
        decision: 'CREATE',
        eventType,
        locationPrecision: 'STREET',
        geometry: { type: 'LineString' },
      });
    },
  );
});
