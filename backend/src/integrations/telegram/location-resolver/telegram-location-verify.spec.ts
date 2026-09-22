import {
  createManualAreaGeometryVerificationReport,
  createManualCoordinateVerificationReport,
  createManualStreetGeometryVerificationReport,
  createLocationVerificationReport,
  formatManualAreaGeometryVerificationReport,
  formatManualCoordinateVerificationReport,
  formatManualStreetGeometryVerificationReport,
  formatLocationVerificationReport,
  parseLocationArgument,
  parseLocationVerifyArguments,
  runLocationVerifyCli,
} from '../../../../scripts/telegram-location-verify';
import type { TomTomSearchCandidate } from '../../tomtom/tomtom.types';
import { TomTomSearchProvider } from '../../tomtom/tomtom-search.provider';
import * as locationDictionary from '../parser/balakovo-location.dictionary';
import type { BalakovoLocationDictionaryEntry } from '../parser/balakovo-location.dictionary';
import { TelegramLocationResolver } from './telegram-location-resolver';

const candidate = (
  id: string,
  latitude = 52.02,
  longitude = 47.8,
): TomTomSearchCandidate => ({
  externalId: id,
  source: 'TOMTOM',
  name: 'Кинотеатр Мир',
  address: 'Балаково',
  position: { latitude, longitude },
  type: 'POI',
  score: 4.7,
  distanceMeters: 300,
});

const actualFindByAlias = locationDictionary.findBalakovoLocationAlias;

const createDependencies = () => {
  const resolver = { resolve: jest.fn() };
  const searchProvider = { search: jest.fn() };

  return {
    resolver,
    searchProvider,
    dependencies: {
      resolver: resolver as unknown as TelegramLocationResolver,
      searchProvider: searchProvider as unknown as TomTomSearchProvider,
    },
  };
};

const createOutput = () => {
  const stdout = jest.fn<void, [string]>();
  const stderr = jest.fn<void, [string]>();

  return { stdout, stderr, output: { stdout, stderr } };
};

const mockVerifiedLocation = (): BalakovoLocationDictionaryEntry => {
  const entry: BalakovoLocationDictionaryEntry = {
    id: 'verified-location',
    title: 'Проверенная точка',
    aliases: ['проверенная точка'],
    kind: 'LANDMARK',
    verifiedCoordinates: { latitude: 52.02, longitude: 47.8 },
  };

  jest
    .spyOn(locationDictionary, 'findBalakovoLocationAlias')
    .mockImplementation((alias) =>
      entry.aliases.includes(alias) ? entry : actualFindByAlias(alias),
    );

  return entry;
};

describe('telegram location verification tool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires one non-empty location argument', () => {
    expect(parseLocationArgument([])).toBeNull();
    expect(parseLocationArgument(['  '])).toBeNull();
    expect(parseLocationArgument(['кп', 'маянга'])).toBe('кп маянга');
  });

  it('shows dictionary metadata and deduplicates candidates across queries', async () => {
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        status: 'RESOLVED',
        canonicalTitle: 'Кинотеатр «Мир»',
        normalizedQuery: 'кинотеатр «мир»',
        latitude: 52.02,
        longitude: 47.8,
        confidence: 0.9,
        coordinateSource: 'TOMTOM',
        attemptedQueries: ['Кинотеатр Мир', 'Мир Балаково'],
        queryAttempts: [],
        rawCandidateCount: 2,
        acceptedCandidateCount: 1,
        source: 'LOCAL',
        localLocationId: 'cinema-mir',
        matchedAlias: 'мир',
      }),
    };
    const provider = {
      search: jest.fn().mockResolvedValue([candidate('same-place')]),
    };

    const report = await createLocationVerificationReport('мир', {
      resolver: resolver as unknown as TelegramLocationResolver,
      searchProvider: provider as unknown as TomTomSearchProvider,
    });

    expect(report).toMatchObject({
      input: 'мир',
      normalizedInput: 'мир',
      matchedAlias: 'мир',
      localLocation: {
        id: 'cinema-mir',
        title: 'Кинотеатр «Мир»',
        kind: 'LANDMARK',
        hasVerifiedCoordinates: true,
      },
    });
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      resolverConfidence: 0.9,
      insideSupportedBounds: true,
      foundByQueries: ['Кинотеатр Мир', 'Мир Балаково'],
    });
  });

  it('limits output to five unique candidates', async () => {
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        status: 'NOT_FOUND',
        normalizedQuery: 'неизвестно',
        confidence: null,
        attemptedQueries: ['неизвестно'],
        queryAttempts: [],
        rawCandidateCount: 7,
        acceptedCandidateCount: 7,
        reason: 'LOW_CONFIDENCE',
      }),
    };
    const provider = {
      search: jest
        .fn()
        .mockResolvedValue(
          Array.from({ length: 7 }, (_, index) =>
            candidate(`candidate-${index}`, 52.02 + index * 0.001),
          ),
        ),
    };

    const report = await createLocationVerificationReport('неизвестно', {
      resolver: resolver as unknown as TelegramLocationResolver,
      searchProvider: provider as unknown as TomTomSearchProvider,
    });

    expect(report.localLocation).toBeNull();
    expect(report.candidates).toHaveLength(5);
  });

  it('formats map links and copyable dictionary snippets', async () => {
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        status: 'NOT_FOUND',
        normalizedQuery: 'мир',
        confidence: 0.5,
        attemptedQueries: ['Мир Балаково'],
        queryAttempts: [],
        rawCandidateCount: 1,
        acceptedCandidateCount: 1,
        reason: 'LOW_CONFIDENCE',
      }),
    };
    const provider = {
      search: jest.fn().mockResolvedValue([candidate('candidate-1')]),
    };
    const report = await createLocationVerificationReport('мир', {
      resolver: resolver as unknown as TelegramLocationResolver,
      searchProvider: provider as unknown as TomTomSearchProvider,
    });
    const output = formatLocationVerificationReport(report);

    expect(output).toContain('VERIFICATION CANDIDATES');
    expect(output).toContain('https://www.openstreetmap.org/');
    expect(output).toContain(
      'verifiedCoordinates: { latitude: 52.02, longitude: 47.8 }',
    );
    expect(output).not.toContain('TOMTOM_API_KEY');
  });

  it('accepts a known alias with valid manual coordinates', async () => {
    const { dependencies } = createDependencies();
    const { output, stderr } = createOutput();

    await expect(
      runLocationVerifyCli(
        ['мир', '--coords', '52.012345', '47.812345'],
        dependencies,
        output,
      ),
    ).resolves.toBe(0);
    expect(stderr).not.toHaveBeenCalled();
  });

  it('prints the proposed coordinates in a validated snippet', () => {
    const report = createManualCoordinateVerificationReport('мир', {
      latitude: 52.012345,
      longitude: 47.812345,
    });

    expect(formatManualCoordinateVerificationReport(report)).toContain(
      'verifiedCoordinates: { latitude: 52.012345, longitude: 47.812345 }',
    );
  });

  it('does not call TomTom or the resolver when manual coordinates are supplied', async () => {
    const { dependencies, resolver, searchProvider } = createDependencies();
    const { output, stdout } = createOutput();

    await runLocationVerifyCli(
      ['мир', '--coords', '52.012345', '47.812345'],
      dependencies,
      output,
    );

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(searchProvider.search).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining(
        'TomTom lookup skipped: manual coordinates supplied',
      ),
    );
  });

  it.each([
    ['not-a-number', 'INVALID_LATITUDE'],
    ['91', 'INVALID_LATITUDE'],
  ])('rejects invalid latitude %s with a controlled error', (value, error) => {
    expect(
      parseLocationVerifyArguments(['мир', '--coords', value, '47.8']),
    ).toEqual({ valid: false, error });
  });

  it.each([
    ['not-a-number', 'INVALID_LONGITUDE'],
    ['181', 'INVALID_LONGITUDE'],
  ])('rejects invalid longitude %s with a controlled error', (value, error) => {
    expect(
      parseLocationVerifyArguments(['мир', '--coords', '52.02', value]),
    ).toEqual({ valid: false, error });
  });

  it('rejects coordinates outside the supported area without a validated snippet', async () => {
    const { dependencies } = createDependencies();
    const { output, stdout } = createOutput();

    await expect(
      runLocationVerifyCli(
        ['мир', '--coords', '52.5', '47.8'],
        dependencies,
        output,
      ),
    ).resolves.toBe(1);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('Reason: OUTSIDE_SUPPORTED_AREA'),
    );
    expect(stdout).not.toHaveBeenCalledWith(
      expect.stringContaining('VERIFIED COORDINATE SNIPPET'),
    );
  });

  it('rejects an unknown alias without a validated snippet', async () => {
    const { dependencies } = createDependencies();
    const { output, stdout } = createOutput();

    await expect(
      runLocationVerifyCli(
        ['неизвестное место', '--coords', '52.02', '47.8'],
        dependencies,
        output,
      ),
    ).resolves.toBe(1);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('Reason: UNKNOWN_ALIAS'),
    );
    expect(stdout).not.toHaveBeenCalledWith(
      expect.stringContaining('VERIFIED COORDINATE SNIPPET'),
    );
  });

  it('calculates the distance from existing verified coordinates', () => {
    mockVerifiedLocation();

    const report = createManualCoordinateVerificationReport(
      'проверенная точка',
      { latitude: 52.0201, longitude: 47.8 },
    );

    expect(report.distanceFromExistingMeters).toBeGreaterThan(0);
    expect(report.distanceFromExistingMeters).toBeLessThan(100);
    expect(report.warning).toBeNull();
  });

  it('warns when proposed coordinates differ by more than 100 meters', () => {
    mockVerifiedLocation();

    const report = createManualCoordinateVerificationReport(
      'проверенная точка',
      { latitude: 52.022, longitude: 47.8 },
    );

    expect(report.distanceFromExistingMeters).toBeGreaterThan(100);
    expect(report.warning).toContain('WARNING');
  });

  it('prints an optional note without adding it to the snippet', async () => {
    const { dependencies } = createDependencies();
    const { output, stdout } = createOutput();

    await runLocationVerifyCli(
      [
        'мир',
        '--coords',
        '52.012345',
        '47.812345',
        '--note',
        'вход в кинотеатр',
      ],
      dependencies,
      output,
    );

    const rendered = stdout.mock.calls[0][0];
    expect(rendered).toContain('Note: вход в кинотеатр');
    expect(rendered.split('VERIFIED COORDINATE SNIPPET')[1]).not.toContain(
      'вход в кинотеатр',
    );
  });

  it('keeps the existing resolver mode when coordinates are omitted', async () => {
    const { dependencies, resolver, searchProvider } = createDependencies();
    const { output, stdout } = createOutput();
    resolver.resolve.mockResolvedValue({
      status: 'NOT_FOUND',
      normalizedQuery: 'мир',
      confidence: null,
      attemptedQueries: [],
      queryAttempts: [],
      rawCandidateCount: 0,
      acceptedCandidateCount: 0,
      reason: 'NO_CANDIDATES',
    });

    await expect(
      runLocationVerifyCli(['мир'], dependencies, output),
    ).resolves.toBe(0);
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    expect(searchProvider.search).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('FINAL RESOLVER RESULT'),
    );
  });

  it('parses STREET start, end, and repeated intermediate points', () => {
    expect(
      parseLocationVerifyArguments([
        'Улица Комарова',
        '--start',
        '52.001',
        '47.79',
        '--via',
        '52.005,47.795',
        '--via',
        '52.007,47.798',
        '--end',
        '52.01',
        '47.8',
      ]),
    ).toMatchObject({
      valid: true,
      coordinates: null,
      streetGeometry: {
        start: { latitude: 52.001, longitude: 47.79 },
        intermediate: [
          { latitude: 52.005, longitude: 47.795 },
          { latitude: 52.007, longitude: 47.798 },
        ],
        end: { latitude: 52.01, longitude: 47.8 },
      },
      areaGeometry: null,
    });
  });

  it('validates STREET geometry and prints a copyable snippet', () => {
    const report = createManualStreetGeometryVerificationReport(
      'Улица Комарова',
      {
        start: { latitude: 52.001, longitude: 47.79 },
        intermediate: [{ latitude: 52.005, longitude: 47.795 }],
        end: { latitude: 52.01, longitude: 47.8 },
      },
    );
    const rendered = formatManualStreetGeometryVerificationReport(report);

    expect(report).toMatchObject({
      valid: true,
      reason: null,
      pointsInsideSupportedBounds: true,
    });
    expect(rendered).toContain('STREET GEOMETRY SNIPPET');
    expect(rendered).toContain('streetGeometry: {');
    expect(rendered).toContain('intermediate: [');
  });

  it.each([
    [['Улица Комарова', '--start', '52.001', '47.79'], 'MISSING_STREET_END'],
    [['Улица Комарова', '--end', '52.01', '47.8'], 'MISSING_STREET_START'],
    [
      [
        'Улица Комарова',
        '--start',
        '52.001',
        '47.79',
        '--end',
        '52.01',
        '47.8',
        '--via',
        'bad',
      ],
      'INVALID_VIA',
    ],
  ])('rejects incomplete STREET arguments: %s', (args, error) => {
    expect(parseLocationVerifyArguments(args)).toEqual({
      valid: false,
      error,
    });
  });

  it('rejects STREET points outside coverage and consecutive duplicates', () => {
    expect(
      createManualStreetGeometryVerificationReport('Улица Комарова', {
        start: { latitude: 52.5, longitude: 47.8 },
        end: { latitude: 52.01, longitude: 47.8 },
      }),
    ).toMatchObject({ valid: false, reason: 'OUTSIDE_SUPPORTED_AREA' });

    expect(
      createManualStreetGeometryVerificationReport('Улица Комарова', {
        start: { latitude: 52.01, longitude: 47.8 },
        end: { latitude: 52.01, longitude: 47.8 },
      }),
    ).toMatchObject({
      valid: false,
      reason: 'DUPLICATE_CONSECUTIVE_POINTS',
      dictionarySnippet: null,
    });
  });

  it('rejects an implausibly long STREET segment inside the broad coverage bbox', () => {
    expect(
      createManualStreetGeometryVerificationReport('Улица Комарова', {
        start: { latitude: 51.82, longitude: 47.5 },
        end: { latitude: 52.25, longitude: 48.2 },
      }),
    ).toMatchObject({ valid: false, reason: 'STREET_SEGMENT_TOO_LONG' });
  });

  it('requires STREET mode to target a STREET canonical location', () => {
    expect(
      createManualStreetGeometryVerificationReport('мир', {
        start: { latitude: 52.01, longitude: 47.8 },
        end: { latitude: 52.02, longitude: 47.81 },
      }),
    ).toMatchObject({ valid: false, reason: 'INVALID_LOCATION_KIND' });
  });

  it('validates AREA center and radius and prints a copyable snippet', () => {
    const report = createManualAreaGeometryVerificationReport(
      '1-й микрорайон',
      {
        representativePoint: { latitude: 52.011126, longitude: 47.779402 },
        radiusMeters: 800,
      },
    );
    const rendered = formatManualAreaGeometryVerificationReport(report);

    expect(report).toMatchObject({
      valid: true,
      reason: null,
      centerInsideSupportedBounds: true,
    });
    expect(rendered).toContain('AREA GEOMETRY SNIPPET');
    expect(rendered).toContain('radiusMeters: 800');
  });

  it.each([0, -1, 10_001])(
    'rejects an invalid AREA radius: %s',
    (radiusMeters) => {
      expect(
        createManualAreaGeometryVerificationReport('1-й микрорайон', {
          representativePoint: { latitude: 52.011126, longitude: 47.779402 },
          radiusMeters,
        }),
      ).toMatchObject({ valid: false, reason: 'INVALID_RADIUS' });
    },
  );

  it('rejects an AREA center outside coverage', () => {
    expect(
      createManualAreaGeometryVerificationReport('1-й микрорайон', {
        representativePoint: { latitude: 55.75, longitude: 37.61 },
        radiusMeters: 800,
      }),
    ).toMatchObject({ valid: false, reason: 'OUTSIDE_SUPPORTED_AREA' });
  });

  it('does not call TomTom for STREET or AREA manual modes', async () => {
    const { dependencies, resolver, searchProvider } = createDependencies();
    const streetOutput = createOutput();
    const areaOutput = createOutput();

    await expect(
      runLocationVerifyCli(
        [
          'Улица Комарова',
          '--start',
          '52.001',
          '47.79',
          '--end',
          '52.01',
          '47.8',
        ],
        dependencies,
        streetOutput.output,
      ),
    ).resolves.toBe(0);
    await expect(
      runLocationVerifyCli(
        [
          '1-й микрорайон',
          '--center',
          '52.011126',
          '47.779402',
          '--radius',
          '800',
        ],
        dependencies,
        areaOutput.output,
      ),
    ).resolves.toBe(0);

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(searchProvider.search).not.toHaveBeenCalled();
    expect(streetOutput.stdout).toHaveBeenCalledWith(
      expect.stringContaining(
        'TomTom lookup skipped: manual street geometry supplied',
      ),
    );
    expect(areaOutput.stdout).toHaveBeenCalledWith(
      expect.stringContaining(
        'TomTom lookup skipped: manual area geometry supplied',
      ),
    );
  });

  it('rejects conflicting manual geometry modes', () => {
    expect(
      parseLocationVerifyArguments([
        'Улица Комарова',
        '--coords',
        '52.01',
        '47.8',
        '--start',
        '52.001',
        '47.79',
        '--end',
        '52.01',
        '47.8',
      ]),
    ).toEqual({ valid: false, error: 'CONFLICTING_GEOMETRY_MODES' });
  });
});
