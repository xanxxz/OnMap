import * as cityRegistry from '../../../cities/city.registry';
import { TomTomSearchProvider } from '../../tomtom/tomtom-search.provider';
import type { TomTomSearchCandidate } from '../../tomtom/tomtom.types';
import type { BalakovoLocationDictionaryEntry } from '../parser/balakovo-location.dictionary';
import { TELEGRAM_VERIFIED_LOCAL_CONFIDENCE } from './telegram-location-resolver.constants';
import type { TelegramLocationParserResultInput } from './telegram-location-resolver.types';
import { TelegramLocationResolver } from './telegram-location-resolver';
import {
  compareLocationPrecision,
  isMorePreciseLocation,
  locationPrecisionFor,
} from './telegram-location-precision';
import type { TelegramStreetGeometryProvider } from './telegram-street-geometry.provider';

const candidate = (
  overrides: Partial<TomTomSearchCandidate> = {},
): TomTomSearchCandidate => ({
  externalId: 'candidate-1',
  source: 'TOMTOM',
  name: 'Менделеева',
  address: 'улица Менделеева, Балаково',
  position: {
    latitude: 52.02,
    longitude: 47.8,
  },
  type: 'Street',
  score: 4.7,
  distanceMeters: 300,
  ...overrides,
});

const actualGetCityConfig = cityRegistry.getCityConfig;

const mockVerifiedLocation = (
  verifiedCoordinates: BalakovoLocationDictionaryEntry['verifiedCoordinates'] = {
    latitude: 52.03,
    longitude: 47.82,
  },
): BalakovoLocationDictionaryEntry => {
  const entry: BalakovoLocationDictionaryEntry = {
    id: 'verified-test-location',
    title: 'Проверенная точка',
    aliases: ['проверенная точка', 'альтернативная точка'],
    kind: 'LANDMARK',
    verifiedCoordinates,
  };

  jest.spyOn(cityRegistry, 'getCityConfig').mockImplementation((cityId) => {
    const city = actualGetCityConfig(cityId);

    return city === undefined
      ? undefined
      : { ...city, locations: [entry, ...city.locations] };
  });

  return entry;
};

describe('TelegramLocationResolver', () => {
  let provider: {
    isAvailable: jest.Mock;
    search: jest.Mock;
  };
  let resolver: TelegramLocationResolver;

  beforeEach(() => {
    jest.spyOn(cityRegistry, 'getCityConfig').mockImplementation((cityId) => {
      const city = actualGetCityConfig(cityId);

      return city === undefined
        ? undefined
        : {
            ...city,
            locations: city.locations.map((entry) => ({
              ...entry,
              verifiedCoordinates: undefined,
            })),
          };
    });
    provider = {
      isAvailable: jest.fn().mockReturnValue(true),
      search: jest.fn().mockResolvedValue([candidate()]),
    };
    resolver = new TelegramLocationResolver(
      provider as unknown as TomTomSearchProvider,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves verified local coordinates without TomTom', async () => {
    mockVerifiedLocation();

    const result = await resolver.resolve({
      eventType: 'DPS',
      location: { text: 'проверенная точка', alias: null },
    });

    expect(result).toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Проверенная точка',
      latitude: 52.03,
      longitude: 47.82,
      confidence: TELEGRAM_VERIFIED_LOCAL_CONFIDENCE,
      source: 'LOCAL',
      coordinateSource: 'VERIFIED_LOCAL',
      localLocationId: 'verified-test-location',
      matchedAlias: 'проверенная точка',
      attemptedQueries: [],
      rawCandidateCount: 0,
      acceptedCandidateCount: 0,
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('uses the same verified coordinates for canonical and alternate aliases', async () => {
    mockVerifiedLocation();

    const [canonical, alternate] = await Promise.all([
      resolver.resolve({
        eventType: 'ROAD_STATE',
        location: {
          text: 'Проверенная точка',
          alias: 'verified-test-location',
        },
      }),
      resolver.resolve({
        eventType: 'ROAD_STATE',
        location: { text: 'альтернативная точка', alias: null },
      }),
    ]);

    expect(canonical).toMatchObject({
      status: 'RESOLVED',
      latitude: 52.03,
      longitude: 47.82,
      coordinateSource: 'VERIFIED_LOCAL',
    });
    expect(alternate).toMatchObject({
      status: 'RESOLVED',
      latitude: 52.03,
      longitude: 47.82,
      coordinateSource: 'VERIFIED_LOCAL',
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('resolves the three user-confirmed local names without external search', async () => {
    jest
      .mocked(cityRegistry.getCityConfig)
      .mockImplementation(actualGetCityConfig);

    const [peremychka, magnit, ivanovka] = await Promise.all([
      resolver.resolve({
        eventType: 'DPS',
        location: { text: 'Перемычка', alias: 'peremychka' },
      }),
      resolver.resolve({
        eventType: 'DPS',
        location: {
          text: 'Магнит в 1-м микрорайоне',
          alias: 'magnit-first-microdistrict',
        },
      }),
      resolver.resolve({
        eventType: 'DPS',
        location: { text: 'Ивановка', alias: 'ivanovka' },
      }),
    ]);

    expect(peremychka).toMatchObject({
      status: 'RESOLVED',
      latitude: 52.015146,
      longitude: 47.787348,
      coordinateSource: 'VERIFIED_LOCAL',
    });
    expect(magnit).toMatchObject({
      status: 'RESOLVED',
      latitude: 52.008032,
      longitude: 47.783659,
      coordinateSource: 'VERIFIED_LOCAL',
    });
    expect(ivanovka).toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Ивановка',
      latitude: 51.989994,
      longitude: 47.735414,
      coordinateSource: 'IMPORTED_LOCAL',
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('rejects verified coordinates outside supported bounds without fallback', async () => {
    mockVerifiedLocation({ latitude: 55, longitude: 40 });

    await expect(
      resolver.resolve({
        eventType: 'DPS',
        location: { text: 'проверенная точка', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'NOT_FOUND',
      canonicalTitle: 'Проверенная точка',
      reason: 'OUTSIDE_SUPPORTED_AREA',
      attemptedQueries: [],
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('uses expanded coverage bounds from the requested city config', async () => {
    mockVerifiedLocation({ latitude: 52.2, longitude: 48.1 });

    await expect(
      resolver.resolve({
        cityId: 'balakovo',
        eventType: 'ACCIDENT',
        location: { text: 'проверенная точка', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      latitude: 52.2,
      longitude: 48.1,
    });
  });

  it('rejects a city missing from the registry without searching', async () => {
    await expect(
      resolver.resolve({
        cityId: 'unknown-city',
        eventType: 'ACCIDENT',
        location: { text: 'комарова', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'NOT_FOUND',
      reason: 'UNSUPPORTED_CITY',
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('normalizes a known alias to its canonical title before search', async () => {
    provider.search.mockResolvedValue([
      candidate({
        name: 'Кинотеатр Мир',
        address: 'Балаково',
        type: 'POI',
      }),
    ]);

    const result = await resolver.resolve({
      eventType: 'DPS',
      location: { text: 'мир', alias: null },
    });

    expect(provider.search.mock.calls).toEqual([
      ['Кинотеатр Мир', 'balakovo'],
      ['Мир Балаково', 'balakovo'],
      ['Кинотеатр Мир Балаково', 'balakovo'],
    ]);
    expect(result).toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Кинотеатр «Мир»',
      normalizedQuery: 'кинотеатр «мир»',
      source: 'LOCAL',
      coordinateSource: 'TOMTOM',
      localLocationId: 'cinema-mir',
      matchedAlias: 'мир',
    });
  });

  it('limits one logical location to three deterministic attempts', async () => {
    provider.search.mockResolvedValue([
      candidate({ name: 'Кинотеатр Мир', type: 'POI' }),
    ]);

    const result = await resolver.resolve({
      eventType: 'DPS',
      location: { text: 'мир', alias: null },
    });

    expect(provider.search).toHaveBeenCalledTimes(3);
    expect(result.attemptedQueries).toHaveLength(3);
  });

  it('deduplicates one physical candidate returned by search variants', async () => {
    provider.search.mockResolvedValue([
      candidate({
        externalId: 'cinema-mir',
        name: 'Кинотеатр Мир',
        type: 'POI',
      }),
    ]);

    const result = await resolver.resolve({
      eventType: 'DPS',
      location: { text: 'мир', alias: null },
    });

    expect(result).toMatchObject({
      status: 'RESOLVED',
      rawCandidateCount: 3,
      acceptedCandidateCount: 1,
    });
  });

  it('recognizes both a trusted alias and the imported canonical title', async () => {
    provider.search.mockResolvedValue([
      candidate({
        externalId: 'mir-poi',
        name: 'Мир',
        address: 'Балаково',
        type: 'POI',
      }),
    ]);

    const localResult = await resolver.resolve({
      eventType: 'DPS',
      location: { text: 'мир', alias: null },
    });
    const unknownResult = await resolver.resolve({
      eventType: 'DPS',
      location: { text: 'кинотеатр «мир»', alias: null },
    });

    expect(localResult).toMatchObject({
      status: 'RESOLVED',
      source: 'LOCAL',
    });
    expect(unknownResult).toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Кинотеатр «Мир»',
    });
  });

  it('rejects a wrong object type despite an exact local title match', async () => {
    provider.search.mockResolvedValue([
      candidate({
        externalId: 'mir-street',
        name: 'Кинотеатр Мир',
        address: 'Балаково',
        type: 'Street',
      }),
    ]);

    await expect(
      resolver.resolve({
        eventType: 'DPS',
        location: { text: 'мир', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'NOT_FOUND',
      reason: 'NO_CANDIDATES',
      acceptedCandidateCount: 0,
    });
  });

  it('uses one canonical for New Bridge and Pobedy Bridge aliases', async () => {
    provider.search.mockResolvedValue([
      candidate({ name: 'Мост Победы', type: 'Bridge' }),
    ]);

    const [newBridge, pobedyBridge] = await Promise.all([
      resolver.resolve({
        eventType: 'ROAD_STATE',
        location: { text: 'новый мост', alias: null },
      }),
      resolver.resolve({
        eventType: 'ROAD_STATE',
        location: { text: 'мост победы', alias: null },
      }),
    ]);

    expect(provider.search).toHaveBeenCalledTimes(4);
    expect(provider.search).toHaveBeenCalledWith('Мост Победы', 'balakovo');
    expect(provider.search).toHaveBeenCalledWith(
      'Новый мост Балаково',
      'balakovo',
    );
    expect(newBridge).toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Мост Победы',
      localLocationId: 'bridge-pobedy',
    });
    expect(pobedyBridge).toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Мост Победы',
      localLocationId: 'bridge-pobedy',
    });
  });

  it('does not search with a raw local alias', async () => {
    provider.search.mockResolvedValue([
      candidate({ name: 'Мост Победы', type: 'Bridge' }),
    ]);

    await resolver.resolve({
      eventType: 'ACCIDENT',
      location: { text: 'на новом мосту', alias: null },
    });

    expect(provider.search).toHaveBeenCalledWith('Мост Победы', 'balakovo');
    expect(provider.search).not.toHaveBeenCalledWith(
      'на новом мосту',
      expect.anything(),
    );
  });

  it('uses TomTom for an unknown street', async () => {
    const result = await resolver.resolve({
      eventType: 'ACCIDENT',
      location: { text: 'Менделеева', alias: null },
    });

    expect(provider.search).toHaveBeenCalledWith('Менделеева', 'balakovo');
    expect(result).toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Менделеева',
      source: 'TOMTOM',
      coordinateSource: 'TOMTOM',
      matchedAlias: null,
    });
  });

  it('resolves one exact strong TomTom candidate', async () => {
    const result = await resolver.resolve({
      eventType: 'HAZARD',
      location: { text: 'Менделеева', alias: null },
    });

    expect(result).toMatchObject({
      status: 'RESOLVED',
      latitude: 52.02,
      longitude: 47.8,
      source: 'TOMTOM',
      coordinateSource: 'TOMTOM',
      tomTomCandidate: {
        externalId: 'candidate-1',
        type: 'Street',
        providerScore: 4.7,
      },
    });

    if (result.status === 'RESOLVED') {
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('rejects a candidate outside Balakovo bounds', async () => {
    provider.search.mockResolvedValue([
      candidate({ position: { latitude: 51.5, longitude: 46.2 } }),
    ]);

    await expect(
      resolver.resolve({
        eventType: 'ROADWORKS',
        location: { text: 'Менделеева', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'NOT_FOUND',
      normalizedQuery: 'менделеева',
      reason: 'OUTSIDE_SUPPORTED_AREA',
    });
  });

  it('uses the applied Mayanga settlement center without TomTom', async () => {
    provider.search.mockResolvedValue([
      candidate({
        externalId: 'mayanga',
        name: 'Маянга',
        address: 'Маянга, Саратовская область',
        type: 'Geography',
        position: { latitude: 51.9, longitude: 47.4 },
      }),
    ]);

    await expect(
      resolver.resolve({
        eventType: 'ROAD_STATE',
        location: { text: 'маянга', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Маянга',
      coordinateSource: 'IMPORTED_LOCAL',
      precision: 'SETTLEMENT',
      rawCandidateCount: 0,
      acceptedCandidateCount: 0,
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('returns at most three candidates when strong scores are close', async () => {
    provider.search.mockResolvedValue(
      Array.from({ length: 4 }, (_, index) =>
        candidate({
          externalId: `candidate-${index}`,
          address: `улица Менделеева, ${index + 1}, Балаково`,
          position: {
            latitude: 52.02 + index * 0.001,
            longitude: 47.8,
          },
        }),
      ),
    );

    const result = await resolver.resolve({
      eventType: 'TRAFFIC_JAM',
      location: { text: 'Менделеева', alias: null },
    });

    expect(result).toMatchObject({ status: 'AMBIGUOUS' });

    if (result.status === 'AMBIGUOUS') {
      expect(result.candidates).toHaveLength(3);
    }
  });

  it('returns LOW_CONFIDENCE for one weak candidate', async () => {
    provider.search.mockResolvedValue([
      candidate({
        name: 'Октябрь',
        address: 'другой объект',
        type: 'Unknown',
        score: 0.2,
        distanceMeters: 20_000,
      }),
    ]);

    await expect(
      resolver.resolve({
        eventType: 'ROAD_CLOSURE',
        location: { text: 'Менделеева', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'NOT_FOUND',
      reason: 'LOW_CONFIDENCE',
    });
  });

  it('returns NO_CANDIDATES for an empty TomTom result', async () => {
    provider.search.mockResolvedValue([]);

    await expect(
      resolver.resolve({
        eventType: 'ROAD_STATE',
        location: { text: 'несуществующая улица', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'NOT_FOUND',
      reason: 'NO_CANDIDATES',
    });
  });

  it.each(['disabled', 'error'])(
    'returns SEARCH_UNAVAILABLE when TomTom is %s',
    async (mode) => {
      if (mode === 'disabled') {
        provider.isAvailable.mockReturnValue(false);
      } else {
        provider.search.mockRejectedValue(new Error('controlled failure'));
      }

      await expect(
        resolver.resolve({
          eventType: 'DPS',
          location: { text: 'ГЭС', alias: 'ges' },
        }),
      ).resolves.toMatchObject({
        status: 'NOT_FOUND',
        reason: 'SEARCH_UNAVAILABLE',
      });
    },
  );

  it('continues with later search variants after one attempt errors', async () => {
    provider.search.mockImplementation((query: string) => {
      if (query === 'Кинотеатр Мир') {
        return Promise.reject(new Error('first attempt failed'));
      }

      return Promise.resolve([
        candidate({
          externalId: 'mir-poi',
          name: 'Мир',
          address: 'Балаково',
          type: 'POI',
        }),
      ]);
    });

    await expect(
      resolver.resolve({
        eventType: 'DPS',
        location: { text: 'мир', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      source: 'LOCAL',
      attemptedQueries: [
        'Кинотеатр Мир',
        'Мир Балаково',
        'Кинотеатр Мир Балаково',
      ],
    });
  });

  it('returns a controlled result when every search attempt fails', async () => {
    provider.search.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      resolver.resolve({
        eventType: 'DPS',
        location: { text: 'гэс', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'NOT_FOUND',
      canonicalTitle: 'ГЭС',
      attemptedQueries: ['ГЭС Балаково', 'Балаковская ГЭС'],
      reason: 'SEARCH_UNAVAILABLE',
    });
  });

  it('does not accept a one-street candidate for an intersection', async () => {
    provider.search.mockResolvedValue([
      candidate({ name: 'Менделеева', address: 'улица Менделеева' }),
    ]);

    const result = await resolver.resolve({
      eventType: 'ACCIDENT',
      location: { text: 'Менделеева / Комарова', alias: null },
    });

    expect(provider.search.mock.calls).toEqual([
      ['менделеева комарова', 'balakovo'],
      ['менделеева & комарова', 'balakovo'],
      ['перекресток менделеева комарова', 'balakovo'],
    ]);
    expect(result).toMatchObject({
      status: 'NOT_FOUND',
      reason: 'NO_CANDIDATES',
    });
  });

  it('can resolve a candidate containing both intersection streets', async () => {
    provider.search.mockResolvedValue([
      candidate({
        name: 'Перекресток Менделеева и Комарова',
        address: 'Менделеева & Комарова, Балаково',
        type: 'Cross Street',
      }),
    ]);

    await expect(
      resolver.resolve({
        eventType: 'ACCIDENT',
        location: { text: 'Менделеева / Комарова', alias: null },
      }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      source: 'TOMTOM',
    });
  });

  it('resolves multiple locations through verified local and TomTom paths', async () => {
    mockVerifiedLocation();
    provider.search.mockResolvedValue([candidate()]);
    const parserResult: TelegramLocationParserResultInput = {
      eventType: 'DPS',
      locationText: 'Проверенная точка',
      locationAlias: 'verified-test-location',
      locations: [
        {
          text: 'Проверенная точка',
          alias: 'verified-test-location',
        },
        { text: 'Менделеева', alias: null },
      ],
    };

    const results = await resolver.resolveParserResult(parserResult);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      status: 'RESOLVED',
      source: 'LOCAL',
      coordinateSource: 'VERIFIED_LOCAL',
    });
    expect(results[1]).toMatchObject({
      status: 'RESOLVED',
      source: 'TOMTOM',
      coordinateSource: 'TOMTOM',
    });
    expect(provider.search).toHaveBeenCalledTimes(1);
  });

  it('resolves multiple parser locations independently', async () => {
    provider.search.mockImplementation((query: string) =>
      Promise.resolve([
        candidate({
          externalId: query,
          name: query,
          type: query.includes('Мост') ? 'Bridge' : 'POI',
        }),
      ]),
    );
    const parserResult: TelegramLocationParserResultInput = {
      eventType: 'DPS',
      locationText: 'КП Маянга',
      locationAlias: 'mayanga-checkpoint',
      locations: [
        { text: 'КП Маянга', alias: 'mayanga-checkpoint' },
        { text: 'Мост Победы', alias: 'bridge-pobedy' },
      ],
    };

    const results = await resolver.resolveParserResult(parserResult);

    expect(provider.search.mock.calls).toEqual([
      ['КП Маянга', 'balakovo'],
      ['Мост Победы', 'balakovo'],
      ['Новый мост Балаково', 'balakovo'],
    ]);
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.status)).toEqual([
      'RESOLVED',
      'RESOLVED',
    ]);
  });

  it('returns EMPTY_LOCATION without calling search', async () => {
    await expect(
      resolver.resolve({ eventType: 'DPS', location: null }),
    ).resolves.toMatchObject({
      status: 'NOT_FOUND',
      normalizedQuery: '',
      reason: 'EMPTY_LOCATION',
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('rejects an unsupported parser event type', async () => {
    await expect(
      resolver.resolve({
        eventType: 'OTHER',
        location: { text: 'Комарова', alias: 'komarova' },
      }),
    ).resolves.toMatchObject({
      status: 'NOT_FOUND',
      normalizedQuery: 'комарова',
      reason: 'UNSUPPORTED_EVENT_TYPE',
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('keeps Mayanga settlement semantics for DPS', async () => {
    await expect(
      resolver.resolve({
        eventType: 'DPS',
        location: {
          text: 'Маянга',
          alias: 'mayanga',
        },
      }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      coordinateSource: 'IMPORTED_LOCAL',
      precision: 'SETTLEMENT',
    });
    expect(provider.search).not.toHaveBeenCalled();
  });
});

describe('Telegram STREET geometry resolution', () => {
  const search = jest.fn();
  const searchProvider = {
    isAvailable: jest.fn().mockReturnValue(true),
    search,
  } as unknown as TomTomSearchProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(cityRegistry, 'getCityConfig').mockImplementation((cityId) => {
      const city = actualGetCityConfig(cityId);

      return city === undefined
        ? undefined
        : {
            ...city,
            locations: city.locations.map((entry) =>
              entry.id === 'komarova'
                ? { ...entry, streetGeometry: undefined }
                : entry,
            ),
          };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps configured disconnected street parts separate', async () => {
    const resolveStreetGeometry = jest.fn();
    const streetProvider: TelegramStreetGeometryProvider = {
      resolve: resolveStreetGeometry,
    };
    const resolver = new TelegramLocationResolver(
      searchProvider,
      streetProvider,
    );

    const result = await resolver.resolve({
      eventType: 'ROAD_STATE',
      location: {
        text: 'Набережная Леонова',
        alias: 'naberezhnaya',
      },
    });

    expect(result).toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Набережная Леонова',
      source: 'LOCAL',
      coordinateSource: 'VERIFIED_LOCAL',
      precision: 'STREET',
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [47.785696, 52.006683],
            [47.792157, 52.011578],
          ],
          [
            [47.790275, 52.012899],
            [47.831708, 52.033997],
          ],
          [
            [47.817703, 52.024639],
            [47.83357, 52.032938],
          ],
        ],
      },
    });
    expect(resolveStreetGeometry).not.toHaveBeenCalled();
  });

  it('does not connect the two Vokzalnaya branches to each other', async () => {
    const resolveStreetGeometry = jest.fn();
    const streetProvider: TelegramStreetGeometryProvider = {
      resolve: resolveStreetGeometry,
    };
    const resolver = new TelegramLocationResolver(
      searchProvider,
      streetProvider,
    );

    const result = await resolver.resolve({
      eventType: 'ACCIDENT',
      location: { text: 'Вокзальная', alias: 'vokzalnaya' },
    });

    expect(result).toMatchObject({
      status: 'RESOLVED',
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [47.782016, 52.009982],
            [47.786137, 52.006995],
            [47.785817, 52.00656],
            [47.798854, 51.997068],
            [47.800424, 51.996366],
          ],
          [
            [47.800424, 51.996366],
            [47.802442, 51.996169],
          ],
          [
            [47.800424, 51.996366],
            [47.801729, 51.995596],
            [47.810674, 51.989124],
          ],
        ],
      },
    });
    expect(resolveStreetGeometry).not.toHaveBeenCalled();
  });

  it('returns an OSM LineString with STREET precision', async () => {
    const streetProvider: TelegramStreetGeometryProvider = {
      resolve: jest.fn().mockResolvedValue({
        status: 'RESOLVED',
        provider: 'OSM',
        confidence: 0.95,
        geometry: {
          type: 'LineString',
          coordinates: [
            [47.79, 52.01],
            [47.8, 52.02],
          ],
        },
      }),
    };
    const resolver = new TelegramLocationResolver(
      searchProvider,
      streetProvider,
    );

    await expect(
      resolver.resolve({
        cityId: 'balakovo',
        eventType: 'ACCIDENT',
        location: { text: 'Комарова', alias: 'komarova' },
      }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      precision: 'STREET',
      geometryProvider: 'OSM',
      geometryStatus: 'RESOLVED',
      geometry: { type: 'LineString' },
    });
  });

  it('accepts a MultiLineString as one STREET location', async () => {
    const resolver = new TelegramLocationResolver(searchProvider, {
      resolve: jest.fn().mockResolvedValue({
        status: 'RESOLVED',
        provider: 'OSM',
        confidence: 0.95,
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [47.79, 52.01],
              [47.8, 52.02],
            ],
            [
              [47.81, 52.03],
              [47.82, 52.04],
            ],
          ],
        },
      }),
    });

    await expect(
      resolver.resolve({
        eventType: 'DPS',
        location: { text: 'Комарова', alias: 'komarova' },
      }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      precision: 'STREET',
      geometry: { type: 'MultiLineString' },
    });
  });

  it.each(['DPS', 'ACCIDENT'] as const)(
    'uses a known nearby landmark to refine %s to a STREET-level point',
    async (eventType) => {
      const resolver = new TelegramLocationResolver(searchProvider, {
        resolve: jest.fn().mockResolvedValue({
          status: 'RESOLVED',
          provider: 'OSM',
          confidence: 0.95,
          geometry: {
            type: 'LineString',
            coordinates: [
              [47.77, 52.010344],
              [47.82, 52.010344],
            ],
          },
        }),
      });

      const [result] = await resolver.resolveParserResult({
        eventType,
        locationText: 'Улица Комарова',
        locationAlias: 'komarova',
        locations: [{ text: 'Улица Комарова', alias: 'komarova' }],
        direction: {
          relation: 'NEAR',
          targetLocationId: 'mystic',
          targetText: 'мистика',
        },
      });

      expect(result).toMatchObject({
        status: 'RESOLVED',
        precision: 'STREET',
        geometryProvider: 'OSM',
        geometryStatus: 'RESOLVED',
        geometry: {
          type: 'Point',
          coordinates: [47.781606, 52.010344],
        },
      });
    },
  );

  it('moves a STREET representative point towards a known landmark', async () => {
    const resolver = new TelegramLocationResolver(searchProvider, {
      resolve: jest.fn().mockResolvedValue({
        status: 'RESOLVED',
        provider: 'OSM',
        confidence: 0.95,
        geometry: {
          type: 'LineString',
          coordinates: [
            [47.77, 52.010344],
            [47.82, 52.010344],
          ],
        },
      }),
    });

    const result = await resolver.resolve({
      eventType: 'DPS',
      location: { text: 'Улица Комарова', alias: 'komarova' },
      direction: {
        relation: 'TOWARDS',
        targetLocationId: 'mystic',
      },
    });

    expect(result).toMatchObject({
      status: 'RESOLVED',
      precision: 'STREET',
      geometry: { type: 'Point' },
    });
    if (result.status === 'RESOLVED') {
      expect(result.longitude).toBeLessThan(47.795);
      expect(result.longitude).toBeGreaterThan(47.781606);
    }
  });

  it.each([
    ['BETWEEN', (longitude: number) => longitude > 47.781606],
    ['BEFORE', (longitude: number) => longitude > 47.781606],
    ['AFTER', (longitude: number) => longitude < 47.781606],
  ] as const)(
    'applies %s context on the same STREET geometry for DPS',
    async (relation, assertLongitude) => {
      const resolver = new TelegramLocationResolver(searchProvider, {
        resolve: jest.fn().mockResolvedValue({
          status: 'RESOLVED',
          provider: 'OSM',
          confidence: 0.95,
          geometry: {
            type: 'LineString',
            coordinates: [
              [47.77, 52.010344],
              [47.82, 52.010344],
            ],
          },
        }),
      });

      const result = await resolver.resolve({
        eventType: 'DPS',
        location: { text: 'Улица Комарова', alias: 'komarova' },
        direction: { relation, targetLocationId: 'mystic' },
      });

      expect(result).toMatchObject({
        status: 'RESOLVED',
        precision: 'STREET',
        geometry: { type: 'Point' },
      });
      if (result.status === 'RESOLVED') {
        expect(assertLongitude(result.longitude)).toBe(true);
      }
    },
  );

  it('keeps the STREET geometry when the directional target is unknown', async () => {
    const resolver = new TelegramLocationResolver(searchProvider, {
      resolve: jest.fn().mockResolvedValue({
        status: 'RESOLVED',
        provider: 'OSM',
        confidence: 0.95,
        geometry: {
          type: 'LineString',
          coordinates: [
            [47.79, 52.01],
            [47.8, 52.02],
          ],
        },
      }),
    });

    await expect(
      resolver.resolve({
        eventType: 'DPS',
        location: { text: 'Улица Комарова', alias: 'komarova' },
        direction: { relation: 'NEAR', targetText: 'неизвестного ориентира' },
      }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      precision: 'STREET',
      geometry: { type: 'LineString' },
    });
  });

  it('returns STREET_GEOMETRY_UNAVAILABLE without a fake point', async () => {
    const resolver = new TelegramLocationResolver(searchProvider, {
      resolve: jest.fn().mockResolvedValue({
        status: 'UNAVAILABLE',
        provider: 'OSM',
      }),
    });
    const result = await resolver.resolve({
      eventType: 'ACCIDENT',
      location: { text: 'Комарова', alias: 'komarova' },
    });

    expect(result).toMatchObject({
      status: 'NOT_FOUND',
      reason: 'STREET_GEOMETRY_UNAVAILABLE',
      precision: 'STREET',
      geometryProvider: 'OSM',
      geometryStatus: 'UNAVAILABLE',
    });
    expect('geometry' in result).toBe(false);
  });

  it('does not call OSM or TomTom for an applied ambiguous street', async () => {
    jest
      .spyOn(cityRegistry, 'getCityConfig')
      .mockImplementation(actualGetCityConfig);
    const resolveStreetGeometry = jest.fn();
    const streetGeometryProvider: TelegramStreetGeometryProvider = {
      resolve: resolveStreetGeometry,
    };
    const resolver = new TelegramLocationResolver(
      searchProvider,
      streetGeometryProvider,
    );

    const result = await resolver.resolve({
      eventType: 'ACCIDENT',
      location: { text: 'дубовая улица', alias: null },
    });

    expect(result).toMatchObject({
      status: 'NOT_FOUND',
      reason: 'STREET_GEOMETRY_UNAVAILABLE',
      geometryStatus: 'AMBIGUOUS',
    });
    expect(resolveStreetGeometry).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it('uses applied street geometry without an OSM or TomTom request', async () => {
    jest
      .spyOn(cityRegistry, 'getCityConfig')
      .mockImplementation(actualGetCityConfig);
    const resolveStreetGeometry = jest.fn();
    const streetGeometryProvider: TelegramStreetGeometryProvider = {
      resolve: resolveStreetGeometry,
    };
    const resolver = new TelegramLocationResolver(
      searchProvider,
      streetGeometryProvider,
    );

    const result = await resolver.resolve({
      eventType: 'ACCIDENT',
      location: { text: 'приморская улица', alias: null },
    });

    expect(result).toMatchObject({
      status: 'RESOLVED',
      canonicalTitle: 'Приморская улица',
      source: 'LOCAL',
      coordinateSource: 'IMPORTED_LOCAL',
      geometry: { type: 'LineString' },
    });
    expect(resolveStreetGeometry).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it('ranks precision from SETTLEMENT through EXACT', () => {
    expect(compareLocationPrecision('SETTLEMENT', 'AREA')).toBeLessThan(0);
    expect(compareLocationPrecision('STREET', 'LANDMARK')).toBeLessThan(0);
    expect(compareLocationPrecision('INTERSECTION', 'EXACT')).toBeLessThan(0);
    expect(isMorePreciseLocation('LANDMARK', 'STREET')).toBe(true);
    expect(isMorePreciseLocation('STREET', 'EXACT')).toBe(false);
  });

  it.each([
    [undefined, false, 'EXACT'],
    ['INTERSECTION', false, 'INTERSECTION'],
    ['LANDMARK', false, 'LANDMARK'],
    ['STREET', false, 'STREET'],
    ['DISTRICT', false, 'AREA'],
    ['SETTLEMENT', false, 'SETTLEMENT'],
    ['STREET', true, 'INTERSECTION'],
  ] as const)(
    'maps %s/intersection=%s to %s precision',
    (kind, intersection, expected) => {
      expect(locationPrecisionFor(kind, intersection)).toBe(expected);
    },
  );
});
