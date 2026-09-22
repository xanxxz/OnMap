import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { TelegramMtprotoClient } from './telegram-mtproto.client';
import { TelegramCitySourceRegistry } from './telegram-city-source.registry';
import { normalizeTelegramMtprotoMessage } from './telegram-mtproto.mapper';
import {
  TELEGRAM_BOOTSTRAP_HISTORY_LIMIT,
  TELEGRAM_RUNTIME_DEDUP_LIMIT,
} from './telegram.constants';
import type {
  TelegramCitySource,
  TelegramMessage,
  TelegramMessageListener,
  TelegramMessageSource,
  TelegramMtprotoConnectionSnapshot,
  TelegramMtprotoMessageEnvelope,
  TelegramReconnectListener,
  TelegramRecoveryBatch,
  TelegramSourceCursor,
} from './telegram.types';

@Injectable()
export class TelegramMtprotoSource
  implements TelegramMessageSource, OnModuleDestroy
{
  private readonly processedVersions = new Map<string, string>();

  constructor(
    private readonly client: TelegramMtprotoClient,
    private readonly citySources: TelegramCitySourceRegistry,
  ) {}

  isAvailable(): boolean {
    return this.client.isAvailable();
  }

  getConnectionSnapshot(): TelegramMtprotoConnectionSnapshot {
    return this.client.getConnectionSnapshot();
  }

  getSourceChatId(): Promise<string> {
    return this.client.getSourceChatId();
  }

  async getCitySources() {
    const configured = this.citySources.getPrimarySource();

    if (configured === undefined) {
      return [];
    }

    return [
      {
        cityId: configured.cityId,
        sourceChatId: await this.client.getSourceChatId(),
      },
    ];
  }

  async getRecentMessages(
    limit = TELEGRAM_BOOTSTRAP_HISTORY_LIMIT,
  ): Promise<readonly TelegramMessage[]> {
    const [source, envelopes] = await Promise.all([
      this.getCitySources().then((sources) => sources[0]),
      this.client.getRecentMessages(limit),
    ]);

    if (source === undefined) {
      return [];
    }

    return envelopes
      .map((envelope) => this.accept(envelope, source))
      .filter((message): message is TelegramMessage => message !== null);
  }

  async getMessagesAfter(
    source: TelegramCitySource,
    cursor: TelegramSourceCursor,
    limit: number,
  ): Promise<TelegramRecoveryBatch> {
    if (
      source.cityId !== cursor.cityId ||
      source.sourceChatId !== cursor.sourceChatId
    ) {
      return { messages: [], truncated: false };
    }

    const configured = (await this.getCitySources()).find(
      (candidate) =>
        candidate.cityId === source.cityId &&
        candidate.sourceChatId === source.sourceChatId,
    );

    if (configured === undefined) {
      return { messages: [], truncated: false };
    }

    const batch = await this.client.getMessagesAfter(
      cursor.lastMessageId,
      limit,
    );
    const messages = batch.envelopes
      .map((envelope) =>
        normalizeTelegramMtprotoMessage(
          envelope,
          configured.sourceChatId,
          configured.cityId,
        ),
      )
      .filter((message): message is TelegramMessage => message !== null)
      .sort(compareTelegramMessages);

    return { messages, truncated: batch.truncated };
  }

  onReconnected(listener: TelegramReconnectListener): () => void {
    return this.client.onReconnected(async (sourceChatId) => {
      const source = (await this.getCitySources()).find(
        (candidate) => candidate.sourceChatId === sourceChatId,
      );

      if (source !== undefined) {
        await listener(source);
      }
    });
  }

  async start(listener: TelegramMessageListener): Promise<void> {
    const source = (await this.getCitySources())[0];

    if (source === undefined) {
      return;
    }

    await this.client.subscribe(async (envelope) => {
      const message = this.accept(envelope, source);

      if (message !== null) {
        await listener(message);
      }
    });
  }

  stop(): Promise<void> {
    this.client.unsubscribe();

    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private accept(
    envelope: TelegramMtprotoMessageEnvelope,
    source: { readonly cityId: string; readonly sourceChatId: string },
  ): TelegramMessage | null {
    const message = normalizeTelegramMtprotoMessage(
      envelope,
      source.sourceChatId,
      source.cityId,
    );

    if (message === null || !this.shouldProcess(message)) {
      return null;
    }

    this.remember(message);

    return message;
  }

  private shouldProcess(message: TelegramMessage): boolean {
    const previousVersion = this.processedVersions.get(message.externalId);
    const currentVersion = messageVersion(message);

    if (previousVersion === undefined) {
      return true;
    }

    return (
      isEditedSourceType(message.rawSourceType) &&
      previousVersion !== currentVersion
    );
  }

  private remember(message: TelegramMessage): void {
    this.processedVersions.delete(message.externalId);
    this.processedVersions.set(message.externalId, messageVersion(message));

    if (this.processedVersions.size <= TELEGRAM_RUNTIME_DEDUP_LIMIT) {
      return;
    }

    for (const oldestExternalId of this.processedVersions.keys()) {
      this.processedVersions.delete(oldestExternalId);

      break;
    }
  }
}

const isEditedSourceType = (rawSourceType: string): boolean =>
  rawSourceType === 'edited_message' || rawSourceType === 'edited_channel_post';

const messageVersion = (message: TelegramMessage): string =>
  `${message.rawSourceType}:${message.editedAt ?? message.publishedAt}`;

const compareTelegramMessages = (
  left: TelegramMessage,
  right: TelegramMessage,
): number =>
  telegramMessageId(left) - telegramMessageId(right) ||
  Date.parse(left.editedAt ?? left.publishedAt) -
    Date.parse(right.editedAt ?? right.publishedAt);

const telegramMessageId = (message: TelegramMessage): number => {
  const id = Number(
    message.externalId.slice(message.externalId.lastIndexOf(':') + 1),
  );

  return Number.isSafeInteger(id) ? id : Number.MAX_SAFE_INTEGER;
};
