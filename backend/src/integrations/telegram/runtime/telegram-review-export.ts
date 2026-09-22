import {
  type CellValue,
  type Fill,
  type Row,
  type Worksheet,
  Workbook,
} from 'exceljs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  TELEGRAM_REVIEW_LOG_FILE_NAMES,
  type TelegramReviewLogCategory,
} from './telegram-runtime-review.logger';

const OUTPUT_FILE_NAME = 'telegram-review.xlsx';

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

const UNKNOWN_LOCATION_HEADERS = [
  'Неизвестная локация',
  'Количество',
  'Типы событий',
  'Решения',
  'Пример 1',
  'Пример 2',
  'Пример 3',
] as const;

const SHEET_NAMES: Readonly<Record<TelegramReviewLogCategory, string>> = {
  matched: 'Совпадения',
  review: 'На проверку',
  ignored: 'Игнор',
};

const CATEGORIES: readonly TelegramReviewLogCategory[] = [
  'matched',
  'review',
  'ignored',
];

const LEGACY_CSV_FILE_NAMES = [
  'telegram-matched.csv',
  'telegram-review.csv',
  'telegram-ignored.csv',
  'telegram-unknown-locations.csv',
] as const;

const MAIN_COLUMN_WIDTHS = [
  21, 16, 52, 19, 16, 16, 21, 30, 29, 20, 32, 21, 20, 18, 21, 18, 15, 32, 25,
  29, 22,
] as const;

const UNKNOWN_COLUMN_WIDTHS = [30, 12, 24, 20, 46, 46, 46] as const;

const HEADER_FILL: Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF334155' },
};

const UNKNOWN_LOCATION_FILL: Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF2CC' },
};

const DECISION_FILLS: Readonly<Record<string, Fill>> = {
  CREATE: softFill('FFE2F0D9'),
  UPDATE: softFill('FFDDEBF7'),
  RESOLVE: softFill('FFE4DFEC'),
  REVIEW: softFill('FFFFF2CC'),
  IGNORE: softFill('FFE7E6E6'),
};

type NdjsonRecord = Readonly<Record<string, unknown>>;

interface ParsedSource {
  readonly records: readonly NdjsonRecord[];
  readonly malformedLines: number;
}

interface ExportedCategory {
  readonly records: readonly NdjsonRecord[];
  readonly duplicatesSkipped: number;
}

interface UnknownLocationAggregate {
  readonly unknownLocation: string;
  count: number;
  readonly eventTypes: Set<string>;
  readonly decisions: Set<string>;
  readonly examples: string[];
  readonly exampleKeys: Set<string>;
}

export interface TelegramReviewExportSummary {
  readonly matched: number;
  readonly review: number;
  readonly ignored: number;
  readonly unknownLocations: number;
  readonly malformedLines: number;
  readonly duplicatesSkipped: number;
  readonly outputFile: string;
}

export const exportTelegramReviewLogs = async (
  logDirectory: string,
): Promise<TelegramReviewExportSummary> => {
  const resolvedLogDirectory = resolve(logDirectory);
  const outputDirectory = resolve(resolvedLogDirectory, 'export');
  const outputFile = resolve(outputDirectory, OUTPUT_FILE_NAME);
  const exported = new Map<TelegramReviewLogCategory, ExportedCategory>();
  let malformedLines = 0;
  let duplicatesSkipped = 0;

  await mkdir(outputDirectory, { recursive: true });

  for (const category of CATEGORIES) {
    const source = await readNdjson(
      resolve(resolvedLogDirectory, TELEGRAM_REVIEW_LOG_FILE_NAMES[category]),
    );
    const categoryExport = deduplicateAndSort(source.records, category);

    malformedLines += source.malformedLines;
    duplicatesSkipped += categoryExport.duplicatesSkipped;
    exported.set(category, categoryExport);
  }

  const unknownLocations = aggregateUnknownLocations(exported);
  const workbook = createWorkbook(exported, unknownLocations);

  await workbook.xlsx.writeFile(outputFile);
  await Promise.all(
    LEGACY_CSV_FILE_NAMES.map((fileName) =>
      rm(resolve(outputDirectory, fileName), { force: true }),
    ),
  );

  return {
    matched: exported.get('matched')?.records.length ?? 0,
    review: exported.get('review')?.records.length ?? 0,
    ignored: exported.get('ignored')?.records.length ?? 0,
    unknownLocations: unknownLocations.length,
    malformedLines,
    duplicatesSkipped,
    outputFile,
  };
};

const createWorkbook = (
  exported: ReadonlyMap<TelegramReviewLogCategory, ExportedCategory>,
  unknownLocations: readonly UnknownLocationAggregate[],
): Workbook => {
  const workbook = new Workbook();
  workbook.creator = 'RoadRadar';
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const category of CATEGORIES) {
    const worksheet = workbook.addWorksheet(SHEET_NAMES[category]);
    populateMainSheet(worksheet, exported.get(category)?.records ?? []);
  }

  const unknownSheet = workbook.addWorksheet('Неизвестные локации');
  populateUnknownLocationsSheet(unknownSheet, unknownLocations);

  return workbook;
};

const populateMainSheet = (
  worksheet: Worksheet,
  records: readonly NdjsonRecord[],
): void => {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.columns = MAIN_COLUMN_WIDTHS.map((width) => ({ width }));
  worksheet.addRow([...MAIN_HEADERS]);
  styleHeader(worksheet.getRow(1));

  records.forEach((record) => {
    const row = worksheet.addRow(mainRowValues(record));
    styleMainRow(row);
  });

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, worksheet.rowCount), column: MAIN_HEADERS.length },
  };
};

const populateUnknownLocationsSheet = (
  worksheet: Worksheet,
  rows: readonly UnknownLocationAggregate[],
): void => {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.columns = UNKNOWN_COLUMN_WIDTHS.map((width) => ({ width }));
  worksheet.addRow([...UNKNOWN_LOCATION_HEADERS]);
  styleHeader(worksheet.getRow(1));

  rows.forEach((entry) => {
    const row = worksheet.addRow([
      entry.unknownLocation,
      entry.count,
      [...entry.eventTypes].sort().join(' | '),
      [...entry.decisions].sort().join(' | '),
      entry.examples[0] ?? null,
      entry.examples[1] ?? null,
      entry.examples[2] ?? null,
    ]);
    row.height = 32;
    row.alignment = { vertical: 'top' };
    row.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
    [5, 6, 7].forEach((column) => {
      row.getCell(column).alignment = { vertical: 'top', wrapText: true };
    });
    row.getCell(2).numFmt = '#,##0';
  });

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: {
      row: Math.max(1, worksheet.rowCount),
      column: UNKNOWN_LOCATION_HEADERS.length,
    },
  };
};

const mainRowValues = (record: NdjsonRecord): readonly CellValue[] => [
  dateValue(record),
  nullableString(record.externalMessageId),
  nullableString(singleLine(stringValue(record.text))),
  nullableString(record.eventType),
  nullableString(record.intent),
  nullableString(record.state),
  numericValue(record.parserConfidence),
  nullableString(locationsValue(record)),
  nullableString(record.canonicalLocation),
  nullableString(record.resolverStatus),
  nullableString(record.resolverReason),
  numericValue(record.locationConfidence),
  nullableString(record.locationPrecision),
  nullableString(record.geometryType),
  nullableString(record.geometryProvider),
  nullableString(record.geometryStatus),
  nullableString(record.decision),
  nullableString(record.decisionReason),
  nullableString(persistenceValue(record.persistenceResult)),
  nullableString(record.unknownLocationCandidate),
  nullableString(ingestionSourceValue(record.ingestionSource)),
];

const styleHeader = (row: Row): void => {
  row.height = 28;
  row.fill = HEADER_FILL;
  row.font = {
    name: 'Arial',
    size: 10,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  row.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };
};

const styleMainRow = (row: Row): void => {
  row.height = 36;
  row.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
  row.alignment = { vertical: 'top' };
  const decision = stringValue(row.getCell(17).value);
  const decisionFill = DECISION_FILLS[decision];

  if (decisionFill !== undefined) {
    row.fill = decisionFill;
  }

  [3, 8, 11, 18, 20].forEach((column) => {
    row.getCell(column).alignment = { vertical: 'top', wrapText: true };
  });
  row.getCell(1).numFmt = 'dd.mm.yyyy hh:mm:ss';
  row.getCell(7).numFmt = '0%';
  row.getCell(12).numFmt = '0%';

  if (stringValue(row.getCell(20).value).length > 0) {
    row.getCell(20).fill = UNKNOWN_LOCATION_FILL;
  }
};

const readNdjson = async (filePath: string): Promise<ParsedSource> => {
  const content = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (isMissingFileError(error)) {
      return '';
    }

    throw error;
  });
  const records: NdjsonRecord[] = [];
  let malformedLines = 0;

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(line);

      if (!isRecord(parsed)) {
        malformedLines += 1;
        continue;
      }

      records.push(parsed);
    } catch {
      malformedLines += 1;
    }
  }

  return { records, malformedLines };
};

const deduplicateAndSort = (
  records: readonly NdjsonRecord[],
  category: TelegramReviewLogCategory,
): ExportedCategory => {
  const seen = new Set<string>();
  const unique: NdjsonRecord[] = [];
  let duplicatesSkipped = 0;

  records.forEach((record, index) => {
    const messageId = stringValue(record.externalMessageId);
    const version = messageVersion(record);
    const key =
      messageId.length > 0 && version.length > 0
        ? `${messageId}\u0000${version}\u0000${category}`
        : `${category}\u0000row-${index}`;

    if (seen.has(key)) {
      duplicatesSkipped += 1;
      return;
    }

    seen.add(key);
    unique.push(record);
  });

  unique.sort(compareRecords);

  return { records: unique, duplicatesSkipped };
};

const compareRecords = (left: NdjsonRecord, right: NdjsonRecord): number => {
  const leftTime = sortableTime(left);
  const rightTime = sortableTime(right);

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return compareMessageIds(
    stringValue(left.externalMessageId),
    stringValue(right.externalMessageId),
  );
};

const sortableTime = (record: NdjsonRecord): number => {
  const timestamp = Date.parse(messageVersion(record));

  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

const aggregateUnknownLocations = (
  exported: ReadonlyMap<TelegramReviewLogCategory, ExportedCategory>,
): readonly UnknownLocationAggregate[] => {
  const aggregates = new Map<string, UnknownLocationAggregate>();
  const seenMessageVersions = new Set<string>();

  for (const category of CATEGORIES) {
    const records = exported.get(category)?.records ?? [];

    records.forEach((record, index) => {
      const candidate = stringValue(record.unknownLocationCandidate).trim();

      if (candidate.length === 0) {
        return;
      }

      const messageId = stringValue(record.externalMessageId);
      const version = messageVersion(record);
      const messageKey =
        messageId.length > 0 && version.length > 0
          ? `${messageId}\u0000${version}`
          : `${category}\u0000row-${index}`;

      if (seenMessageVersions.has(messageKey)) {
        return;
      }

      seenMessageVersions.add(messageKey);
      const normalizedCandidate = candidate.toLocaleLowerCase('ru-RU');
      const aggregate = aggregates.get(normalizedCandidate) ?? {
        unknownLocation: normalizedCandidate,
        count: 0,
        eventTypes: new Set<string>(),
        decisions: new Set<string>(),
        examples: [],
        exampleKeys: new Set<string>(),
      };

      aggregate.count += 1;
      addNonEmpty(aggregate.eventTypes, stringValue(record.eventType));
      addNonEmpty(aggregate.decisions, stringValue(record.decision));
      addExample(aggregate, singleLine(stringValue(record.text)));
      aggregates.set(normalizedCandidate, aggregate);
    });
  }

  return [...aggregates.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.unknownLocation.localeCompare(right.unknownLocation, 'ru'),
  );
};

const locationsValue = (record: NdjsonRecord): string => {
  if (Array.isArray(record.locations)) {
    const locations = record.locations
      .map((location) =>
        isRecord(location) ? stringValue(location.text).trim() : '',
      )
      .filter((location) => location.length > 0);

    if (locations.length > 0) {
      return locations.join(' | ');
    }
  }

  return stringValue(record.locationInput);
};

const persistenceValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (!isRecord(value)) {
    return '';
  }

  const status = stringValue(value.status);
  const reason = stringValue(value.reason);

  return reason.length > 0 ? `${status}: ${reason}` : status;
};

const dateValue = (record: NdjsonRecord): Date | null => {
  const timestamp = Date.parse(messageVersion(record));

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

const messageVersion = (record: NdjsonRecord): string =>
  stringValue(record.messageVersion) || stringValue(record.messageTimestamp);

const numericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const nullableString = (value: unknown): string | null => {
  const result = stringValue(value);

  return result.length > 0 ? result : null;
};

const ingestionSourceValue = (value: unknown): string => {
  if (value === 'LIVE') return 'Live';
  if (value === 'RECOVERY') return 'Восстановление';

  return '';
};

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const singleLine = (value: string): string =>
  value
    .replace(/[\r\n]+/gu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();

const addNonEmpty = (values: Set<string>, value: string): void => {
  if (value.length > 0) {
    values.add(value);
  }
};

const addExample = (
  aggregate: UnknownLocationAggregate,
  example: string,
): void => {
  if (example.length === 0 || aggregate.examples.length >= 3) {
    return;
  }

  const key = example.toLocaleLowerCase('ru-RU');

  if (aggregate.exampleKeys.has(key)) {
    return;
  }

  aggregate.exampleKeys.add(key);
  aggregate.examples.push(example);
};

function softFill(argb: string): Fill {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  };
}

const compareMessageIds = (left: string, right: string): number => {
  if (/^\d+$/u.test(left) && /^\d+$/u.test(right)) {
    const leftId = BigInt(left);
    const rightId = BigInt(right);

    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  }

  return left.localeCompare(right, 'ru');
};

const isRecord = (value: unknown): value is NdjsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';
