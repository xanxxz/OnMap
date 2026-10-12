import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../database/prisma.service';
import { sanitizeTelegramSourceText } from '../../../road-events/telegram-source-text';
import {
  cleanupTelegramDiagnosticFiles,
  restrictTelegramDiagnosticFilePermissions,
} from './telegram-file-retention';
import {
  TELEGRAM_RETENTION_BATCH_SIZE,
  TELEGRAM_RETENTION_CLEANUP_ENABLED_ENV,
  TELEGRAM_RETENTION_MS,
  TELEGRAM_RETENTION_SAMPLE_LIMIT,
  TELEGRAM_RETENTION_SWEEP_INTERVAL_MS,
} from './telegram-retention.constants';

interface RetentionRow {
  readonly id: string;
  readonly sourceText: string | null;
  readonly locationLabel: string | null;
}

export interface TelegramDatabaseRetentionResult {
  readonly rowsScanned: number;
  readonly rowsChanged: number;
  readonly sourceTextFieldsChanged: number;
  readonly locationLabelFieldsChanged: number;
  readonly sample: readonly {
    readonly id: string;
    readonly fields: readonly ('source_text' | 'location_label')[];
  }[];
}

export interface TelegramRetentionDryRunResult {
  readonly cutoff: string;
  readonly database: TelegramDatabaseRetentionResult;
  readonly files: Awaited<ReturnType<typeof cleanupTelegramDiagnosticFiles>>;
}

@Injectable()
export class TelegramRetentionCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramRetentionCleanupService.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap(): void {
    void restrictTelegramDiagnosticFilePermissions(process.cwd()).catch(() => {
      this.logger.warn(
        'Telegram diagnostic file permissions could not be restricted',
      );
    });
    const enabled = this.configService.get<string | boolean>(
      TELEGRAM_RETENTION_CLEANUP_ENABLED_ENV,
    );
    if (
      enabled !== true &&
      !(typeof enabled === 'string' && enabled.trim().toLowerCase() === 'true')
    ) {
      return;
    }

    void this.runSafely();
    this.timer = setInterval(
      () => void this.runSafely(),
      TELEGRAM_RETENTION_SWEEP_INTERVAL_MS,
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  async dryRun(now = new Date()): Promise<TelegramRetentionDryRunResult> {
    const cutoff = new Date(now.getTime() - TELEGRAM_RETENTION_MS);
    const [database, files] = await Promise.all([
      this.scanDatabaseForRetention(cutoff),
      cleanupTelegramDiagnosticFiles({
        backendRoot: process.cwd(),
        now,
        dryRun: true,
      }),
    ]);

    return { cutoff: cutoff.toISOString(), database, files };
  }

  async cleanupOnce(now = new Date()): Promise<TelegramRetentionDryRunResult> {
    const cutoff = new Date(now.getTime() - TELEGRAM_RETENTION_MS);
    const database = await this.applyDatabaseRetention(cutoff);
    const files = await cleanupTelegramDiagnosticFiles({
      backendRoot: process.cwd(),
      now,
    });

    return { cutoff: cutoff.toISOString(), database, files };
  }

  private async runSafely(): Promise<void> {
    if (this.running !== undefined) {
      return this.running;
    }

    this.running = this.cleanupOnce()
      .then((result) => {
        this.logger.log(
          `Telegram retention cleanup completed: ${result.database.rowsChanged} database row(s), ${result.files.expiredCorpusMessages} corpus message(s), ${result.files.expiredDiagnosticRecords} diagnostic record(s), ${result.files.expiredFiles} file(s)`,
        );
      })
      .catch(() => {
        this.logger.warn(
          'Telegram retention cleanup failed; no message content logged',
        );
      })
      .finally(() => {
        this.running = undefined;
      });

    return this.running;
  }

  async scanDatabaseForRetention(
    cutoff: Date,
  ): Promise<TelegramDatabaseRetentionResult> {
    let cursor: string | null = null;
    const result = emptyDatabaseResult();

    while (true) {
      const rows: RetentionRow[] = await this.prisma.$queryRaw<RetentionRow[]>`
        SELECT
          id::text AS "id",
          source_text AS "sourceText",
          location_label AS "locationLabel"
        FROM road_events
        WHERE
          source = 'TELEGRAM'::"RoadEventSource"
          AND status = 'RESOLVED'::"RoadEventStatus"
          AND updated_at <= ${cutoff}
          AND (source_text IS NOT NULL OR location_label IS NOT NULL)
          AND (${cursor}::text IS NULL OR id::text > ${cursor})
        ORDER BY id::text
        LIMIT ${TELEGRAM_RETENTION_BATCH_SIZE}
      `;
      if (rows.length === 0) {
        break;
      }

      addScannedRows(result, rows);
      cursor = rows.at(-1)?.id ?? cursor;
      if (rows.length < TELEGRAM_RETENTION_BATCH_SIZE) {
        break;
      }
    }

    return result;
  }

  async applyDatabaseRetention(
    cutoff: Date,
  ): Promise<TelegramDatabaseRetentionResult> {
    let cursor: string | null = null;
    const result = emptyDatabaseResult();

    while (true) {
      const rows = await this.prisma.$transaction(async (transaction) => {
        const batch: RetentionRow[] = await transaction.$queryRaw<
          RetentionRow[]
        >`
          SELECT
            id::text AS "id",
            source_text AS "sourceText",
            location_label AS "locationLabel"
          FROM road_events
          WHERE
            source = 'TELEGRAM'::"RoadEventSource"
            AND status = 'RESOLVED'::"RoadEventStatus"
            AND updated_at <= ${cutoff}
            AND (source_text IS NOT NULL OR location_label IS NOT NULL)
            AND (${cursor}::text IS NULL OR id::text > ${cursor})
          ORDER BY id::text
          LIMIT ${TELEGRAM_RETENTION_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        `;

        for (const row of batch) {
          const cleaned = cleanRetentionFields(row);
          const fields = changedFields(row, cleaned);
          if (fields.length === 0) {
            continue;
          }

          await transaction.$executeRaw`
            UPDATE road_events
            SET
              source_text = ${cleaned.sourceText},
              location_label = ${cleaned.locationLabel}
            WHERE
              id = ${row.id}::uuid
              AND source = 'TELEGRAM'::"RoadEventSource"
              AND status = 'RESOLVED'::"RoadEventStatus"
              AND updated_at <= ${cutoff}
          `;
          addChangedRow(result, row.id, fields);
        }

        return batch;
      });

      addScannedRows(result, rows, false);
      if (rows.length === 0) {
        break;
      }
      cursor = rows.at(-1)?.id ?? cursor;
      if (rows.length < TELEGRAM_RETENTION_BATCH_SIZE) {
        break;
      }
    }

    return result;
  }
}

type MutableResult = {
  rowsScanned: number;
  rowsChanged: number;
  sourceTextFieldsChanged: number;
  locationLabelFieldsChanged: number;
  sample: Array<{
    id: string;
    fields: ('source_text' | 'location_label')[];
  }>;
};

const emptyDatabaseResult = (): MutableResult => ({
  rowsScanned: 0,
  rowsChanged: 0,
  sourceTextFieldsChanged: 0,
  locationLabelFieldsChanged: 0,
  sample: [],
});

const cleanRetentionFields = (row: RetentionRow) => ({
  sourceText:
    row.sourceText === null
      ? null
      : (sanitizeTelegramSourceText(row.sourceText) ?? null),
  locationLabel:
    row.locationLabel === null
      ? null
      : (sanitizeTelegramSourceText(row.locationLabel) ?? null),
});

const changedFields = (
  row: RetentionRow,
  cleaned: ReturnType<typeof cleanRetentionFields>,
): ('source_text' | 'location_label')[] => [
  ...(row.sourceText !== cleaned.sourceText ? (['source_text'] as const) : []),
  ...(row.locationLabel !== cleaned.locationLabel
    ? (['location_label'] as const)
    : []),
];

const addScannedRows = (
  result: MutableResult,
  rows: readonly RetentionRow[],
  calculateChanges = true,
): void => {
  result.rowsScanned += rows.length;
  if (!calculateChanges) {
    return;
  }

  for (const row of rows) {
    addChangedRow(
      result,
      row.id,
      changedFields(row, cleanRetentionFields(row)),
    );
  }
};

const addChangedRow = (
  result: MutableResult,
  id: string,
  fields: readonly ('source_text' | 'location_label')[],
): void => {
  if (fields.length === 0) {
    return;
  }
  result.rowsChanged += 1;
  if (fields.includes('source_text')) {
    result.sourceTextFieldsChanged += 1;
  }
  if (fields.includes('location_label')) {
    result.locationLabelFieldsChanged += 1;
  }
  if (result.sample.length < TELEGRAM_RETENTION_SAMPLE_LIMIT) {
    result.sample.push({ id, fields: [...fields] });
  }
};
