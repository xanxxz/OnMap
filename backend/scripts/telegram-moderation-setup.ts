import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { requestModerationStartChat } from '../src/integrations/telegram/moderation/telegram-moderation.access';

const output = (status: string, chatId?: string): void => {
  process.stdout.write(`Status: ${status}\n`);
  if (chatId) process.stdout.write(`Chat ID: ${chatId}\n`);
};

const isIgnoredEnv = (): boolean => {
  try {
    execFileSync('git', ['check-ignore', '-q', '.env'], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
};

const main = async (): Promise<void> => {
  const token = process.env.TELEGRAM_MODERATION_BOT_TOKEN?.trim();
  if (!token) return output('TOKEN_NOT_CONFIGURED');
  if (!isIgnoredEnv()) return output('LOCAL_ENV_NOT_GIT_IGNORED');

  const configuredChatId = process.env.TELEGRAM_MODERATION_CHAT_ID?.trim();
  if (configuredChatId && /^\d+$/u.test(configuredChatId)) {
    return output('ALREADY_CONFIGURED', configuredChatId);
  }

  const result = await requestModerationStartChat(token);
  if (result.status !== 'FOUND') return output(result.status);
  output('CHAT_ID_FOUND_ADD_TO_ENV', result.chatId);
  process.stdout.write(
    `Add to backend/.env: TELEGRAM_MODERATION_CHAT_ID=${result.chatId}\n`,
  );
};

void main();
