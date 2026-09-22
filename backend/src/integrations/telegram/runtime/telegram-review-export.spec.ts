import { Workbook, type Worksheet } from 'exceljs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exportTelegramReviewLogs } from './telegram-review-export';
import {
  TELEGRAM_REVIEW_LOG_FILE_NAMES,
  type TelegramReviewLogCategory,
} from './telegram-runtime-review.logger';

type FixtureRecord = Readonly<Record<string, unknown>>;

const MAIN_HEADERS = [
  'Время',
  'ID сообщения',
  'Текст',
  'Тип события',
  'Намерение',
  'Состояние',
  'Уверенность парсера',
  'Локация',
  'Каноническая локация',
  'Статус резолвера',
  'Причина резолвера',
  'Уверенность локации',
  'Точность локации',
  'Тип геометрии',
  'Провайдер геометрии',
  'Статус геометрии',
  'Решение',
  'Причина решения',
  'Результат БД',
  'Неизвестная локация',
  'Источник обработки',
] as const;

const fixture = (overrides: FixtureRecord = {}): FixtureRecord => ({
  loggedAt: '2026-09-07T18:40:00.000Z',
  ingestionSource: 'LIVE',
  externalMessageId: '101',
  cityId: 'balakovo',
  messageTimestamp: '2026-09-07T18:32:00.000Z',
  messageVersion: '2026-09-07T18:32:25.000Z',
  rawSourceType: 'message',
  text: 'авария на комарова',
  eventType: 'ACCIDENT',
  intent: 'REPORT',
  state: 'ACTIVE',
  matched: true,
  parserConfidence: 0.86,
  contextUsed: false,
  replyContextUsed: false,
  locationInput: 'комарова',
  locations: [{ text: 'Улица Комарова', alias: 'komarova' }],
  canonicalLocation: 'Улица Комарова',
  resolverStatus: 'RESOLVED',
  resolverReason: null,
  locationConfidence: 0.99,
  locationPrecision: 'STREET',
  geometryType: 'MultiLineString',
  geometryProvider: 'OSM',
  geometryStatus: 'RESOLVED',
  decision: 'CREATE',
  decisionReason: 'READY_TO_CREATE',
  persistenceResult: { status: 'CREATED', reason: null },
  unknownLocationCandidate: null,
  ...overrides,
});

describe('exportTelegramReviewLogs', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'roadradar-review-export-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const writeSource = async (
    category: TelegramReviewLogCategory,
    records: readonly (FixtureRecord | string)[],
  ): Promise<void> => {
    await writeFile(
      join(directory, TELEGRAM_REVIEW_LOG_FILE_NAMES[category]),
      records
        .map((record) =>
          typeof record === 'string' ? record : JSON.stringify(record),
        )
        .join('\n'),
      'utf8',
    );
  };

  const exportAndLoad = async () => {
    const summary = await exportTelegramReviewLogs(directory);
    const workbook = new Workbook();
    await workbook.xlsx.readFile(summary.outputFile);

    return { summary, workbook };
  };

  const sheet = (workbook: Workbook, name: string): Worksheet => {
    const worksheet = workbook.getWorksheet(name);

    if (worksheet === undefined) {
      throw new Error(`Missing worksheet: ${name}`);
    }

    return worksheet;
  };

  it('creates one XLSX workbook and removes legacy CSV artifacts', async () => {
    const exportDirectory = join(directory, 'export');
    await mkdir(exportDirectory, { recursive: true });
    await writeFile(join(exportDirectory, 'telegram-matched.csv'), 'legacy');

    const { summary } = await exportAndLoad();

    expect(summary.outputFile).toBe(
      join(exportDirectory, 'telegram-review.xlsx'),
    );
    expect(await readdir(exportDirectory)).toEqual(['telegram-review.xlsx']);
  });

  it('creates four sheets with Russian names', async () => {
    const { workbook } = await exportAndLoad();

    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      'Совпадения',
      'На проверку',
      'Игнор',
      'Неизвестные локации',
    ]);
  });

  it('uses fully Russian headers on main sheets', async () => {
    const { workbook } = await exportAndLoad();

    for (const name of ['Совпадения', 'На проверку', 'Игнор']) {
      expect(sheet(workbook, name).getRow(1).values).toEqual([
        undefined,
        ...MAIN_HEADERS,
      ]);
    }
  });

  it.each([
    ['matched', 'Совпадения'],
    ['review', 'На проверку'],
    ['ignored', 'Игнор'],
  ] as const)('routes %s records to %s', async (category, sheetName) => {
    await writeSource(category, [fixture()]);

    const { workbook } = await exportAndLoad();

    expect(sheet(workbook, sheetName).getCell('C2').value).toBe(
      'авария на комарова',
    );
  });

  it('aggregates unknown locations case-insensitively after trim', async () => {
    await writeSource('review', [
      fixture({
        externalMessageId: '201',
        unknownLocationCandidate: ' Генезис ',
      }),
      fixture({
        externalMessageId: '202',
        unknownLocationCandidate: 'генезис',
      }),
    ]);

    const { summary, workbook } = await exportAndLoad();
    const unknown = sheet(workbook, 'Неизвестные локации');

    expect(summary.unknownLocations).toBe(1);
    expect(unknown.getCell('A2').value).toBe('генезис');
    expect(unknown.getCell('B2').value).toBe(2);
  });

  it('keeps at most three unique examples for an unknown location', async () => {
    await writeSource(
      'review',
      ['один', 'два', 'два', 'три', 'четыре'].map((text, index) =>
        fixture({
          externalMessageId: String(300 + index),
          text,
          unknownLocationCandidate: 'место',
        }),
      ),
    );

    const { workbook } = await exportAndLoad();
    const unknown = sheet(workbook, 'Неизвестные локации');

    expect([
      unknown.getCell('E2').value,
      unknown.getCell('F2').value,
      unknown.getCell('G2').value,
    ]).toEqual(['один', 'два', 'три']);
  });

  it('sorts unknown locations by count descending and then alphabetically', async () => {
    await writeSource('review', [
      fixture({ externalMessageId: '1', unknownLocationCandidate: 'альфа' }),
      fixture({ externalMessageId: '2', unknownLocationCandidate: 'бета' }),
      fixture({ externalMessageId: '3', unknownLocationCandidate: 'бета' }),
      fixture({ externalMessageId: '4', unknownLocationCandidate: 'абрикос' }),
    ]);

    const { workbook } = await exportAndLoad();
    const unknown = sheet(workbook, 'Неизвестные локации');

    expect(
      ['A2', 'A3', 'A4'].map((cell) => unknown.getCell(cell).value),
    ).toEqual(['бета', 'абрикос', 'альфа']);
  });

  it('preserves Russian text', async () => {
    await writeSource('matched', [fixture({ text: 'Шлюзы свободны' })]);

    const { workbook } = await exportAndLoad();

    expect(sheet(workbook, 'Совпадения').getCell('C2').value).toBe(
      'Шлюзы свободны',
    );
  });

  it('writes messageVersion as a real date before messageTimestamp', async () => {
    await writeSource('matched', [fixture()]);

    const { workbook } = await exportAndLoad();
    const cell = sheet(workbook, 'Совпадения').getCell('A2');

    expect(cell.value).toBeInstanceOf(Date);
    expect((cell.value as Date).toISOString()).toBe('2026-09-07T18:32:25.000Z');
    expect(cell.numFmt).toBe('dd.mm.yyyy hh:mm:ss');
  });

  it('falls back to messageTimestamp when messageVersion is absent', async () => {
    await writeSource('matched', [fixture({ messageVersion: undefined })]);

    const { workbook } = await exportAndLoad();

    expect(
      (sheet(workbook, 'Совпадения').getCell('A2').value as Date).toISOString(),
    ).toBe('2026-09-07T18:32:00.000Z');
  });

  it('writes confidence as numeric percentages', async () => {
    await writeSource('matched', [fixture()]);

    const { workbook } = await exportAndLoad();
    const matched = sheet(workbook, 'Совпадения');

    expect(matched.getCell('G2').value).toBe(0.86);
    expect(matched.getCell('G2').numFmt).toBe('0%');
    expect(matched.getCell('L2').value).toBe(0.99);
    expect(matched.getCell('L2').numFmt).toBe('0%');
  });

  it('keeps null values as empty cells', async () => {
    await writeSource('matched', [
      fixture({
        canonicalLocation: null,
        resolverReason: null,
        locationConfidence: null,
        persistenceResult: null,
        unknownLocationCandidate: null,
      }),
    ]);

    const { workbook } = await exportAndLoad();
    const matched = sheet(workbook, 'Совпадения');

    expect(matched.getCell('I2').value).toBeNull();
    expect(matched.getCell('K2').value).toBeNull();
    expect(matched.getCell('L2').value).toBeNull();
    expect(matched.getCell('S2').value).toBeNull();
    expect(matched.getCell('T2').value).toBeNull();
  });

  it('joins multiple locations with a pipe', async () => {
    await writeSource('matched', [
      fixture({
        locations: [
          { text: 'Генезис', alias: 'genesis' },
          { text: 'Остановка у 38-го училища', alias: null },
        ],
      }),
    ]);

    const { workbook } = await exportAndLoad();

    expect(sheet(workbook, 'Совпадения').getCell('H2').value).toBe(
      'Генезис | Остановка у 38-го училища',
    );
  });

  it('deduplicates the same message version in one category', async () => {
    const record = fixture();
    await writeSource('matched', [record, record]);

    const { summary, workbook } = await exportAndLoad();

    expect(summary.matched).toBe(1);
    expect(summary.duplicatesSkipped).toBe(1);
    expect(sheet(workbook, 'Совпадения').rowCount).toBe(2);
  });

  it('keeps an edited version as a separate row', async () => {
    await writeSource('matched', [
      fixture(),
      fixture({ messageVersion: '2026-09-07T18:35:00.000Z' }),
    ]);

    const { summary, workbook } = await exportAndLoad();

    expect(summary.matched).toBe(2);
    expect(sheet(workbook, 'Совпадения').rowCount).toBe(3);
  });

  it('skips malformed NDJSON and continues', async () => {
    await writeSource('matched', [fixture(), '{not-json', '42']);

    const { summary } = await exportAndLoad();

    expect(summary.matched).toBe(1);
    expect(summary.malformedLines).toBe(2);
  });

  it('creates header-only sheets for missing and empty sources', async () => {
    await writeSource('matched', []);

    const { workbook } = await exportAndLoad();

    expect(sheet(workbook, 'Совпадения').rowCount).toBe(1);
    expect(sheet(workbook, 'На проверку').rowCount).toBe(1);
    expect(sheet(workbook, 'Игнор').rowCount).toBe(1);
  });

  it('adds autofilters and freezes the first row on all sheets', async () => {
    const { workbook } = await exportAndLoad();

    workbook.worksheets.forEach((worksheet) => {
      expect(worksheet.autoFilter).toBeDefined();
      expect(worksheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    });
  });

  it('does not export sensitive fields', async () => {
    await writeSource('matched', [
      fixture({
        authorName: 'Private Author',
        username: 'private_user',
        phone: '+79990000000',
        userId: 'private-user-id',
        sourceChatId: '-100-secret',
        session: 'private-session',
        apiHash: 'private-api-hash',
        authKey: 'private-auth-key',
      }),
    ]);

    const { workbook } = await exportAndLoad();
    const exportedValues = workbook.worksheets.flatMap((worksheet) =>
      worksheet.getSheetValues(),
    );

    expect(JSON.stringify(exportedValues)).not.toMatch(
      /Private Author|private_user|private-user-id|-100-secret|private-session|private-api-hash|private-auth-key/u,
    );
  });

  it('sorts main rows by time and then numeric message ID', async () => {
    await writeSource('matched', [
      fixture({ externalMessageId: '10' }),
      fixture({ externalMessageId: '2' }),
      fixture({
        externalMessageId: '3',
        messageVersion: '2026-09-07T18:33:00.000Z',
      }),
    ]);

    const { workbook } = await exportAndLoad();
    const matched = sheet(workbook, 'Совпадения');

    expect(
      ['B2', 'B3', 'B4'].map((cell) => matched.getCell(cell).value),
    ).toEqual(['2', '10', '3']);
  });

  it('maps ingestion source and supports legacy records', async () => {
    await writeSource('matched', [
      fixture({ externalMessageId: '101', ingestionSource: 'LIVE' }),
      fixture({ externalMessageId: '102', ingestionSource: 'RECOVERY' }),
      fixture({ externalMessageId: '103', ingestionSource: undefined }),
    ]);

    const { workbook } = await exportAndLoad();
    const matched = sheet(workbook, 'Совпадения');

    expect(
      ['U2', 'U3', 'U4'].map((cell) => matched.getCell(cell).value),
    ).toEqual(['Live', 'Восстановление', null]);
  });

  it('applies soft decision and unknown-location highlighting', async () => {
    await writeSource('review', [
      fixture({ decision: 'REVIEW', unknownLocationCandidate: 'генезис' }),
    ]);

    const { workbook } = await exportAndLoad();
    const review = sheet(workbook, 'На проверку');

    expect(review.getCell('A2').fill).toMatchObject({ type: 'pattern' });
    expect(review.getCell('T2').fill).toMatchObject({
      type: 'pattern',
      fgColor: { argb: 'FFFFF2CC' },
    });
  });

  it('exports approximate geometry diagnostics and keeps legacy fields empty', async () => {
    await writeSource('matched', [
      fixture(),
      fixture({
        externalMessageId: '102',
        locationPrecision: undefined,
        geometryType: undefined,
        geometryProvider: undefined,
        geometryStatus: undefined,
      }),
    ]);

    const { workbook } = await exportAndLoad();
    const matched = sheet(workbook, 'Совпадения');

    expect(
      ['M2', 'N2', 'O2', 'P2'].map((cell) => matched.getCell(cell).value),
    ).toEqual(['STREET', 'MultiLineString', 'OSM', 'RESOLVED']);
    expect(
      ['M3', 'N3', 'O3', 'P3'].map((cell) => matched.getCell(cell).value),
    ).toEqual([null, null, null, null]);
  });

  it('counts an unknown message once across overlapping categories', async () => {
    const record = fixture({ unknownLocationCandidate: 'генезис' });
    await writeSource('matched', [record]);
    await writeSource('review', [record]);

    const { workbook } = await exportAndLoad();

    expect(sheet(workbook, 'Неизвестные локации').getCell('B2').value).toBe(1);
  });
});
