import type {
  TelegramDryRunIngestionInput,
  TelegramDryRunIngestionResult,
} from '../ingestion/telegram-ingestion.types';
import type { TelegramParserResult } from '../parser/telegram-parser.types';
import type { TelegramMessage } from '../telegram.types';
import { validateTelegramCorpus } from './telegram-corpus-validator';

describe('validateTelegramCorpus', () => {
  it('processes a saved corpus chronologically with reply and bounded previous context', async () => {
    const process = jest
      .fn()
      .mockImplementation((input: TelegramDryRunIngestionInput) =>
        Promise.resolve(result(input.message.text)),
      );
    const newer = message(2, 'reply', { replyToExternalId: externalId(1) });
    const older = message(1, 'parent');

    const entries = await validateTelegramCorpus([newer, older], { process });

    expect(entries.map(({ message: item }) => item.externalId)).toEqual([
      externalId(1),
      externalId(2),
    ]);
    expect(process).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: newer,
        replyMessage: older,
        previousMessages: [older],
      }),
    );
  });

  const message = (
    id: number,
    text: string,
    extra: Partial<TelegramMessage> = {},
  ): TelegramMessage => ({
    externalId: externalId(id),
    source: 'TELEGRAM',
    cityId: 'balakovo',
    chatId: '-1001',
    text,
    publishedAt: new Date(1_700_000_000_000 + id * 1_000).toISOString(),
    rawSourceType: 'message',
    ...extra,
  });

  const externalId = (id: number): string => `telegram:-1001:${id}`;

  const result = (term: string): TelegramDryRunIngestionResult => ({
    parserResult: {
      matched: false,
      eventType: 'OTHER',
      intent: 'NOISE',
      state: 'UNKNOWN',
      locationText: null,
      locationAlias: null,
      locations: [],
      locationResolutionAllowed: false,
      confidence: 0,
      matchedTerms: [term],
      contextUsed: false,
    } satisfies TelegramParserResult,
    events: [],
  });
});
