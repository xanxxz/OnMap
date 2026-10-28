import { ConfigService } from '@nestjs/config';
import { openSync, writeSync, closeSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { PrismaService } from '../src/database/prisma.service';
import { OwnerAdminAuthService } from '../src/owner-admin/owner-admin-auth.service';
import { parsePartnerOwnerIds } from '../src/partner-placements/partner-bot.service';

async function main() {
  // Credentials are shown only on the operator's terminal, never stdout/stderr/log files.
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('TTY_REQUIRED');
  const config = new ConfigService(process.env);
  const owners = [
    ...parsePartnerOwnerIds(config.get<string>('TELEGRAM_PARTNER_OWNER_IDS')),
  ];
  if (!owners.length) throw new Error('OWNER_ALLOWLIST_REQUIRED');
  const question = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const index =
    owners.length === 1
      ? 0
      : Number(
          await question.question(
            `Номер владельца в server-side allowlist (1–${owners.length}): `,
          ),
        ) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= owners.length) {
    question.close();
    throw new Error('INVALID_OWNER_SELECTION');
  }
  const answer = await question.question(
    'Отозвать прежний токен и выдать новый на 20 минут? Введите ДА: ',
  );
  question.close();
  if (answer !== 'ДА') return;
  const prisma = new PrismaService(config);
  try {
    const result = await new OwnerAdminAuthService(prisma, config).issue(
      owners[index],
    );
    const tty = openSync('/dev/tty', 'w');
    try {
      writeSync(
        tty,
        `Токен (только для ввода в локальной панели):\n${result.token}\nДействует до ${result.expiresAt.toISOString()}. Не сохраняйте в файлы или чат.\n`,
      );
    } finally {
      closeSync(tty);
    }
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Не удалось выдать токен. Нужны TTY, включённый OWNER_ADMIN_ENABLED, доступная БД и владелец в allowlist. Секреты не выведены.',
  );
  process.exitCode = 1;
});
