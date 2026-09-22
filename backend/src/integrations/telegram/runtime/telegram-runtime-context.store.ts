import { Injectable } from '@nestjs/common';

import { TELEGRAM_INGESTION_CONTEXT_MESSAGE_LIMIT } from '../ingestion/telegram-ingestion.constants';
import type { TelegramDryRunIngestionInput } from '../ingestion/telegram-ingestion.types';
import type { TelegramMessage } from '../telegram.types';

import { TELEGRAM_RUNTIME_CONTEXT_CAPACITY } from './telegram-ingestion-runtime.constants';

@Injectable()
export class TelegramRuntimeContextStore {
  private readonly messages: TelegramMessage[] = [];
  private readonly byExternalId = new Map<string, TelegramMessage>();

  seed(messages: readonly TelegramMessage[]): void {
    this.messages.length = 0;
    this.byExternalId.clear();

    [...messages]
      .sort(
        (left, right) =>
          Date.parse(left.publishedAt) - Date.parse(right.publishedAt),
      )
      .forEach((message) => this.remember(message));
  }

  buildInput(message: TelegramMessage): TelegramDryRunIngestionInput {
    const replyMessage =
      message.replyToExternalId === undefined
        ? undefined
        : this.byExternalId.get(message.replyToExternalId);
    const previousMessages = this.messages
      .filter(
        (candidate) =>
          candidate.chatId === message.chatId &&
          candidate.externalId !== message.externalId,
      )
      .slice(-TELEGRAM_INGESTION_CONTEXT_MESSAGE_LIMIT);

    return {
      message,
      ...(replyMessage === undefined ? {} : { replyMessage }),
      previousMessages,
    };
  }

  remember(message: TelegramMessage): void {
    const existingIndex = this.messages.findIndex(
      (candidate) => candidate.externalId === message.externalId,
    );

    if (existingIndex >= 0) {
      this.messages.splice(existingIndex, 1);
    }

    this.messages.push(message);
    this.byExternalId.set(message.externalId, message);

    while (this.messages.length > TELEGRAM_RUNTIME_CONTEXT_CAPACITY) {
      const removed = this.messages.shift();

      if (
        removed !== undefined &&
        this.byExternalId.get(removed.externalId) === removed
      ) {
        this.byExternalId.delete(removed.externalId);
      }
    }
  }

  size(): number {
    return this.messages.length;
  }
}
