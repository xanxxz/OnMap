import {
  findModerationStartChat,
  isAuthorizedModerationUpdate,
  requestModerationStartChat,
} from './telegram-moderation.access';
import {
  parseModerationCallback,
  parseRestrictionHours,
} from './telegram-moderation.constants';

describe('Telegram moderation access', () => {
  const privateStart = (chatId: number, text = '/start') => ({
    update_id: 1,
    message: {
      text,
      chat: { id: chatId, type: 'private' },
      from: { id: chatId },
    },
  });

  it('extracts only private /start chat ID', () => {
    expect(
      findModerationStartChat([
        { message: { text: '/start', chat: { id: -123, type: 'group' } } },
        privateStart(123456),
      ]),
    ).toEqual({ status: 'FOUND', chatId: '123456' });
  });

  it('does not accept ambiguous or missing setup updates', () => {
    expect(findModerationStartChat([])).toEqual({ status: 'START_NOT_FOUND' });
    expect(findModerationStartChat([privateStart(1), privateStart(2)])).toEqual(
      { status: 'MULTIPLE_PRIVATE_CHATS' },
    );
  });

  it('uses a mocked Bot API response and returns only the extracted chat ID', async () => {
    const fetchMock = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, result: [privateStart(123456)] }),
        {
          status: 200,
        },
      ),
    );

    await expect(
      requestModerationStartChat('test-token-never-logged', fetchMock),
    ).resolves.toEqual({ status: 'FOUND', chatId: '123456' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not expose Telegram error payloads from setup requests', async () => {
    const fetchMock = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          description: 'sensitive provider detail',
        }),
        { status: 200 },
      ),
    );

    await expect(
      requestModerationStartChat('test-token-never-logged', fetchMock),
    ).resolves.toEqual({ status: 'TELEGRAM_REQUEST_FAILED' });
  });

  it('authorizes moderation commands only from the configured private chat and sender', () => {
    expect(
      isAuthorizedModerationUpdate(privateStart(123456, '/review'), '123456'),
    ).toBe(true);
    expect(
      isAuthorizedModerationUpdate(privateStart(999, '/review'), '123456'),
    ).toBe(false);
    expect(
      isAuthorizedModerationUpdate(
        {
          message: {
            text: '/review',
            chat: { id: 123456, type: 'private' },
            from: { id: 999 },
          },
        },
        '123456',
      ),
    ).toBe(false);
  });

  it('authorizes inline callbacks only when both message chat and clicker match', () => {
    const update = {
      callback_query: {
        from: { id: 123456 },
        message: { chat: { id: 123456, type: 'private' } },
        data: 'moderate:resolve:42',
      },
    };
    expect(isAuthorizedModerationUpdate(update, '123456')).toBe(true);
    expect(
      isAuthorizedModerationUpdate(
        {
          ...update,
          callback_query: { ...update.callback_query, from: { id: 9 } },
        },
        '123456',
      ),
    ).toBe(false);
    expect(isAuthorizedModerationUpdate(update, undefined)).toBe(false);
  });

  it('accepts only configured finite restriction durations in callbacks', () => {
    const eventId = '00000000-0000-4000-8000-000000000001';
    const durations = parseRestrictionHours('24,168,720');
    expect(parseModerationCallback(`ban:${eventId}:168`, durations)).toEqual({
      kind: 'RESTRICT',
      eventId,
      hours: 168,
    });
    expect(
      parseModerationCallback(`ban:${eventId}:999999`, durations),
    ).toBeNull();
    expect(parseRestrictionHours('never')).toEqual([24, 168, 720]);
  });
});
