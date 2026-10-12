import 'dotenv/config';

const token = process.env.TELEGRAM_MODERATION_BOT_TOKEN?.trim();
const chatId = process.env.TELEGRAM_MODERATION_CHAT_ID?.trim();

const output = (status: string): void => {
  process.stdout.write(`Status: ${status}\n`);
};

const main = async (): Promise<void> => {
  if (!token || !chatId || !/^-?\d+$/u.test(chatId)) {
    return output('SETUP_REQUIRED');
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'OnMap moderation bot delivery test. No action is required.',
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return output('SEND_FAILED');
    const payload: unknown = await response.json();
    output(
      payload &&
        typeof payload === 'object' &&
        'ok' in payload &&
        payload.ok === true
        ? 'SENT'
        : 'SEND_FAILED',
    );
  } catch {
    output('SEND_FAILED');
  }
};

void main();
