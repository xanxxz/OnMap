import type {
  TelegramMessage,
  TelegramMtprotoMessageEnvelope,
  TelegramRawSourceType,
} from './telegram.types';

export const normalizeTelegramMtprotoMessage = (
  envelope: TelegramMtprotoMessageEnvelope,
  expectedChatId: string,
  cityId: string,
): TelegramMessage | null => {
  if (envelope.chatId !== expectedChatId || !isRecord(envelope.rawMessage)) {
    return null;
  }

  const messageId = asInteger(envelope.rawMessage.id);
  const text = asText(envelope.rawMessage.message);
  const publishedAt = asTelegramDate(envelope.rawMessage.date);

  if (
    messageId === undefined ||
    text === undefined ||
    publishedAt === undefined
  ) {
    return null;
  }

  const editedAt = asTelegramDate(envelope.rawMessage.editDate);
  const authorName = asAuthorName(envelope.rawMessage);
  const replyToMessageId = asReplyToMessageId(envelope.rawMessage);

  return {
    externalId: externalId(expectedChatId, messageId),
    source: 'TELEGRAM',
    cityId,
    chatId: expectedChatId,
    text,
    publishedAt,
    ...(editedAt === undefined ? {} : { editedAt }),
    ...(authorName === undefined ? {} : { authorName }),
    ...(replyToMessageId === undefined
      ? {}
      : { replyToExternalId: externalId(expectedChatId, replyToMessageId) }),
    rawSourceType: rawSourceType(envelope),
  };
};

const rawSourceType = (
  envelope: TelegramMtprotoMessageEnvelope,
): TelegramRawSourceType => {
  if (envelope.isChannel) {
    return envelope.isEdited ? 'edited_channel_post' : 'channel_post';
  }

  return envelope.isEdited ? 'edited_message' : 'message';
};

const asAuthorName = (message: Record<string, unknown>): string | undefined => {
  if (
    typeof message.postAuthor === 'string' &&
    message.postAuthor.trim().length > 0
  ) {
    return message.postAuthor.trim();
  }

  if (!isRecord(message.sender)) {
    return undefined;
  }

  const fullName = [message.sender.firstName, message.sender.lastName]
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    )
    .map((value) => value.trim())
    .join(' ');

  if (fullName.length > 0) {
    return fullName;
  }

  if (
    typeof message.sender.title === 'string' &&
    message.sender.title.trim().length > 0
  ) {
    return message.sender.title.trim();
  }

  return typeof message.sender.username === 'string' &&
    message.sender.username.trim().length > 0
    ? `@${message.sender.username.trim()}`
    : undefined;
};

const asReplyToMessageId = (
  message: Record<string, unknown>,
): number | undefined => {
  const directReplyId = asInteger(message.replyToMsgId);

  if (directReplyId !== undefined) {
    return directReplyId;
  }

  return isRecord(message.replyTo)
    ? asInteger(message.replyTo.replyToMsgId)
    : undefined;
};

const asText = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';

  return text.length === 0 ? undefined : text;
};

const asTelegramDate = (value: unknown): string | undefined => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  const seconds = asInteger(value);

  return seconds === undefined || seconds < 0
    ? undefined
    : new Date(seconds * 1_000).toISOString();
};

const asInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;

const externalId = (chatId: string, messageId: number): string =>
  `telegram:${chatId}:${messageId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
