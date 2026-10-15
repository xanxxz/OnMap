import { ConfigService } from '@nestjs/config';

import { TelegramMtprotoClientFactory } from '../src/integrations/telegram/telegram-mtproto-client.factory';
import { TelegramMtprotoClient } from '../src/integrations/telegram/telegram-mtproto.client';

const run = async (): Promise<void> => {
  const client = new TelegramMtprotoClient(
    new ConfigService(process.env),
    new TelegramMtprotoClientFactory(),
  );
  let stage = 'CONNECT';

  try {
    await client.connect();
    process.stdout.write('MTProto authorization and source resolution: ok\n');
    stage = 'LATEST_MESSAGE';
    const recent = await client.getRecentMessages(1);
    if (recent.length === 0) {
      throw new Error('LATEST_MESSAGE_MISSING');
    }
    process.stdout.write('Latest source message available for baseline: yes\n');
  } catch {
    process.stderr.write(`MTProto preflight failed at ${stage}\n`);
    process.exitCode = 1;
  } finally {
    await client.disconnect().catch(() => undefined);
  }
};

run().catch(() => {
  process.exitCode = 1;
});
