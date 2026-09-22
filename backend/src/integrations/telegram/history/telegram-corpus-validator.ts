import { TELEGRAM_INGESTION_CONTEXT_MESSAGE_LIMIT } from '../ingestion/telegram-ingestion.constants';
import type { TelegramDryRunIngestionPipeline } from '../ingestion/telegram-dry-run-ingestion.pipeline';
import type { TelegramDryRunReportEntry } from '../ingestion/telegram-ingestion-report';
import type { TelegramMessage } from '../telegram.types';

type Pipeline = Pick<TelegramDryRunIngestionPipeline, 'process'>;

export const validateTelegramCorpus = async (
  corpus: readonly TelegramMessage[],
  pipeline: Pipeline,
): Promise<readonly TelegramDryRunReportEntry[]> => {
  const messages = [...corpus].sort(
    (left, right) =>
      Date.parse(left.publishedAt) - Date.parse(right.publishedAt),
  );
  const byExternalId = new Map(
    messages.map((message) => [message.externalId, message]),
  );
  const entries: TelegramDryRunReportEntry[] = [];

  for (const [index, message] of messages.entries()) {
    const replyMessage = message.replyToExternalId
      ? byExternalId.get(message.replyToExternalId)
      : undefined;
    const result = await pipeline.process({
      message,
      ...(replyMessage === undefined ? {} : { replyMessage }),
      previousMessages: messages.slice(
        Math.max(0, index - TELEGRAM_INGESTION_CONTEXT_MESSAGE_LIMIT),
        index,
      ),
    });

    entries.push({ message, result });
  }

  return entries;
};
