export const TELEGRAM_INGESTION_APPLY_DEFAULT_LIMIT = 50;
export const TELEGRAM_INGESTION_APPLY_MAX_LIMIT = 1_000;
export const TELEGRAM_INGESTION_APPLY_USAGE =
  'Usage: npm run telegram:ingestion-apply -- [--limit <1..1000>] [--dry-run | --apply]';

export interface TelegramIngestionApplyOptions {
  readonly limit: number;
  readonly mode: 'DRY_RUN' | 'APPLY';
}

export const parseTelegramIngestionApplyOptions = (
  args: readonly string[],
): TelegramIngestionApplyOptions => {
  let limit = TELEGRAM_INGESTION_APPLY_DEFAULT_LIMIT;
  let mode: TelegramIngestionApplyOptions['mode'] | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--dry-run' || argument === '--apply') {
      const requestedMode = argument === '--apply' ? 'APPLY' : 'DRY_RUN';

      if (mode !== null && mode !== requestedMode) {
        throw new Error('MUTUALLY_EXCLUSIVE_MODES');
      }

      mode = requestedMode;
      continue;
    }

    if (argument === '--limit') {
      const value = args[index + 1];
      const parsed = Number(value);

      if (
        value === undefined ||
        !Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        parsed > TELEGRAM_INGESTION_APPLY_MAX_LIMIT
      ) {
        throw new Error('INVALID_LIMIT');
      }

      limit = parsed;
      index += 1;
      continue;
    }

    throw new Error('INVALID_ARGUMENTS');
  }

  return { limit, mode: mode ?? 'DRY_RUN' };
};
