import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../src/database/prisma.service';
import { TelegramRetentionCleanupService } from '../src/integrations/telegram/retention/telegram-retention-cleanup.service';

const isLocalDevelopmentDatabase = (databaseUrl: string): boolean => {
  try {
    const url = new URL(databaseUrl);
    const databaseName = url.pathname.slice(1).toLowerCase();
    return (
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname) &&
      !/(^|[-_])(prod|production)([-_]|$)/u.test(databaseName) &&
      process.env.NODE_ENV !== 'production'
    );
  } catch {
    return false;
  }
};

const run = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || !isLocalDevelopmentDatabase(databaseUrl)) {
    process.stderr.write(
      'Telegram retention dry-run requires a local non-production DATABASE_URL. No changes were made.\n',
    );
    process.exitCode = 1;
    return;
  }

  const config = new ConfigService({ DATABASE_URL: databaseUrl });
  const prisma = new PrismaService(config);
  try {
    await prisma.$connect();
  } catch {
    process.stderr.write(
      'Local PostgreSQL is unavailable; dry-run did not query the database or change data.\n',
    );
    process.exitCode = 1;
    return;
  }

  try {
    const result = await new TelegramRetentionCleanupService(
      config,
      prisma,
    ).dryRun();
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: 'DRY_RUN',
          database: {
            environment: 'LOCAL_NON_PRODUCTION',
            ...result.database,
          },
          files: result.files,
          cutoff: result.cutoff,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  void run().catch((error: unknown) => {
    const errorType =
      typeof error === 'object' && error !== null && 'constructor' in error
        ? String(error.constructor.name)
            .replace(/[^a-z0-9_]/giu, '')
            .slice(0, 40)
        : 'UnknownError';
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
            .replace(/[^a-z0-9_]/giu, '')
            .slice(0, 32)
        : '';
    process.stderr.write(
      `Telegram retention dry-run failed safely: ${errorType}${errorCode ? ` (${errorCode})` : ''}; no text content logged.\n`,
    );
    process.exitCode = 1;
  });
}
