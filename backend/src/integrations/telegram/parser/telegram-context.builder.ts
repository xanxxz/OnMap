import {
  TELEGRAM_PARSER_CONTEXT_WINDOW_MS,
  TELEGRAM_PARSER_MAX_PREVIOUS_MESSAGES,
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
  const replyMessage = isWithinContextWindow(
    input.replyMessage,
    input.message,
    currentTimestamp,
    extendedReplyWindow
      ? TELEGRAM_PARSER_REPLY_CONTEXT_WINDOW_MS
      : TELEGRAM_PARSER_CONTEXT_WINDOW_MS,
  )
    ? input.replyMessage
    : undefined;
  const previousMessages = (input.previousMessages ?? [])
    .filter((candidate) =>
      isWithinContextWindow(
        candidate,
        input.message,
        currentTimestamp,
        TELEGRAM_PARSER_CONTEXT_WINDOW_MS,
      ),
    )
    .filter(
      (candidate, index, all) =>
        !isSameMessage(candidate, replyMessage) &&
        all.findIndex((other) => isSameMessage(other, candidate)) === index,
    )
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
    )
    .slice(
      0,
      TELEGRAM_PARSER_MAX_PREVIOUS_MESSAGES -
        (replyMessage === undefined ? 0 : 1),
    );
  const nearby = [
    ...(replyMessage === undefined
      ? []
      : [
          {
            ...normalizeTelegramParserMessage(replyMessage),
            contextSource: 'REPLY' as const,
          },
        ]),
    ...previousMessages.map((message) => ({
      ...normalizeTelegramParserMessage(message),
      contextSource: 'PREVIOUS_MESSAGE' as const,
    })),
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

const isSameMessage = (
  left: TelegramParserMessage,
  right: TelegramParserMessage | undefined,
): boolean =>
  right !== undefined &&
  left.chatId === right.chatId &&
  left.cityId === right.cityId &&
  left.publishedAt === right.publishedAt &&
  left.text === right.text;
