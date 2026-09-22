import { isAbsolute } from 'node:path';

import { parseTelegramCorpusDryRunPath } from '../../../../scripts/telegram-corpus-dry-run';
import { parseTelegramHistoryFetchOptions } from '../../../../scripts/telegram-history-fetch';

describe('Telegram history CLI options', () => {
  it('parses a bounded fetch and resolves corpus paths', () => {
    const options = parseTelegramHistoryFetchOptions([
      '--limit',
      '500',
      '--corpus',
      'runtime-data/history.ndjson',
      '--metadata',
      'runtime-data/metadata.json',
    ]);

    expect(options.limit).toBe(500);
    expect(isAbsolute(options.corpusPath)).toBe(true);
    expect(isAbsolute(options.metadataPath)).toBe(true);
  });

  it('rejects an unsafe or malformed fetch limit', () => {
    expect(() => parseTelegramHistoryFetchOptions(['--limit', '5001'])).toThrow(
      'INVALID_ARGUMENTS',
    );
    expect(() => parseTelegramHistoryFetchOptions(['--limit'])).toThrow(
      'INVALID_ARGUMENTS',
    );
  });

  it('requires an explicit saved corpus for offline dry-run', () => {
    expect(
      parseTelegramCorpusDryRunPath(['--corpus', 'history.ndjson']),
    ).toMatch(/history\.ndjson$/u);
    expect(() => parseTelegramCorpusDryRunPath([])).toThrow(
      'INVALID_ARGUMENTS',
    );
  });
});
