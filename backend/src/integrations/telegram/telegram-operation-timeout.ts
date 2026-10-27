import { TelegramIntegrationError } from './telegram.errors';

/** The losing RPC may still settle, but its result can no longer reach ingestion. */
export async function withTelegramDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new TelegramIntegrationError(
                'OPERATION_TIMEOUT',
                'Telegram operation timed out',
              ),
            ),
          timeoutMs,
        );
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
