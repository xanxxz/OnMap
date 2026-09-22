import 'dotenv/config';

import { stdout } from 'node:process';

import { Api, TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';

import {
  filterTelegramDialogs,
  formatTelegramDialogs,
  parseTelegramDialogArguments,
  type TelegramDialogSummary,
  type TelegramDialogType,
} from '../src/integrations/telegram/dev/telegram-dialog-filter';

const run = async (): Promise<void> => {
  const apiIdText = process.env.TELEGRAM_API_ID?.trim() ?? '';
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? '';
  const session = process.env.TELEGRAM_SESSION?.trim() ?? '';
  const apiId = Number(apiIdText);

  if (
    !Number.isSafeInteger(apiId) ||
    apiId <= 0 ||
    apiHash.length === 0 ||
    session.length === 0
  ) {
    throw new Error('Telegram MTProto configuration is incomplete');
  }

  const options = parseTelegramDialogArguments(process.argv.slice(2));
  const client = new TelegramClient(
    new StringSession(session),
    apiId,
    apiHash,
    {
      autoReconnect: true,
      connectionRetries: 5,
    },
  );

  client.setLogLevel(LogLevel.NONE);

  try {
    await client.connect();

    if (!(await client.checkAuthorization())) {
      throw new Error('Telegram MTProto session is not authorized');
    }

    const dialogs = await client.getDialogs({ limit: undefined });
    const summaries = dialogs.flatMap((dialog): TelegramDialogSummary[] => {
      const type = getDialogType(dialog.isGroup, dialog.isChannel);
      const title = dialog.title?.trim() || dialog.name?.trim() || '';
      const id = dialog.id?.toString() ?? '';

      if (type === undefined || title.length === 0 || !/^-?\d+$/u.test(id)) {
        return [];
      }

      const username = getEntityUsername(dialog.entity);

      return [
        {
          title,
          type,
          ...(username === undefined ? {} : { username: `@${username}` }),
          id,
        },
      ];
    });

    stdout.write(
      formatTelegramDialogs(filterTelegramDialogs(summaries, options)),
    );
  } finally {
    await client.disconnect();
  }
};

const getDialogType = (
  isGroup: boolean,
  isChannel: boolean,
): TelegramDialogType | undefined => {
  if (isGroup && isChannel) {
    return 'supergroup';
  }

  if (isGroup) {
    return 'group';
  }

  return isChannel ? 'channel' : undefined;
};

const getEntityUsername = (entity: unknown): string | undefined => {
  if (
    entity instanceof Api.Channel &&
    typeof entity.username === 'string' &&
    entity.username.trim().length > 0
  ) {
    return entity.username.trim();
  }

  return undefined;
};

void run().catch(() => {
  stdout.write(
    'Не удалось получить Telegram dialogs. Проверьте session и аргументы команды.\n',
  );
  process.exitCode = 1;
});
