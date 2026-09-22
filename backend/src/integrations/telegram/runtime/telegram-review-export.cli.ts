import 'dotenv/config';

import { relative, resolve } from 'node:path';

import {
  TELEGRAM_REVIEW_LOG_DIR_DEFAULT,
  TELEGRAM_REVIEW_LOG_DIR_ENV,
} from './telegram-ingestion-runtime.constants';
import { exportTelegramReviewLogs } from './telegram-review-export';

export const runTelegramReviewExportCli = async (): Promise<void> => {
  const configuredDirectory = process.env[TELEGRAM_REVIEW_LOG_DIR_ENV]?.trim();
  const logDirectory = resolve(
    process.cwd(),
    configuredDirectory || TELEGRAM_REVIEW_LOG_DIR_DEFAULT,
  );
  const summary = await exportTelegramReviewLogs(logDirectory);
  const displayOutput = relative(process.cwd(), summary.outputFile);

  process.stdout.write(
    [
      'Telegram review export complete',
      '',
      `Совпадения: ${summary.matched}`,
      `На проверку: ${summary.review}`,
      `Игнор: ${summary.ignored}`,
      `Неизвестные локации: ${summary.unknownLocations}`,
      `Дубликаты пропущены: ${summary.duplicatesSkipped}`,
      `Повреждённые строки пропущены: ${summary.malformedLines}`,
      '',
      `Файл: ${displayOutput}`,
      '',
    ].join('\n'),
  );
};

if (require.main === module) {
  void runTelegramReviewExportCli().catch(() => {
    process.stderr.write('Telegram review export failed\n');
    process.exitCode = 1;
  });
}
