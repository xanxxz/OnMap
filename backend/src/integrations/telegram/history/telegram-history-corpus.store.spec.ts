import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TelegramMessage } from '../telegram.types';
import { TelegramHistoryCorpusStore } from './telegram-history-corpus.store';

describe('TelegramHistoryCorpusStore', () => {
  it('round-trips parser fields without persisting author identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'telegram-corpus-'));
    const corpusPath = join(directory, 'history.ndjson');
    const metadataPath = join(directory, 'metadata.json');
    const message: TelegramMessage = {
      externalId: 'telegram:-1001:42',
      source: 'TELEGRAM',
      cityId: 'balakovo',
      chatId: '-1001',
      text: 'авария на комарова',
      publishedAt: '2026-01-01T00:00:00.000Z',
      editedAt: '2026-01-01T00:01:00.000Z',
      authorName: 'must not persist',
      replyToExternalId: 'telegram:-1001:41',
      rawSourceType: 'edited_message',
    };

    await new TelegramHistoryCorpusStore().write(
      corpusPath,
      metadataPath,
      [message],
      {
        schemaVersion: 1,
        cityId: 'balakovo',
        sourceChatId: '-1001',
        requested: 1,
        saved: 1,
        fetchedFromTelegram: 1,
        pagesFetched: 1,
        afterSourceFiltering: 1,
        oldestMessageId: 42,
        newestMessageId: 42,
        status: 'FULL',
        historyExhausted: false,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    );

    const raw = await readFile(corpusPath, 'utf8');
    const store = new TelegramHistoryCorpusStore();
    const [restored] = await store.read(corpusPath);
    const metadata = await store.readMetadata(metadataPath);

    expect(raw).not.toContain('must not persist');
    expect(restored).toEqual({
      externalId: message.externalId,
      source: message.source,
      cityId: message.cityId,
      chatId: message.chatId,
      text: message.text,
      publishedAt: message.publishedAt,
      editedAt: message.editedAt,
      replyToExternalId: message.replyToExternalId,
      rawSourceType: message.rawSourceType,
    });
    expect(metadata).toMatchObject({ saved: 1, pagesFetched: 1 });
  });
});
