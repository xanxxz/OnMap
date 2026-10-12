import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TelegramHistoryCorpusStore } from '../history/telegram-history-corpus.store';
import {
  cleanupTelegramDiagnosticFiles,
  restrictTelegramDiagnosticFilePermissions,
} from './telegram-file-retention';
import { TELEGRAM_RETENTION_MS } from './telegram-retention.constants';

describe('cleanupTelegramDiagnosticFiles', () => {
  let backendRoot: string;
  const now = new Date('2026-09-26T12:00:00.000Z');

  beforeEach(async () => {
    backendRoot = await mkdtemp(join(tmpdir(), 'telegram-retention-'));
    await mkdir(join(backendRoot, 'runtime-data/telegram/corpus'), {
      recursive: true,
    });
    await mkdir(join(backendRoot, 'runtime-logs/telegram/export'), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(backendRoot, { recursive: true, force: true });
  });

  it('uses savedAt, not publishedAt, and treats the 30-day boundary as expired', async () => {
    const corpusPath = join(
      backendRoot,
      'runtime-data/telegram/corpus/history.ndjson',
    );
    const expiredSavedAt = new Date(now.getTime() - TELEGRAM_RETENTION_MS);
    const recentSavedAt = new Date(expiredSavedAt.getTime() + 1);
    const lines = [
      JSON.stringify({
        source: 'TELEGRAM',
        cityId: 'balakovo',
        chatId: '-1001',
        externalId: 'old-message',
        publishedAt: '2020-01-01T00:00:00.000Z',
        savedAt: recentSavedAt.toISOString(),
        text: 'secret raw text must not appear in output',
        rawSourceType: 'message',
      }),
      JSON.stringify({
        source: 'TELEGRAM',
        cityId: 'balakovo',
        chatId: '-1001',
        externalId: 'expired-message',
        publishedAt: '2026-09-25T00:00:00.000Z',
        savedAt: expiredSavedAt.toISOString(),
        text: 'expired secret raw text',
        rawSourceType: 'message',
      }),
    ];
    await writeFile(corpusPath, `${lines.join('\n')}\n`);

    const dryRun = await cleanupTelegramDiagnosticFiles({
      backendRoot,
      now,
      dryRun: true,
    });

    expect(dryRun.expiredCorpusMessages).toBe(1);
    expect(JSON.stringify(dryRun)).not.toContain('secret raw text');
    expect((await readFile(corpusPath, 'utf8')).split('\n')).toHaveLength(3);

    const applied = await cleanupTelegramDiagnosticFiles({ backendRoot, now });
    expect(applied.expiredCorpusMessages).toBe(1);
    const remaining = await readFile(corpusPath, 'utf8');
    expect(remaining).toContain('old-message');
    expect(remaining).not.toContain('expired-message');
    await expect(
      new TelegramHistoryCorpusStore().read(corpusPath),
    ).resolves.toHaveLength(1);
  });

  it('cleans expired rotated NDJSON, XLSX, and stale temporary files only inside approved directories', async () => {
    const oldTime = new Date(now.getTime() - TELEGRAM_RETENTION_MS - 1);
    const files = [
      join(backendRoot, 'runtime-logs/telegram/telegram-review.ndjson.1'),
      join(backendRoot, 'runtime-logs/telegram/export/telegram-review.xlsx'),
      join(backendRoot, 'runtime-logs/telegram/stale.tmp'),
      join(backendRoot, 'outside/keep.ndjson'),
    ];
    await mkdir(join(backendRoot, 'outside'), { recursive: true });
    await Promise.all(
      files.map((file, index) =>
        writeFile(
          file,
          index === 0
            ? `${JSON.stringify({ loggedAt: oldTime.toISOString(), text: 'private' })}\n`
            : 'diagnostic',
        ),
      ),
    );
    await Promise.all(files.map((file) => utimes(file, oldTime, oldTime)));

    const first = await cleanupTelegramDiagnosticFiles({ backendRoot, now });
    const second = await cleanupTelegramDiagnosticFiles({ backendRoot, now });

    expect(first.expiredFiles).toBe(3);
    expect(first.expiredDiagnosticRecords).toBe(1);
    expect(second.expiredFiles).toBe(0);
    await expect(readFile(files[0])).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(files[1])).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(files[2])).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(files[3], 'utf8')).resolves.toBe('diagnostic');
  });

  it('prunes old records from an active NDJSON file without dropping recent records', async () => {
    const logPath = join(
      backendRoot,
      'runtime-logs/telegram/telegram-matched.ndjson',
    );
    const oldTime = new Date(now.getTime() - TELEGRAM_RETENTION_MS - 1);
    await writeFile(
      logPath,
      [
        JSON.stringify({
          loggedAt: oldTime.toISOString(),
          text: 'old private text',
        }),
        JSON.stringify({ loggedAt: now.toISOString(), text: 'current report' }),
      ].join('\n') + '\n',
    );

    const result = await cleanupTelegramDiagnosticFiles({ backendRoot, now });
    const remaining = await readFile(logPath, 'utf8');

    expect(result.expiredDiagnosticRecords).toBe(1);
    expect(remaining).not.toContain('old private text');
    expect(remaining).toContain('current report');
  });

  it('uses corpus file save time for legacy rows without savedAt', async () => {
    const corpusPath = join(
      backendRoot,
      'runtime-data/telegram/corpus/legacy.ndjson',
    );
    const oldTime = new Date(now.getTime() - TELEGRAM_RETENTION_MS - 1);
    await writeFile(
      corpusPath,
      `${JSON.stringify({
        externalId: 'legacy',
        publishedAt: now.toISOString(),
        text: 'legacy payload',
      })}\n`,
    );
    await utimes(corpusPath, oldTime, oldTime);

    const result = await cleanupTelegramDiagnosticFiles({
      backendRoot,
      now,
      dryRun: true,
    });

    expect(result.expiredCorpusMessages).toBe(1);
  });

  it('does not follow an approved-path symlink outside the backend directory', async () => {
    const logsDirectory = join(backendRoot, 'runtime-logs/telegram');
    const outsideDirectory = join(backendRoot, 'external-logs');
    const outsideLog = join(outsideDirectory, 'old.ndjson');
    const oldTime = new Date(now.getTime() - TELEGRAM_RETENTION_MS - 1);
    await rm(logsDirectory, { recursive: true, force: true });
    await mkdir(outsideDirectory, { recursive: true });
    await writeFile(outsideLog, 'external log must remain');
    await utimes(outsideLog, oldTime, oldTime);
    await symlink(outsideDirectory, logsDirectory);

    const result = await cleanupTelegramDiagnosticFiles({ backendRoot, now });

    expect(result.expiredFiles).toBe(0);
    await expect(readFile(outsideLog, 'utf8')).resolves.toBe(
      'external log must remain',
    );
  });

  it('restricts raw corpus and diagnostic files to operator-only filesystem permissions', async () => {
    const corpusDirectory = join(backendRoot, 'runtime-data/telegram/corpus');
    const logDirectory = join(backendRoot, 'runtime-logs/telegram');
    const corpusPath = join(corpusDirectory, 'history.ndjson');
    const logPath = join(logDirectory, 'telegram-review.ndjson');
    await writeFile(corpusPath, 'corpus');
    await writeFile(logPath, 'diagnostic');
    await chmod(corpusDirectory, 0o755);
    await chmod(logDirectory, 0o755);
    await chmod(corpusPath, 0o644);
    await chmod(logPath, 0o644);

    await restrictTelegramDiagnosticFilePermissions(backendRoot);

    expect(
      (await stat(corpusDirectory).then((value) => value.mode)) & 0o777,
    ).toBe(0o700);
    expect((await stat(logDirectory).then((value) => value.mode)) & 0o777).toBe(
      0o700,
    );
    expect((await stat(corpusPath).then((value) => value.mode)) & 0o777).toBe(
      0o600,
    );
    expect((await stat(logPath).then((value) => value.mode)) & 0o777).toBe(
      0o600,
    );
  });
});
