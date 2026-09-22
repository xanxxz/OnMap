import {
  parseTelegramIngestionApplyOptions,
  TELEGRAM_INGESTION_APPLY_DEFAULT_LIMIT,
} from './telegram-ingestion-apply-options';

describe('parseTelegramIngestionApplyOptions', () => {
  it('defaults to dry-run mode', () => {
    expect(parseTelegramIngestionApplyOptions([])).toEqual({
      limit: TELEGRAM_INGESTION_APPLY_DEFAULT_LIMIT,
      mode: 'DRY_RUN',
    });
  });

  it('accepts explicit dry-run with a limit', () => {
    expect(
      parseTelegramIngestionApplyOptions(['--limit', '50', '--dry-run']),
    ).toEqual({ limit: 50, mode: 'DRY_RUN' });
  });

  it('requires explicit apply mode for mutation', () => {
    expect(
      parseTelegramIngestionApplyOptions(['--apply', '--limit', '25']),
    ).toEqual({ limit: 25, mode: 'APPLY' });
  });

  it('rejects simultaneous dry-run and apply', () => {
    expect(() =>
      parseTelegramIngestionApplyOptions(['--dry-run', '--apply']),
    ).toThrow('MUTUALLY_EXCLUSIVE_MODES');
  });

  it.each(['0', '1001', '1.5', 'invalid'])(
    'rejects invalid limit %s',
    (limit) => {
      expect(() =>
        parseTelegramIngestionApplyOptions(['--limit', limit]),
      ).toThrow('INVALID_LIMIT');
    },
  );
});
