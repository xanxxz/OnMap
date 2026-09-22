import { normalizeTelegramMtprotoMessage } from './telegram-mtproto.mapper';
import type { TelegramMtprotoMessageEnvelope } from './telegram.types';

const CHAT_ID = '-100123';
const CITY_ID = 'balakovo';

const envelope = (
  overrides: Partial<TelegramMtprotoMessageEnvelope> = {},
): TelegramMtprotoMessageEnvelope => ({
  chatId: CHAT_ID,
  isChannel: false,
  isEdited: false,
  rawMessage: {
    id: 7,
    message: '  авария на комарова  ',
    date: 1_700_000_000,
    sender: { firstName: 'Иван', lastName: 'Иванов' },
  },
  ...overrides,
});

describe('normalizeTelegramMtprotoMessage', () => {
  it('normalizes an MTProto group message', () => {
    expect(
      normalizeTelegramMtprotoMessage(envelope(), CHAT_ID, CITY_ID),
    ).toEqual({
      externalId: 'telegram:-100123:7',
      source: 'TELEGRAM',
      cityId: CITY_ID,
      chatId: CHAT_ID,
      text: 'авария на комарова',
      publishedAt: '2023-11-14T22:13:20.000Z',
      authorName: 'Иван Иванов',
      rawSourceType: 'message',
    });
  });

  it('normalizes a channel post', () => {
    const result = normalizeTelegramMtprotoMessage(
      envelope({
        isChannel: true,
        rawMessage: {
          id: 8,
          message: 'Перекрыли мост',
          date: 1_700_000_000,
          postAuthor: 'Дорожный канал',
        },
      }),
      CHAT_ID,
      CITY_ID,
    );

    expect(result).toMatchObject({
      externalId: 'telegram:-100123:8',
      authorName: 'Дорожный канал',
      rawSourceType: 'channel_post',
    });
  });

  it('keeps the same externalId for an edited message', () => {
    const original = normalizeTelegramMtprotoMessage(
      envelope(),
      CHAT_ID,
      CITY_ID,
    );
    const edited = normalizeTelegramMtprotoMessage(
      envelope({
        isEdited: true,
        rawMessage: {
          id: 7,
          message: 'авария на комарова, разъехались',
          date: 1_700_000_000,
          editDate: 1_700_000_060,
        },
      }),
      CHAT_ID,
      CITY_ID,
    );

    expect(edited).toMatchObject({
      externalId: original?.externalId,
      editedAt: '2023-11-14T22:14:20.000Z',
      rawSourceType: 'edited_message',
    });
  });

  it.each([null, undefined])(
    'does not set editedAt when editDate is %p',
    (editDate) => {
      const result = normalizeTelegramMtprotoMessage(
        envelope({
          rawMessage: {
            id: 7,
            message: 'авария на комарова',
            date: 1_700_000_000,
            editDate,
          },
        }),
        CHAT_ID,
        CITY_ID,
      );

      expect(result).not.toHaveProperty('editedAt');
    },
  );

  it('extracts replyToExternalId without loading a reply chain', () => {
    const result = normalizeTelegramMtprotoMessage(
      envelope({
        rawMessage: {
          id: 9,
          message: 'разъехались',
          date: 1_700_000_000,
          replyTo: { replyToMsgId: 7 },
        },
      }),
      CHAT_ID,
      CITY_ID,
    );

    expect(result?.replyToExternalId).toBe('telegram:-100123:7');
  });

  it('ignores empty text safely', () => {
    const result = normalizeTelegramMtprotoMessage(
      envelope({
        rawMessage: { id: 10, message: '   ', date: 1_700_000_000 },
      }),
      CHAT_ID,
      CITY_ID,
    );

    expect(result).toBeNull();
  });
});
