type UnknownRecord = Record<string, unknown>;

export type TelegramModerationUpdate = UnknownRecord & {
  message?: unknown;
  callback_query?: unknown;
};

export type ModerationStartResult =
  | { status: 'FOUND'; chatId: string }
  | { status: 'START_NOT_FOUND' }
  | { status: 'MULTIPLE_PRIVATE_CHATS' };

export type ModerationSetupResult =
  | ModerationStartResult
  | { status: 'TELEGRAM_REQUEST_FAILED' }
  | { status: 'TELEGRAM_RESPONSE_INVALID' };

const asRecord = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' ? (value as UnknownRecord) : null;

const numericId = (value: unknown): string | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const id = String(value);
  return /^-?\d+$/.test(id) ? id : null;
};

const isPrivateStart = (value: unknown): string | null => {
  const message = asRecord(value);
  const chat = asRecord(message?.chat);
  const sender = asRecord(message?.from);
  const chatId = numericId(chat?.id);
  const senderId = numericId(sender?.id);
  const text = typeof message?.text === 'string' ? message.text.trim() : '';

  if (
    chat?.type !== 'private' ||
    !chatId ||
    chatId !== senderId ||
    !/^\/start(?:@[a-z0-9_]+)?(?:\s|$)/iu.test(text)
  ) {
    return null;
  }

  return chatId;
};

/** Extracts only one unambiguous private /start chat; group updates are ignored. */
export const findModerationStartChat = (
  updates: unknown,
): ModerationStartResult => {
  if (!Array.isArray(updates)) return { status: 'START_NOT_FOUND' };

  const ids = new Set<string>();
  for (const updateValue of updates) {
    const update = asRecord(updateValue);
    const id = isPrivateStart(update?.message);
    if (id) ids.add(id);
  }

  if (ids.size === 0) return { status: 'START_NOT_FOUND' };
  if (ids.size > 1) return { status: 'MULTIPLE_PRIVATE_CHATS' };
  return { status: 'FOUND', chatId: [...ids][0] };
};

/** Reads only the minimum Bot API update data and returns no raw provider payload. */
export const requestModerationStartChat = async (
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<ModerationSetupResult> => {
  try {
    const response = await fetchFn(
      `https://api.telegram.org/bot${token}/getUpdates?limit=100&timeout=0&allowed_updates=%5B%22message%22%5D`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) return { status: 'TELEGRAM_REQUEST_FAILED' };
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') {
      return { status: 'TELEGRAM_RESPONSE_INVALID' };
    }

    const data = payload as { ok?: unknown; result?: unknown };
    if (data.ok !== true) return { status: 'TELEGRAM_REQUEST_FAILED' };
    return findModerationStartChat(data.result);
  } catch {
    return { status: 'TELEGRAM_REQUEST_FAILED' };
  }
};

const samePrivateChat = (chatValue: unknown, expectedId: string): boolean => {
  const chat = asRecord(chatValue);
  return chat?.type === 'private' && numericId(chat.id) === expectedId;
};

/** Require both the private conversation and the acting user to match the allowlisted ID. */
export const isAuthorizedModerationUpdate = (
  updateValue: unknown,
  configuredChatId: string | null | undefined,
): boolean => {
  const expectedId = configuredChatId ? numericId(configuredChatId) : null;
  const update = asRecord(updateValue);
  if (!expectedId || !update) return false;

  const message = asRecord(update.message);
  if (message) {
    const sender = asRecord(message.from);
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    return (
      samePrivateChat(message.chat, expectedId) &&
      numericId(sender?.id) === expectedId &&
      text.startsWith('/')
    );
  }

  const callback = asRecord(update.callback_query);
  if (!callback) return false;
  const callbackMessage = asRecord(callback.message);
  const callbackChat = asRecord(callbackMessage?.chat);
  const sender = asRecord(callback.from);

  return (
    samePrivateChat(callbackChat, expectedId) &&
    numericId(sender?.id) === expectedId
  );
};
