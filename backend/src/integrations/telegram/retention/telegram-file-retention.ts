import {
  chmod,
  lstat,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { TELEGRAM_RETENTION_MS } from './telegram-retention.constants';

export interface TelegramFileRetentionOptions {
  readonly backendRoot: string;
  readonly now?: Date;
  readonly dryRun?: boolean;
}

export interface TelegramFileRetentionResult {
  readonly expiredFiles: number;
  readonly expiredCorpusMessages: number;
  readonly expiredDiagnosticRecords: number;
  readonly scannedFiles: number;
  readonly sample: readonly string[];
}

const ALLOWED_DIRECTORIES = [
  'runtime-data/telegram/corpus',
  'runtime-logs/telegram',
] as const;

export const restrictTelegramDiagnosticFilePermissions = async (
  backendRootInput: string,
): Promise<void> => {
  const backendRoot = resolve(backendRootInput);
  let realBackendRoot: string;
  try {
    realBackendRoot = await realpath(backendRoot);
  } catch (error: unknown) {
    if (isMissingPath(error)) {
      return;
    }
    throw error;
  }

  for (const relativeDirectory of ALLOWED_DIRECTORIES) {
    const directory = resolve(backendRoot, relativeDirectory);
    let realDirectory: string;
    try {
      realDirectory = await realpath(directory);
    } catch (error: unknown) {
      if (isMissingPath(error)) {
        continue;
      }
      throw error;
    }
    if (!isPathInside(realBackendRoot, realDirectory)) {
      continue;
    }

    const files = await listRegularFiles(directory);
    if (files.length === 0) {
      continue;
    }
    await chmod(directory, 0o700).catch(() => undefined);
    for (const filePath of files) {
      await chmod(dirname(filePath), 0o700).catch(() => undefined);
      await chmod(filePath, 0o600).catch(() => undefined);
    }
  }
};

export const cleanupTelegramDiagnosticFiles = async (
  options: TelegramFileRetentionOptions,
): Promise<TelegramFileRetentionResult> => {
  const backendRoot = resolve(options.backendRoot);
  let realBackendRoot: string;
  try {
    realBackendRoot = await realpath(backendRoot);
  } catch (error: unknown) {
    if (isMissingPath(error)) {
      return {
        expiredFiles: 0,
        expiredCorpusMessages: 0,
        expiredDiagnosticRecords: 0,
        scannedFiles: 0,
        sample: [],
      };
    }
    throw error;
  }
  const cutoff = (options.now ?? new Date()).getTime() - TELEGRAM_RETENTION_MS;
  const dryRun = options.dryRun ?? false;
  let expiredFiles = 0;
  let expiredCorpusMessages = 0;
  let expiredDiagnosticRecords = 0;
  let scannedFiles = 0;
  const sample: string[] = [];

  for (const relativeDirectory of ALLOWED_DIRECTORIES) {
    const directory = resolve(backendRoot, relativeDirectory);
    if (!isPathInside(backendRoot, directory)) {
      continue;
    }
    let realDirectory: string;
    try {
      realDirectory = await realpath(directory);
    } catch (error: unknown) {
      if (isMissingPath(error)) {
        continue;
      }
      throw error;
    }
    if (!isPathInside(realBackendRoot, realDirectory)) {
      continue;
    }

    const entries = await listRegularFiles(directory);
    if (!dryRun && entries.length > 0) {
      await chmod(directory, 0o700).catch(() => undefined);
    }
    for (const filePath of entries) {
      scannedFiles += 1;
      const fileStats = await lstat(filePath);
      const displayPath = relative(backendRoot, filePath);

      const isCorpus = relativeDirectory.endsWith('/corpus');
      const isNdjson =
        filePath.endsWith('.ndjson') || filePath.endsWith('.ndjson.1');
      if (isNdjson) {
        if (!dryRun) {
          await chmod(dirname(filePath), 0o700).catch(() => undefined);
          await chmod(filePath, 0o600).catch(() => undefined);
        }
      }

      if (isNdjson) {
        const result = await pruneNdjsonFile({
          filePath,
          fallbackSavedAt: fileStats.mtime.getTime(),
          cutoff,
          dryRun,
          timestampField: isCorpus ? 'savedAt' : 'loggedAt',
        });
        if (isCorpus) {
          expiredCorpusMessages += result.expiredRecords;
        } else {
          expiredDiagnosticRecords += result.expiredRecords;
        }
        if (result.expiredRecords > 0 && sample.length < 5) {
          const label = isCorpus
            ? 'expired corpus message(s)'
            : 'expired log record(s)';
          sample.push(`${displayPath}: ${result.expiredRecords} ${label}`);
        }
        if (result.remainingRecords === 0 && result.expiredRecords > 0) {
          expiredFiles += 1;
          if (!dryRun) {
            await rm(filePath, { force: true });
          }
          continue;
        }
      }

      if (!isRetentionFile(filePath, relativeDirectory)) {
        continue;
      }

      if (!dryRun) {
        await chmod(dirname(filePath), 0o700).catch(() => undefined);
        await chmod(filePath, 0o600).catch(() => undefined);
      }

      if (fileStats.mtime.getTime() > cutoff) {
        continue;
      }

      expiredFiles += 1;
      if (sample.length < 5) {
        sample.push(`${displayPath}: expired file`);
      }
      if (!dryRun) {
        await rm(filePath, { force: true });
      }
    }
  }

  return {
    expiredFiles,
    expiredCorpusMessages,
    expiredDiagnosticRecords,
    scannedFiles,
    sample,
  };
};

interface PruneNdjsonFileOptions {
  readonly filePath: string;
  readonly fallbackSavedAt: number;
  readonly cutoff: number;
  readonly dryRun: boolean;
  readonly timestampField: 'savedAt' | 'loggedAt';
}

const pruneNdjsonFile = async (
  options: PruneNdjsonFileOptions,
): Promise<{
  readonly expiredRecords: number;
  readonly remainingRecords: number;
}> => {
  const content = await readFile(options.filePath, 'utf8');
  const kept: string[] = [];
  let expiredMessages = 0;

  for (const line of content.split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }

    let savedAt = options.fallbackSavedAt;
    try {
      const entry: unknown = JSON.parse(line);
      if (
        isRecord(entry) &&
        typeof entry[options.timestampField] === 'string'
      ) {
        const timestamp = Date.parse(entry[options.timestampField] as string);
        if (Number.isFinite(timestamp)) {
          savedAt = timestamp;
        }
      }
    } catch {
      // Keep malformed rows; retention must not turn corruption into data loss.
      kept.push(line);
      continue;
    }

    if (savedAt <= options.cutoff) {
      expiredMessages += 1;
    } else {
      kept.push(line);
    }
  }

  if (expiredMessages > 0 && !options.dryRun) {
    const temporaryPath = `${options.filePath}.retention.tmp`;
    const replacement = kept.length === 0 ? '' : `${kept.join('\n')}\n`;
    await writeFile(temporaryPath, replacement, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, options.filePath);
    await chmod(options.filePath, 0o600);
  }

  return {
    expiredRecords: expiredMessages,
    remainingRecords: kept.length,
  };
};

const listRegularFiles = async (directory: string): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissingPath(error)) {
      return [];
    }
    throw error;
  }

  const result: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isFile()) {
      result.push(path);
    } else if (entry.isDirectory()) {
      result.push(...(await listRegularFiles(path)));
    }
  }
  return result;
};

const isRetentionFile = (
  filePath: string,
  relativeDirectory: string,
): boolean => {
  const name = filePath.slice(filePath.lastIndexOf(sep) + 1).toLowerCase();
  if (name.endsWith('.tmp') || name.endsWith('.xlsx')) {
    return true;
  }
  if (relativeDirectory.endsWith('/corpus')) {
    return name.endsWith('.validation.json');
  }
  return name.endsWith('.csv');
};

const isPathInside = (parent: string, candidate: string): boolean => {
  const relativePath = relative(parent, candidate);
  return (
    !isAbsolute(relativePath) &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`)
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMissingPath = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';
