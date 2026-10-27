import {
  TELEGRAM_PARSER_CONTEXT_WINDOW_MS,
  TELEGRAM_PARSER_REPLY_CONTEXT_WINDOW_MS,
} from './telegram-parser.constants';
import { normalizeTelegramParserMessage } from './telegram-message.normalizer';
import type {
  TelegramParserContext,
  TelegramParserInput,
  TelegramParserMessage,
} from './telegram-parser.types';

export const buildTelegramParserContext = (
  input: TelegramParserInput,
  extendedReplyWindow = true,
): TelegramParserContext => {
  const currentTimestamp = Date.parse(input.message.publishedAt);
  const replyMessage =
    input.message.replyToExternalId !== undefined &&
    input.message.replyToExternalId === input.replyMessage?.externalId &&
    input.message.externalId !== input.replyMessage?.externalId &&
    isWithinContextWindow(
      input.replyMessage,
      input.message,
      currentTimestamp,
      extendedReplyWindow
        ? TELEGRAM_PARSER_REPLY_CONTEXT_WINDOW_MS
        : TELEGRAM_PARSER_CONTEXT_WINDOW_MS,
    )
      ? input.replyMessage
      : undefined;
  // Chat proximity is not a link to an event. Never search past an unknown
  // message (or any other chat message) for a type/location to inherit.
  const nearby = [
    ...(replyMessage === undefined
      ? []
      : [
          {
            ...normalizeTelegramParserMessage(replyMessage),
            contextSource: 'REPLY' as const,
          },
        ]),
  ];

  return {
    current: normalizeTelegramParserMessage(input.message),
    nearby,
  };
};

const isWithinContextWindow = (
  candidate: TelegramParserMessage | undefined,
  current: TelegramParserMessage,
  currentTimestamp: number,
  windowMs: number,
): candidate is TelegramParserMessage => {
  if (
    candidate === undefined ||
    candidate.chatId !== current.chatId ||
    candidate.cityId !== current.cityId
  ) {
    return false;
  }

  const candidateTimestamp = Date.parse(candidate.publishedAt);

  return (
    Number.isFinite(currentTimestamp) &&
    Number.isFinite(candidateTimestamp) &&
    candidateTimestamp <= currentTimestamp &&
    currentTimestamp - candidateTimestamp <= windowMs
  );
};
