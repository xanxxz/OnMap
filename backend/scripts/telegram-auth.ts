import 'dotenv/config';

import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';

const run = async (): Promise<void> => {
  const apiIdText = process.env.TELEGRAM_API_ID?.trim() ?? '';
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? '';
  const apiId = Number(apiIdText);

  if (!Number.isSafeInteger(apiId) || apiId <= 0 || apiHash.length === 0) {
    throw new Error('Telegram MTProto auth configuration is incomplete');
  }

  const prompt = createInterface({ input, output });
  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    autoReconnect: false,
    connectionRetries: 5,
  });

  client.setLogLevel(LogLevel.NONE);

  try {
    await client.start({
      phoneNumber: async () =>
        (await prompt.question('Номер телефона: ')).trim(),
      phoneCode: async () =>
        (await prompt.question('Код из Telegram: ')).trim(),
      password: async () =>
        (await prompt.question('Пароль 2FA (если запрошен): ')).trim(),
      onError: () => {
        output.write('Ошибка авторизации Telegram. Повторите ввод.\n');
      },
    });

    const session = stringSession.save();

    if (session.length === 0) {
      throw new Error('Telegram MTProto session was not created');
    }

    output.write(
      '\nСкопируйте это значение в TELEGRAM_SESSION вашего локального .env:\n',
    );
    output.write(`${session}\n`);
  } finally {
    prompt.close();
    await client.disconnect();
  }
};

void run().catch(() => {
  output.write(
    'Не удалось создать Telegram session. Проверьте конфигурацию и повторите попытку.\n',
  );
  process.exitCode = 1;
});
