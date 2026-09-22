import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { TelegramMtprotoHistoryPage } from '../telegram-mtproto.client';
import type { TelegramMtprotoMessageEnvelope } from '../telegram.types';
import { TelegramHistoryFetcher } from './telegram-history.fetcher';

describe('TelegramHistoryFetcher', () => {
  const sourceChatId = '-1001989574928';

  it('paginates with the oldest message id and persists diagnostics', async () => {
    const paths = await temporaryPaths();
    const getHistoryPage = jest
      .fn()
      .mockResolvedValueOnce(page([300, 299], 299, false))
      .mockResolvedValueOnce(page([298], 298, true));
    const progress = jest.fn();
    const fetcher = new TelegramHistoryFetcher(
      { getHistoryPage },
      sourceRegistry(),
      undefined,
      1_000,
      0,
    );

    const result = await fetcher.fetch({
      limit: 3,
      ...paths,
      onProgress: progress,
    });

    expect(getHistoryPage).toHaveBeenNthCalledWith(1, 3, undefined);
    expect(getHistoryPage).toHaveBeenNthCalledWith(2, 1, 299);
    expect(result.messages.map(({ externalId }) => externalId)).toEqual([
      `${externalId(298)}`,
      `${externalId(299)}`,
      `${externalId(300)}`,
    ]);
    expect(result.metadata).toMatchObject({
      requested: 3,
      fetchedFromTelegram: 3,
      pagesFetched: 2,
      afterSourceFiltering: 3,
      saved: 3,
      status: 'FULL',
    });
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('resumes from the oldest saved id without downloading the corpus again', async () => {
    const paths = await temporaryPaths();
    const firstClient = {
      getHistoryPage: jest.fn().mockResolvedValue(page([300, 299], 299, false)),
    };
    await new TelegramHistoryFetcher(
      firstClient,
      sourceRegistry(),
      undefined,
      1_000,
      0,
    ).fetch({ limit: 2, ...paths });

    const resumedClient = {
      getHistoryPage: jest.fn().mockResolvedValue(page([298], 298, true)),
    };
    const result = await new TelegramHistoryFetcher(
      resumedClient,
      sourceRegistry(),
      undefined,
      1_000,
      0,
    ).fetch({ limit: 3, ...paths });

    expect(resumedClient.getHistoryPage).toHaveBeenCalledWith(1, 299);
    expect(result.messages).toHaveLength(3);
    expect(result.metadata).toMatchObject({
      fetchedFromTelegram: 3,
      pagesFetched: 2,
      afterSourceFiltering: 3,
    });
  });

  it('deduplicates the same message and keeps its latest edited version', async () => {
    const paths = await temporaryPaths();
    const original = envelope(300, 'original');
    const edited = envelope(300, 'edited', 1_700_001_000);
    const getHistoryPage = jest
      .fn()
      .mockResolvedValueOnce(customPage([original], 300, false))
      .mockResolvedValueOnce(customPage([edited, envelope(299)], 299, true));

    const result = await new TelegramHistoryFetcher(
      { getHistoryPage },
      sourceRegistry(),
      undefined,
      1_000,
      0,
    ).fetch({ limit: 2, ...paths });

    expect(result.messages).toHaveLength(2);
    expect(
      result.messages.find(({ externalId: id }) => id === externalId(300)),
    ).toMatchObject({ text: 'edited' });
    expect(
      (await readFile(paths.corpusPath, 'utf8')).trim().split('\n'),
    ).toHaveLength(2);
  });

  it('retries a transient failure and returns a durable partial corpus when exhausted', async () => {
    const paths = await temporaryPaths();
    const getHistoryPage = jest
      .fn()
      .mockResolvedValueOnce(page([300], 300, false))
      .mockRejectedValue(new Error('network'));
    const result = await new TelegramHistoryFetcher(
      { getHistoryPage },
      sourceRegistry(),
      undefined,
      1_000,
      1,
    ).fetch({ limit: 2, ...paths });

    expect(getHistoryPage).toHaveBeenCalledTimes(3);
    expect(result.messages).toHaveLength(1);
    expect(result.metadata).toMatchObject({
      status: 'PARTIAL',
      errorCode: 'UNKNOWN_ERROR',
      pagesFetched: 1,
    });
  });

  const sourceRegistry = () => ({
    getPrimarySource: jest.fn().mockReturnValue({
      cityId: 'balakovo',
      sourceChatId,
    }),
  });

  const page = (
    ids: readonly number[],
    nextOffsetId: number,
    exhausted: boolean,
  ): TelegramMtprotoHistoryPage =>
    customPage(
      ids.map((id) => envelope(id)),
      nextOffsetId,
      exhausted,
    );

  const customPage = (
    envelopes: readonly TelegramMtprotoMessageEnvelope[],
    nextOffsetId: number,
    exhausted: boolean,
  ): TelegramMtprotoHistoryPage => ({
    envelopes,
    sourceChatId,
    nextOffsetId,
    exhausted,
    fetched: envelopes.length,
  });

  const envelope = (
    id: number,
    text = `message ${id}`,
    editDate?: number,
  ): TelegramMtprotoMessageEnvelope => ({
    chatId: sourceChatId,
    isChannel: false,
    isEdited: editDate !== undefined,
    rawMessage: {
      id,
      message: text,
      date: 1_700_000_000 + id,
      ...(editDate === undefined ? {} : { editDate }),
    },
  });

  const externalId = (id: number): string => `telegram:${sourceChatId}:${id}`;

  const temporaryPaths = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'telegram-history-'));

    return {
      corpusPath: join(directory, 'history.ndjson'),
      metadataPath: join(directory, 'metadata.json'),
    };
  };
});
