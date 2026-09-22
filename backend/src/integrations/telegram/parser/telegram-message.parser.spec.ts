import {
  BALAKOVO_LOCATION_DICTIONARY,
  findBalakovoLocationAlias,
} from './balakovo-location.dictionary';
import { TelegramMessageParser } from './telegram-message.parser';
import type { CityConfig } from '../../../cities/city.types';
import type {
  TelegramParserMessage,
  TelegramParserResult,
} from './telegram-parser.types';

const BASE_TIME = Date.parse('2026-08-25T12:00:00.000Z');
const CHAT_ID = '-100-balakovo';

const message = (
  text: string,
  minutesBefore = 0,
  chatId = CHAT_ID,
): TelegramParserMessage => ({
  text,
  publishedAt: new Date(BASE_TIME - minutesBefore * 60_000).toISOString(),
  chatId,
  cityId: 'balakovo',
  authorName: 'Test author',
});

interface ParserCase {
  readonly name: string;
  readonly text: string;
  readonly expected: Partial<TelegramParserResult>;
}

const CASES: readonly ParserCase[] = [
  {
    name: 'accident with known street',
    text: 'авария на комарова',
    expected: {
      eventType: 'ACCIDENT',
      intent: 'REPORT',
      state: 'ACTIVE',
      locationText: 'Улица Комарова',
      locationAlias: 'komarova',
    },
  },
  {
    name: 'DTP near station',
    text: 'дтп возле вокзала',
    expected: {
      eventType: 'ACCIDENT',
      locationText: 'вокзал',
      locationAlias: 'railway-station',
    },
  },
  {
    name: 'cars collided on generic bridge',
    text: 'две машины столкнулись на мосту',
    expected: { eventType: 'ACCIDENT', locationText: 'мост' },
  },
  {
    name: 'crashed on Transportnaya',
    text: 'врезались на транспортной',
    expected: {
      eventType: 'ACCIDENT',
      locationAlias: 'transportnaya',
    },
  },
  {
    name: 'collision on Mira',
    text: 'столкновение на мира',
    expected: { eventType: 'ACCIDENT', locationAlias: 'mira' },
  },
  {
    name: 'car drove into another at peremychka',
    text: 'машина въехала на перемычке',
    expected: { eventType: 'ACCIDENT', locationAlias: 'peremychka' },
  },
  {
    name: 'vehicle overturned near Natalyino',
    text: 'перевернулась возле натальино',
    expected: { eventType: 'ACCIDENT', locationAlias: 'natalyino' },
  },
  {
    name: 'pedestrian collision near AES',
    text: 'сбили на аэс',
    expected: { eventType: 'ACCIDENT', locationAlias: 'aes' },
  },
  {
    name: 'resolved accident in one message',
    text: 'авария на комарова уже разъехались',
    expected: {
      eventType: 'ACCIDENT',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationAlias: 'komarova',
    },
  },
  {
    name: 'jam on new bridge',
    text: 'пробка на новом мосту',
    expected: { eventType: 'TRAFFIC_JAM', locationAlias: 'bridge-pobedy' },
  },
  {
    name: 'traffic stands',
    text: 'движение стоит',
    expected: { eventType: 'TRAFFIC_JAM', locationText: null },
  },
  {
    name: 'everything stands on bridge',
    text: 'все стоит на мосту',
    expected: { eventType: 'TRAFFIC_JAM', locationText: 'мост' },
  },
  {
    name: 'Transportnaya barely moves',
    text: 'еле едет транспортная',
    expected: { eventType: 'TRAFFIC_JAM', locationAlias: 'transportnaya' },
  },
  {
    name: 'jam near station',
    text: 'затор возле вокзала',
    expected: { eventType: 'TRAFFIC_JAM', locationAlias: 'railway-station' },
  },
  {
    name: 'slow traffic in microdistricts',
    text: 'тянучка в микрах',
    expected: { eventType: 'TRAFFIC_JAM', locationAlias: 'microdistricts' },
  },
  {
    name: 'dense traffic on Pobedy bridge',
    text: 'плотное движение на мосту победы',
    expected: { eventType: 'TRAFFIC_JAM', locationAlias: 'bridge-pobedy' },
  },
  {
    name: 'slow traffic on Transportnaya',
    text: 'медленно на транспортной',
    expected: { eventType: 'TRAFFIC_JAM', locationAlias: 'transportnaya' },
  },
  {
    name: 'closure on generic bridge',
    text: 'перекрыли мост',
    expected: { eventType: 'ROAD_CLOSURE', locationText: 'мост' },
  },
  {
    name: 'road closed without location',
    text: 'дорога закрыта',
    expected: { eventType: 'ROAD_CLOSURE', locationText: null },
  },
  {
    name: 'no passage',
    text: 'проезда нет',
    expected: { eventType: 'ROAD_CLOSURE', state: 'ACTIVE' },
  },
  {
    name: 'cannot pass Transportnaya',
    text: 'не проехать по транспортной',
    expected: { eventType: 'ROAD_CLOSURE', locationAlias: 'transportnaya' },
  },
  {
    name: 'traffic closed on new bridge',
    text: 'движение перекрыто на новом мосту',
    expected: { eventType: 'ROAD_CLOSURE', locationAlias: 'bridge-pobedy' },
  },
  {
    name: 'Mira passage reopened',
    text: 'проезд открыт на мира',
    expected: {
      eventType: 'ROAD_CLOSURE',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationAlias: 'mira',
    },
  },
  {
    name: 'traffic resumed at ZhG',
    text: 'снова проезжают на жг',
    expected: {
      eventType: 'ROAD_CLOSURE',
      state: 'RESOLVED',
      locationAlias: 'zhg',
    },
  },
  {
    name: 'bridge is being repaired',
    text: 'ремонтируют мост',
    expected: { eventType: 'ROADWORKS', locationText: 'мост' },
  },
  {
    name: 'roadworks on Komarova',
    text: 'дорожные работы на комарова',
    expected: { eventType: 'ROADWORKS', locationAlias: 'komarova' },
  },
  {
    name: 'Mira is being asphalted',
    text: 'асфальтируют мира',
    expected: { eventType: 'ROADWORKS', locationAlias: 'mira' },
  },
  {
    name: 'asphalt is removed on Transportnaya',
    text: 'снимают асфальт на транспортной',
    expected: { eventType: 'ROADWORKS', locationAlias: 'transportnaya' },
  },
  {
    name: 'bridge repair phrase',
    text: 'ремонт моста',
    expected: { eventType: 'ROADWORKS', locationText: null },
  },
  {
    name: 'pothole on Komarova',
    text: 'яма на комарова',
    expected: { eventType: 'HAZARD', locationAlias: 'komarova' },
  },
  {
    name: 'tree on road',
    text: 'дерево на дороге',
    expected: { eventType: 'HAZARD', locationText: null },
  },
  {
    name: 'water near station',
    text: 'вода на дороге возле вокзала',
    expected: { eventType: 'HAZARD', locationAlias: 'railway-station' },
  },
  {
    name: 'wires on road',
    text: 'провода лежат на дороге',
    expected: { eventType: 'HAZARD', locationText: null },
  },
  {
    name: 'obstacle on new bridge',
    text: 'препятствие на новом мосту',
    expected: { eventType: 'HAZARD', locationAlias: 'bridge-pobedy' },
  },
  {
    name: 'ice on Pobedy bridge',
    text: 'лед на мосту победы',
    expected: { eventType: 'HAZARD', locationAlias: 'bridge-pobedy' },
  },
  {
    name: 'dangerous section in microdistricts',
    text: 'опасный участок в микрах',
    expected: { eventType: 'HAZARD', locationAlias: 'microdistricts' },
  },
  {
    name: 'object on road near Natalyino',
    text: 'предмет на дороге возле натальино',
    expected: { eventType: 'HAZARD', locationAlias: 'natalyino' },
  },
  {
    name: 'question about Transportnaya',
    text: 'как транспортная?',
    expected: {
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      state: 'UNKNOWN',
      locationAlias: 'transportnaya',
      locationResolutionAllowed: false,
    },
  },
  {
    name: 'question about new bridge',
    text: 'как новый мост?',
    expected: {
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      locationAlias: 'bridge-pobedy',
    },
  },
  {
    name: 'question about Komarova',
    text: 'что на комарова?',
    expected: {
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      locationAlias: 'komarova',
    },
  },
  {
    name: 'reverse-order question about Pobedy bridge',
    text: 'мост победы как',
    expected: {
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      state: 'UNKNOWN',
      locationAlias: 'bridge-pobedy',
      locationResolutionAllowed: false,
    },
  },
  {
    name: 'cleans reverse question words from a route location',
    text: 'мост победы на микры как?',
    expected: {
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      locationText: 'мост победы микры',
      locationResolutionAllowed: false,
    },
  },
  {
    name: 'reverse what-is-there question about Transportnaya',
    text: 'транспортная что там',
    expected: {
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      locationAlias: 'transportnaya',
    },
  },
  {
    name: 'how-is-it-there question about new bridge',
    text: 'как там новый мост',
    expected: {
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      locationAlias: 'bridge-pobedy',
    },
  },
  {
    name: 'clean-state wording with a question mark remains a question',
    text: 'новый мост чисто?',
    expected: {
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      state: 'UNKNOWN',
      locationAlias: 'bridge-pobedy',
      locationResolutionAllowed: false,
    },
  },
  {
    name: 'question about DPS on Mira',
    text: 'где дпс на мира?',
    expected: {
      eventType: 'DPS',
      intent: 'QUESTION',
      locationAlias: 'mira',
      locationResolutionAllowed: false,
    },
  },
  {
    name: 'DPS on Transportnaya',
    text: 'дпс на транспортной',
    expected: {
      eventType: 'DPS',
      locationAlias: 'transportnaya',
      locationResolutionAllowed: true,
    },
  },
  {
    name: 'GIBDD near station',
    text: 'гибдд возле вокзала',
    expected: { eventType: 'DPS', locationAlias: 'railway-station' },
  },
  {
    name: 'traffic police on new bridge',
    text: 'гаишники на новом мосту',
    expected: { eventType: 'DPS', locationAlias: 'bridge-pobedy' },
  },
  {
    name: 'traffic police near AES',
    text: 'гайцы на аэс',
    expected: { eventType: 'DPS', locationAlias: 'aes' },
  },
  {
    name: 'crew at peremychka',
    text: 'экипаж стоит на перемычке',
    expected: { eventType: 'DPS', locationAlias: 'peremychka' },
  },
  {
    name: 'active post at ZhG',
    text: 'пост актив на жг',
    expected: { eventType: 'DPS', locationAlias: 'zhg' },
  },
  {
    name: 'DPS no longer on Transportnaya',
    text: 'дпс уже нет на транспортной',
    expected: {
      eventType: 'DPS',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationAlias: 'transportnaya',
      locationResolutionAllowed: true,
    },
  },
  {
    name: 'local numbered sticks slang is a DPS report',
    text: 'Мировский мост, 4 палки в обе стороны',
    expected: {
      eventType: 'DPS',
      intent: 'REPORT',
      state: 'ACTIVE',
      locationAlias: 'mirovsky-bridge',
      locationResolutionAllowed: true,
    },
  },
  {
    name: 'local numbered sticks slang works without location context',
    text: '4 палки в обе стороны',
    expected: {
      eventType: 'DPS',
      intent: 'REPORT',
      state: 'ACTIVE',
      locationText: null,
      locationResolutionAllowed: false,
    },
  },
  {
    name: 'jam on gateway bridge alias',
    text: 'пробка на шлюзовом мосту',
    expected: { eventType: 'TRAFFIC_JAM', locationAlias: 'gateway-bridge' },
  },
  {
    name: 'hazard on khimmost alias',
    text: 'яма на химмосту',
    expected: { eventType: 'HAZARD', locationAlias: 'khimmost' },
  },
  {
    name: 'unknown intersection without separator',
    text: 'авария менделеева комарова',
    expected: {
      eventType: 'ACCIDENT',
      locationText: 'менделеева комарова',
      locationAlias: null,
    },
  },
  {
    name: 'unknown intersection with slash',
    text: 'авария менделеева / комарова',
    expected: {
      eventType: 'ACCIDENT',
      locationText: 'менделеева / комарова',
      locationAlias: null,
    },
  },
  {
    name: 'unknown intersection with conjunction',
    text: 'авария менделеева и комарова',
    expected: {
      eventType: 'ACCIDENT',
      locationText: 'менделеева / комарова',
      locationAlias: null,
    },
  },
  {
    name: 'unknown explicit intersection',
    text: 'дтп перекресток менделеева комарова',
    expected: { eventType: 'ACCIDENT', locationText: 'менделеева комарова' },
  },
  {
    name: 'selects the strongest deterministic event from multiple events',
    text: 'авария и пробка на комарова',
    expected: { eventType: 'ACCIDENT', locationAlias: 'komarova' },
  },
  {
    name: 'normalizes case punctuation and street abbreviation',
    text: '  ДТП!!! НА УЛ. МИРА  ',
    expected: { eventType: 'ACCIDENT', locationAlias: 'mira' },
  },
  {
    name: 'normalizes dash around DPS location',
    text: 'ДПС—на ЖГ',
    expected: { eventType: 'DPS', locationAlias: 'zhg' },
  },
  {
    name: 'normalizes repeated spaces',
    text: 'пробка   на новом   мосту',
    expected: { eventType: 'TRAFFIC_JAM', locationAlias: 'bridge-pobedy' },
  },
  ...[
    'доброе утро',
    'спасибо',
    'кто домой',
    '0750',
    '',
    '🚗🚗🚗',
    'https://example.com',
    'машины стоят',
    'новый пост в канале',
    'чисто',
    'свободно',
    'стоят',
    'как дела',
    'как обычно',
    'вот как бывает',
  ].map((text): ParserCase => ({
    name: `noise: ${text || 'empty'}`,
    text,
    expected: {
      matched: false,
      eventType: 'OTHER',
      intent: 'NOISE',
      locationResolutionAllowed: false,
    },
  })),
];

describe('TelegramMessageParser', () => {
  const parser = new TelegramMessageParser();

  it.each(CASES)('$name', ({ text, expected }) => {
    const result = parser.parse({ message: message(text) });

    expect(result).toMatchObject({ matched: true, ...expected });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('inherits accident type and location for a resolution', () => {
    const result = parser.parse({
      message: message('разъехались'),
      previousMessages: [message('авария на комарова', 2)],
    });

    expect(result).toMatchObject({
      eventType: 'ACCIDENT',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationAlias: 'komarova',
      contextUsed: true,
    });
  });

  it('inherits closure through an explicit reply', () => {
    const result = parser.parse({
      message: message('открыли'),
      replyMessage: message('проезда нет на новом мосту', 10),
      previousMessages: [message('пробка на транспортной', 1)],
    });

    expect(result).toMatchObject({
      eventType: 'ROAD_CLOSURE',
      intent: 'RESOLUTION',
      locationAlias: 'bridge-pobedy',
      contextUsed: true,
    });
  });

  it('uses a location question as context for a clean road-state answer', () => {
    const result = parser.parse({
      message: message('чисто'),
      previousMessages: [message('как транспортная?', 1)],
    });

    expect(result).toMatchObject({
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationAlias: 'transportnaya',
      contextUsed: true,
    });
  });

  it('inherits a cleaned reverse-question location through reply context', () => {
    const result = parser.parse({
      message: message('чисто'),
      replyMessage: message('мост победы как', 1),
    });

    expect(result).toMatchObject({
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationText: 'Мост Победы',
      locationAlias: 'bridge-pobedy',
      locations: [{ text: 'Мост Победы', alias: 'bridge-pobedy' }],
      contextUsed: true,
    });
  });

  it('returns every explicit comma-separated location', () => {
    const result = parser.parse({
      message: message('кп, лисий хвост, химмост чисто'),
    });

    expect(result).toMatchObject({
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationText: 'кп',
      locationAlias: null,
      locations: [
        { text: 'кп', alias: null },
        { text: 'лисий хвост', alias: null },
        { text: 'химмост', alias: 'khimmost' },
      ],
    });
  });

  it('splits a slash list of known non-street locations', () => {
    const result = parser.parse({
      message: message('кп / химмост чисто'),
    });

    expect(result.locations).toEqual([
      { text: 'кп', alias: null },
      { text: 'химмост', alias: 'khimmost' },
    ]);
  });

  it('keeps a street slash expression as one intersection location', () => {
    const result = parser.parse({
      message: message('авария менделеева / комарова'),
    });

    expect(result.locations).toEqual([
      { text: 'менделеева / комарова', alias: null },
    ]);
  });

  it('resolves a traffic jam from a short clean follow-up', () => {
    const result = parser.parse({
      message: message('чисто'),
      previousMessages: [message('пробка на мосту', 1)],
    });

    expect(result).toMatchObject({
      eventType: 'TRAFFIC_JAM',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationText: 'мост',
      contextUsed: true,
    });
  });

  it('inherits DPS location and state like any other event type', () => {
    const result = parser.parse({
      message: message('уехали'),
      previousMessages: [message('дпс на новом мосту', 1)],
    });

    expect(result).toMatchObject({
      eventType: 'DPS',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationAlias: 'bridge-pobedy',
      locationResolutionAllowed: true,
      contextUsed: true,
    });
  });

  it('inherits an active DPS update from context', () => {
    const result = parser.parse({
      message: message('еще стоят'),
      previousMessages: [message('гайцы на аэс', 2)],
    });

    expect(result).toMatchObject({
      eventType: 'DPS',
      intent: 'UPDATE',
      state: 'ACTIVE',
      locationAlias: 'aes',
      contextUsed: true,
    });
  });

  it('does not inherit context outside the time window', () => {
    const result = parser.parse({
      message: message('чисто'),
      previousMessages: [message('пробка на новом мосту', 21)],
    });

    expect(result).toMatchObject({ matched: false, contextUsed: false });
  });

  it('allows an explicit reply to outlive the shorter previous-message window', () => {
    const result = parser.parse({
      message: message('чисто'),
      replyMessage: message('как новый мост?', 30),
      previousMessages: [message('дпс на транспортной', 1)],
    });

    expect(result).toMatchObject({
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      locationAlias: 'bridge-pobedy',
      contextSource: 'REPLY',
    });
  });

  it('does not inherit context from another chat', () => {
    const result = parser.parse({
      message: message('чисто'),
      previousMessages: [
        message('пробка на новом мосту', 1, '-100-other-chat'),
      ],
    });

    expect(result).toMatchObject({ matched: false, contextUsed: false });
  });

  it('uses reply context before newer unrelated nearby messages', () => {
    const result = parser.parse({
      message: message('разъехались'),
      replyMessage: message('авария на комарова', 10),
      previousMessages: [message('пробка на новом мосту', 1)],
    });

    expect(result).toMatchObject({
      eventType: 'ACCIDENT',
      locationAlias: 'komarova',
      contextUsed: true,
    });
  });

  it('limits previous context to five nearest messages', () => {
    const result = parser.parse({
      message: message('чисто'),
      previousMessages: [
        message('не относится', 1),
        message('тоже шум', 2),
        message('спасибо', 3),
        message('добрый день', 4),
        message('кто домой', 5),
        message('пробка на новом мосту', 6),
      ],
    });

    expect(result).toMatchObject({ matched: false, contextUsed: false });
  });

  it('turns a location-less report after a question into an update', () => {
    const result = parser.parse({
      message: message('пробка'),
      previousMessages: [message('как новый мост?', 1)],
    });

    expect(result).toMatchObject({
      eventType: 'TRAFFIC_JAM',
      intent: 'UPDATE',
      locationAlias: 'bridge-pobedy',
      contextUsed: true,
    });
  });

  it('keeps a new explicit event independent from unrelated context', () => {
    const result = parser.parse({
      message: message('яма на мира'),
      previousMessages: [message('авария на комарова', 1)],
    });

    expect(result).toMatchObject({
      eventType: 'HAZARD',
      intent: 'REPORT',
      locationAlias: 'mira',
      contextUsed: false,
    });
  });

  it.each([
    'Чисто было 5 минут назад',
    'Чисто 5 минут назад было',
    'чисто было минут 15 назад',
    'Чисто 15 мин назад',
    'Чисто было час назад',
    'Десять минут назад чисто',
    'На данный момент чисто',
  ])('does not extract a temporal phrase as location: %s', (text) => {
    const result = parser.parse({ message: message(text) });

    expect(result).toMatchObject({
      matched: false,
      locationText: null,
      locations: [],
    });
  });

  it.each([
    'Чисто было час назад',
    'Десять минут назад чисто',
    'На данный момент чисто',
  ])('inherits reply location after removing verbal time: %s', (text) => {
    const result = parser.parse({
      message: message(text),
      replyMessage: message('как гэс?', 10),
    });

    expect(result).toMatchObject({
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      locationAlias: 'ges',
      contextSource: 'REPLY',
    });
  });

  it('cleans question words inside a comma-separated location list', () => {
    const result = parser.parse({
      message: message('Хим мост как, на Саратов?'),
    });

    expect(result).toMatchObject({
      matched: true,
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      locations: [
        { text: 'химмост', alias: 'khimmost' },
        { text: 'Поворот на Саратов', alias: 'saratov-turn' },
      ],
    });
  });

  it('keeps a multi-location question when a later location is known', () => {
    const result = parser.parse({
      message: message('Как вокзальная, комарова поживает?'),
    });

    expect(result).toMatchObject({
      matched: true,
      intent: 'QUESTION',
      locations: [
        { text: 'Улица Вокзальная', alias: 'vokzalnaya' },
        { text: 'Улица Комарова', alias: 'komarova' },
      ],
    });
  });

  it('recognizes a numbered microdistrict location question', () => {
    const result = parser.parse({ message: message('Как 1 микрорайон') });

    expect(result).toMatchObject({
      matched: true,
      eventType: 'ROAD_STATE',
      intent: 'QUESTION',
      locationText: '1-й микрорайон',
      locationAlias: 'first-microdistrict',
    });
  });

  it.each([
    ['ГЭС стоят', 'ГЭС', 'ges'],
    ['Строительная волжская стоят', 'строительная волжская', null],
    ['Макси стоят', 'макси', null],
  ])(
    'recognizes location-qualified DPS standing report: %s',
    (text, locationText, locationAlias) => {
      const result = parser.parse({ message: message(text) });

      expect(result).toMatchObject({
        matched: true,
        eventType: 'DPS',
        intent: 'REPORT',
        state: 'ACTIVE',
        locationText,
        locationAlias,
      });
    },
  );

  it('keeps the direction target as metadata instead of a competing location', () => {
    const result = parser.parse({
      message: message('шкода от мотостелса в сторону ленты'),
    });

    expect(result).toMatchObject({
      eventType: 'DPS',
      locations: [{ text: 'Мотостелс', alias: 'motostels' }],
      direction: {
        relation: 'TOWARDS',
        targetLocationId: 'lenta',
      },
    });
  });

  it.each([
    ['дпс на гэс', 'ges'],
    ['дпс у загса', 'registry-office'],
    ['дпс на админке', 'admin-building'],
  ])('resolves corpus-confirmed landmark alias: %s', (text, locationAlias) => {
    const result = parser.parse({ message: message(text) });

    expect(result).toMatchObject({ eventType: 'DPS', locationAlias });
  });

  it('suppresses a long editorial court article mentioning an accident', () => {
    const result = parser.parse({
      message: message(
        'Верховный суд России удовлетворил иск о взыскании ущерба от ДТП с собственника автомобиля. Суд изучил материалы дела и решение нижестоящей инстанции. Во время аварии автомобилем управлял другой водитель, а участники позднее обратились за возмещением причиненного ущерба.',
      ),
    });

    expect(result).toMatchObject({
      matched: false,
      eventType: 'OTHER',
      intent: 'NOISE',
      reason: 'editorial-accident-reference',
    });
    expect(result.confidence).toBeLessThan(0.75);
  });

  it('keeps a short realtime accident report after editorial suppression', () => {
    const result = parser.parse({
      message: message('дтп на шевченко оформляют'),
    });

    expect(result).toMatchObject({
      matched: true,
      eventType: 'ACCIDENT',
      intent: 'REPORT',
      state: 'ACTIVE',
      locationText: 'улица Шевченко',
      locations: [
        { text: 'улица Шевченко', alias: 'улица-шевченко-c48dd96ec5' },
      ],
    });
  });

  it('suppresses the frozen-corpus informational driver news post mentioning ДТП', () => {
    const result = parser.parse({
      message: message(
        'Что изменилось для водителей с 1 сентября? Сентябрь принес автомобилистам несколько важных изменений. Разбираемся что нового появилось для водителей. Изменилась методика расчета ремонта и компенсации после ДТП. Подписаться. Прислать новость.',
      ),
    });

    expect(result).toMatchObject({
      matched: false,
      eventType: 'OTHER',
      intent: 'NOISE',
      reason: 'editorial-accident-reference',
    });
  });

  it('does not inherit road context into a promotional message', () => {
    const result = parser.parse({
      message: message(
        'Наконец-то появился новый эксклюзивный канал. Вступайте в сообщество и предлагайте вещи, которым уже нет места дома. Подпишись на группу.',
      ),
      previousMessages: [message('Атлант 4б актив', 1)],
    });

    expect(result).toMatchObject({
      matched: false,
      eventType: 'OTHER',
      intent: 'NOISE',
      contextUsed: false,
      reason: 'promotional-message',
    });
  });

  it.each(['как новый?', 'генезис 38 чисто', 'атлант 4б актив'])(
    'rejects repeated advertising after road context: %s',
    (contextText) => {
      const result = parser.parse({
        message: message(
          'Эксклюзивный канал Отдам Даром. Вступайте в сообщество, предлагайте вещи. Подпишись на группу.',
        ),
        previousMessages: [message(contextText, 1)],
      });

      expect(result).toMatchObject({
        matched: false,
        intent: 'NOISE',
        contextUsed: false,
        reason: 'promotional-message',
      });
    },
  );

  it('does not use context for a long unrelated message with an incidental resolution phrase', () => {
    const result = parser.parse({
      message: message(
        'Обсуждаем домашние вещи которым уже нет места и которые можно передать другим людям без всякой связи с дорогой',
      ),
      previousMessages: [message('дпс на транспортной', 1)],
    });

    expect(result).toMatchObject({
      matched: false,
      eventType: 'OTHER',
      contextUsed: false,
    });
  });

  it('reports explicit reply provenance for a real short resolution', () => {
    const result = parser.parse({
      message: { ...message('чисто'), externalId: 'current' },
      replyMessage: {
        ...message('как транспортная?', 1),
        externalId: 'reply-1',
      },
    });

    expect(result).toMatchObject({
      matched: true,
      intent: 'RESOLUTION',
      locationAlias: 'transportnaya',
      contextSource: 'REPLY',
      contextMessageId: 'reply-1',
    });
  });

  it('reports previous-message provenance for a real road question answer', () => {
    const result = parser.parse({
      message: { ...message('чисто'), externalId: 'current' },
      previousMessages: [
        {
          ...message('как новый мост?', 1),
          externalId: 'previous-1',
        },
      ],
    });

    expect(result).toMatchObject({
      matched: true,
      intent: 'RESOLUTION',
      locationAlias: 'bridge-pobedy',
      contextSource: 'PREVIOUS_MESSAGE',
      contextMessageId: 'previous-1',
    });
  });

  it.each([
    'оформляют',
    'стоят',
    'едут',
    'проехали',
    'разъехались',
    'работают',
    'убирают',
  ])('does not extract standalone action word as a location: %s', (action) => {
    const result = parser.parse({
      message: message(`дтп на шевченко, ${action}`),
    });

    expect(result.locations).toEqual([
      { text: 'улица Шевченко', alias: 'улица-шевченко-c48dd96ec5' },
    ]);
  });

  it.each([
    ['Ивановка кладбище чисто', 'ivanovka-cemetery', 'Кладбище у Ивановки'],
    ['кладбище ивановка чисто', 'ivanovka-cemetery', 'Кладбище у Ивановки'],
  ])(
    'resolves the Ivanovka cemetery phrase as one location: %s',
    (text, locationAlias, locationText) => {
      const result = parser.parse({ message: message(text) });

      expect(result).toMatchObject({
        eventType: 'ROAD_STATE',
        intent: 'RESOLUTION',
        locationAlias,
        locationText,
        locations: [{ text: locationText, alias: locationAlias }],
      });
    },
  );

  it('extracts Genesis and 38 as separate known locations', () => {
    const result = parser.parse({
      message: message('Генезис 38'),
    });

    expect(result).toMatchObject({
      matched: false,
      eventType: 'OTHER',
      intent: 'NOISE',
      locations: [
        { text: 'Генезис', alias: 'genesis' },
        {
          text: 'Остановка у 38-го училища',
          alias: 'school-38-stop',
        },
      ],
    });
  });

  it('keeps both Genesis and 38 locations in a road-state message', () => {
    const result = parser.parse({
      message: message('Генезис 38 чисто'),
    });

    expect(result).toMatchObject({
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      locations: [
        { text: 'Генезис', alias: 'genesis' },
        {
          text: 'Остановка у 38-го училища',
          alias: 'school-38-stop',
        },
      ],
    });
  });

  it('resolves Shlyuzy as the gateway bridge', () => {
    const result = parser.parse({ message: message('шлюзы чисто') });

    expect(result).toMatchObject({
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      locationText: 'Шлюзовой мост',
      locationAlias: 'gateway-bridge',
      locations: [{ text: 'Шлюзовой мост', alias: 'gateway-bridge' }],
    });
  });

  it('resolves standalone 38 only in a road-location context', () => {
    const result = parser.parse({ message: message('38 чисто') });

    expect(result).toMatchObject({
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      locationText: 'Остановка у 38-го училища',
      locationAlias: 'school-38-stop',
    });
  });

  it('does not turn 38 in ordinary text into a location event', () => {
    const result = parser.parse({ message: message('мне 38 лет спасибо') });

    expect(result).toMatchObject({
      matched: false,
      eventType: 'OTHER',
      intent: 'NOISE',
      locationText: null,
      locations: [],
    });
  });

  it('keeps 38 attached to an address-like unknown street expression', () => {
    const result = parser.parse({
      message: message('авария на менделеева 38'),
    });

    expect(result).toMatchObject({
      eventType: 'ACCIDENT',
      locations: [{ text: 'менделеева 38', alias: null }],
    });
  });

  it('does not split numeric 38 from a known street alias', () => {
    const result = parser.parse({
      message: message('авария на комарова 38'),
    });

    expect(result).toMatchObject({
      eventType: 'ACCIDENT',
      locations: [{ text: 'комарова 38', alias: null }],
    });
  });

  it('canonicalizes Transportnaya as a street', () => {
    const result = parser.parse({
      message: message('авария на транспортной'),
    });

    expect(result).toMatchObject({
      locationText: 'Улица Транспортная',
      locationAlias: 'transportnaya',
    });
    expect(findBalakovoLocationAlias('транспортная')).toMatchObject({
      title: 'Улица Транспортная',
      kind: 'STREET',
    });
  });

  it('keeps Transportnaya context inheritance after canonicalization', () => {
    const result = parser.parse({
      message: message('Чисто'),
      previousMessages: [message('Как транспортная?', 1)],
    });

    expect(result).toMatchObject({
      eventType: 'ROAD_STATE',
      intent: 'RESOLUTION',
      state: 'RESOLVED',
      locationText: 'Улица Транспортная',
      locationAlias: 'transportnaya',
      contextUsed: true,
    });
  });

  it.each([
    ['мир', 'cinema-mir', 'Кинотеатр «Мир»', 'LANDMARK'],
    ['кинотеатр мир', 'cinema-mir', 'Кинотеатр «Мир»', 'LANDMARK'],
    ['новый мост', 'bridge-pobedy', 'Мост Победы', 'BRIDGE'],
    ['на новом мосту', 'bridge-pobedy', 'Мост Победы', 'BRIDGE'],
    ['мост победы', 'bridge-pobedy', 'Мост Победы', 'BRIDGE'],
    ['маянга', 'mayanga', 'Маянга', 'SETTLEMENT'],
    ['кп маянга', 'mayanga-checkpoint', 'КП Маянга', 'LANDMARK'],
    ['3г', 'district-3g', '3Г', 'DISTRICT'],
    ['натальино', 'natalyino', 'Натальино', 'SETTLEMENT'],
    ['ивановка', 'ivanovka', 'Ивановка', 'SETTLEMENT'],
    ['подсосенки', 'podsosenki', 'Подсосенки', 'SETTLEMENT'],
    ['быков отрог', 'bykov-otrog', 'Быков Отрог', 'SETTLEMENT'],
    ['быковотрог', 'bykov-otrog', 'Быков Отрог', 'SETTLEMENT'],
    [
      'ивановка кладбище',
      'ivanovka-cemetery',
      'Кладбище у Ивановки',
      'LANDMARK',
    ],
    [
      'кладбище у ивановки',
      'ivanovka-cemetery',
      'Кладбище у Ивановки',
      'LANDMARK',
    ],
    ['шлюзы', 'gateway-bridge', 'Шлюзовой мост', 'BRIDGE'],
    ['шлюзовой мост', 'gateway-bridge', 'Шлюзовой мост', 'BRIDGE'],
    ['генезис', 'genesis', 'Генезис', 'LANDMARK'],
    ['38', 'school-38-stop', 'Остановка у 38-го училища', 'LANDMARK'],
    ['новый', 'bridge-pobedy', 'Мост Победы', 'BRIDGE'],
    ['победа', 'bridge-pobedy', 'Мост Победы', 'BRIDGE'],
    ['первом', 'first-microdistrict', '1-й микрорайон', 'DISTRICT'],
    ['первый', 'first-microdistrict', '1-й микрорайон', 'DISTRICT'],
    ['держуха', 'dzerzhinsky-district', 'Дзержинский район', 'DISTRICT'],
    ['дж', 'dzerzhinsky-district', 'Дзержинский район', 'DISTRICT'],
    ['оранж', 'orange', 'Оранж', 'LANDMARK'],
    ['оронж', 'orange', 'Оранж', 'LANDMARK'],
    ['хлеб завод', 'bread-factory', 'Хлебозавод', 'LANDMARK'],
    ['мистика', 'mystic', 'Мистик', 'LANDMARK'],
    ['мистике', 'mystic', 'Мистик', 'LANDMARK'],
    ['затонского', 'zatonsky', 'Затонский', 'LANDMARK'],
    ['поволжского', 'college-43', '43', 'LANDMARK'],
  ])('resolves confirmed dictionary alias %s', (alias, id, title, kind) => {
    expect(findBalakovoLocationAlias(alias)).toMatchObject({
      id,
      title,
      kind,
    });
  });

  it('keeps Mayanga and the Mayanga checkpoint as separate locations', () => {
    const mayanga = findBalakovoLocationAlias('маянга');
    const checkpoint = findBalakovoLocationAlias('кп маянга');

    expect(mayanga?.id).toBe('mayanga');
    expect(checkpoint?.id).toBe('mayanga-checkpoint');
    expect(mayanga?.id).not.toBe(checkpoint?.id);
  });

  it.each(['1кп', '1кпп'])(
    'does not merge an unconfirmed alias into the Mayanga checkpoint: %s',
    (alias) => {
      expect(findBalakovoLocationAlias(alias)).toBeUndefined();
    },
  );

  it('does not keep a separate New Bridge dictionary entity', () => {
    expect(
      BALAKOVO_LOCATION_DICTIONARY.some(({ id }) => id === 'new-bridge'),
    ).toBe(false);
  });

  it('does not keep the old Shlyuzy area as a duplicate entity', () => {
    expect(
      BALAKOVO_LOCATION_DICTIONARY.some(({ id }) => id === 'gateways'),
    ).toBe(false);
    expect(findBalakovoLocationAlias('шлюзы')?.kind).toBe('BRIDGE');
  });

  it('keeps Genesis and 38 as distinct canonical IDs', () => {
    const genesis = findBalakovoLocationAlias('генезис');
    const schoolStop = findBalakovoLocationAlias('38');

    expect(genesis?.id).toBe('genesis');
    expect(schoolStop?.id).toBe('school-38-stop');
    expect(genesis?.id).not.toBe(schoolStop?.id);
  });

  it.each([
    ['ГЭС актив шкода 0905', 'ges', 'ГЭС'],
    ['Шкода 0903 на генезис повернула', 'genesis', 'Генезис'],
    ['роснефть хавал 1069', 'rosneft', 'Роснефть'],
    ['43 два экипажа актив', 'college-43', '43'],
    ['АТК 2 машины актив', 'atk-stop', 'Остановка АТК'],
    ['Ивановка актив 2экипажа', 'ivanovka', 'Ивановка'],
    ['На гесе два экипажа', 'ges', 'ГЭС'],
    ['гэс 0740', 'ges', 'ГЭС'],
    ['Перемычка стоят', 'peremychka', 'Перемычка'],
    [
      'Магнит в первом, где перекопано актив',
      'magnit-first-microdistrict',
      'Магнит в 1-м микрорайоне',
    ],
  ])(
    'removes vehicle identifiers and unit counts from location: %s',
    (text, locationAlias, locationText) => {
      expect(parser.parse({ message: message(text) })).toMatchObject({
        eventType: 'DPS',
        locationAlias,
        locationText,
      });
    },
  );

  it('uses Ivanovka as an approximate settlement for the confirmed local description', () => {
    expect(
      parser.parse({
        message: message(
          'Ивановка стоят в конце деревни. Какой-то магаз там типа Магнита',
        ),
      }),
    ).toMatchObject({
      eventType: 'DPS',
      locationAlias: 'ivanovka',
      locationText: 'Ивановка',
      locations: [{ text: 'Ивановка', alias: 'ivanovka' }],
    });
  });

  it.each([
    ['Новый чисто', 'bridge-pobedy'],
    ['победа чисто 15 мин назад', 'bridge-pobedy'],
    ['Хлеб завод чисто', 'bread-factory'],
    ['Мистик актив минут 10 назад', 'mystic'],
    ['Затонский актив в сторону города', 'zatonsky'],
    ['Первый мистик чисто', 'mystic'],
    ['Саратовское шоссе авария 2 шкоды', 'saraovskoe-shosse'],
  ])('uses the curated canonical location for %s', (text, locationAlias) => {
    expect(parser.parse({ message: message(text) })).toMatchObject({
      locationAlias,
    });
  });

  it.each([
    ['авария короче', 'ACCIDENT'],
    ['Только что встала шкода', 'DPS'],
    ['5 минут назад проехал там, чисто', 'OTHER'],
  ])('does not retain parser noise as a location: %s', (text, eventType) => {
    expect(parser.parse({ message: message(text) })).toMatchObject({
      eventType,
      locationText: null,
      locations: [],
    });
  });

  it('does not treat a vehicle sale phrase "без ДТП" as an accident report', () => {
    expect(
      parser.parse({
        message: message(
          'Nissan X-trail 2023 год, один владелец, без ДТП, весь в родном окрасе',
        ),
      }),
    ).toMatchObject({ matched: false, eventType: 'OTHER', intent: 'NOISE' });
  });

  it.each([
    ['Комарова перед светофором авария', 'komarova', 'BEFORE', 'светофором'],
    [
      'Под новым мостом стоят со стороны районов',
      'bridge-pobedy',
      'NEAR',
      'районов',
    ],
    ['Шлюзы поворот на Титова стоят', 'gateway-bridge', 'TOWARDS', 'титова'],
    ['Шлюзы со стороны первого стоят', 'gateway-bridge', 'FROM', 'первого'],
    ['Шлюзы как ехать в жг стоят', 'gateway-bridge', 'TOWARDS', 'жг'],
    ['Хавал после химмоста', 'khimmost', 'AFTER', 'химмоста'],
    ['ДПС Комарова до Мистика', 'komarova', 'BETWEEN', 'мистика'],
    ['ДПС Комарова после Мистика', 'komarova', 'AFTER', 'мистика'],
    ['ДПС Комарова в сторону Мистика', 'komarova', 'TOWARDS', 'мистика'],
    ['ДПС Комарова около Мистика', 'komarova', 'NEAR', 'мистика'],
  ])(
    'separates base location and directional context: %s',
    (text, locationAlias, relation, targetText) => {
      expect(parser.parse({ message: message(text) })).toMatchObject({
        locationAlias,
        direction: { relation, targetText },
      });
    },
  );

  it('keeps a between-route as two canonical endpoints', () => {
    expect(
      parser.parse({
        message: message('От лав до натальино чисто 15 минут назад'),
      }),
    ).toMatchObject({
      intent: 'RESOLUTION',
      locations: [
        { text: 'Лав', alias: 'lav' },
        { text: 'Натальино', alias: 'natalyino' },
      ],
      direction: {
        relation: 'BETWEEN',
        targetLocationId: 'natalyino',
        targetText: 'натальино',
      },
    });
  });

  it.each([
    ['mystic', 52.010344, 47.781606],
    ['zatonsky', 52.047244, 47.845757],
    ['orange', 52.010467, 47.796863],
    ['bread-factory', 52.00003, 47.811354],
    ['college-43', 52.009728, 47.789546],
    ['atk-stop', 52.007722, 47.787775],
    ['rosneft', 52.003955, 47.818601],
    ['don-market', 52.021117, 47.83072],
    ['saratov-turn', 52.096462, 47.726992],
    ['transportnaya-pyatak', 52.00107, 47.814671],
    ['mayanga-checkpoint', 51.890798, 47.681388],
    ['motostels', 52.013296, 47.80907],
    ['lenta', 52.00552, 47.794321],
    ['aes', 52.059744, 47.938107],
    ['khimmost', 51.992771, 47.79725],
    ['peremychka', 52.015146, 47.787348],
    ['magnit-first-microdistrict', 52.008032, 47.783659],
  ])('keeps curated point coordinates for %s', (id, latitude, longitude) => {
    expect(
      BALAKOVO_LOCATION_DICTIONARY.find((location) => location.id === id),
    ).toMatchObject({
      verifiedCoordinates: { latitude, longitude },
    });
  });

  it('does not represent a street or an area as a fake exact point', () => {
    const street = findBalakovoLocationAlias('транспортная');
    const firstDistrict = findBalakovoLocationAlias('первом');
    const dzerzhinsky = findBalakovoLocationAlias('держуха');

    expect(street).toMatchObject({ kind: 'STREET' });
    expect(street).not.toHaveProperty('verifiedCoordinates');
    expect(firstDistrict).toMatchObject({ kind: 'DISTRICT' });
    expect(firstDistrict).not.toHaveProperty('verifiedCoordinates');
    expect(dzerzhinsky).toMatchObject({ kind: 'DISTRICT' });
    expect(dzerzhinsky).not.toHaveProperty('verifiedCoordinates');
  });

  it('keeps the verified area geometry of the first microdistrict', () => {
    expect(findBalakovoLocationAlias('первом')).toMatchObject({
      id: 'first-microdistrict',
      kind: 'DISTRICT',
      areaGeometry: {
        representativePoint: { latitude: 52.013637, longitude: 47.780417 },
        radiusMeters: 400,
      },
    });
  });

  it('keeps the verified area geometry of Dzerzhinsky district', () => {
    expect(findBalakovoLocationAlias('держуха')).toMatchObject({
      id: 'dzerzhinsky-district',
      kind: 'DISTRICT',
      areaGeometry: {
        representativePoint: { latitude: 52.044305, longitude: 47.810576 },
        radiusMeters: 350,
      },
    });
  });

  it('keeps the verified area geometry of district 3G', () => {
    expect(findBalakovoLocationAlias('3г')).toMatchObject({
      id: 'district-3g',
      kind: 'DISTRICT',
      areaGeometry: {
        representativePoint: { latitude: 52.016933, longitude: 47.804342 },
        radiusMeters: 150,
      },
    });
  });

  it('keeps the verified area geometry of ZhG', () => {
    expect(findBalakovoLocationAlias('жг')).toMatchObject({
      id: 'zhg',
      kind: 'DISTRICT',
      areaGeometry: {
        representativePoint: { latitude: 52.027801, longitude: 47.780465 },
        radiusMeters: 1000,
      },
    });
  });

  it('keeps the elongated verified area geometry of the microdistricts', () => {
    expect(findBalakovoLocationAlias('микры')).toMatchObject({
      id: 'microdistricts',
      kind: 'DISTRICT',
      areaGeometry: {
        representativePoint: { latitude: 52.016114, longitude: 47.814545 },
        radiusMeters: 2400,
        northSouthRadiusMeters: 900,
        eastWestRadiusMeters: 2400,
      },
    });
  });

  it('keeps the verified straight geometry of Komarova street', () => {
    expect(findBalakovoLocationAlias('комарова')).toMatchObject({
      id: 'komarova',
      kind: 'STREET',
      streetGeometry: {
        start: { latitude: 52.003748, longitude: 47.791052 },
        end: { latitude: 52.016113, longitude: 47.814574 },
      },
    });
  });

  it('keeps the verified geometry of Transportnaya street', () => {
    expect(findBalakovoLocationAlias('транспортная')).toMatchObject({
      id: 'transportnaya',
      kind: 'STREET',
      streetGeometry: {
        start: { latitude: 52.001476, longitude: 47.8143 },
        intermediate: [{ latitude: 51.983372, longitude: 47.83821 }],
        end: { latitude: 51.970455, longitude: 47.814011 },
      },
    });
  });

  it('keeps the verified straight geometry of Mira street', () => {
    expect(findBalakovoLocationAlias('улица мира')).toMatchObject({
      id: 'mira',
      kind: 'STREET',
      streetGeometry: {
        start: { latitude: 52.00517, longitude: 47.809132 },
        end: { latitude: 52.003758, longitude: 47.806472 },
      },
    });
  });

  it('keeps the verified segmented geometry of Vokzalnaya street', () => {
    expect(findBalakovoLocationAlias('вокзальная')).toMatchObject({
      id: 'vokzalnaya',
      kind: 'STREET',
      streetGeometry: {
        start: { latitude: 52.009982, longitude: 47.782016 },
        intermediate: [
          { latitude: 52.006995, longitude: 47.786137 },
          { latitude: 52.00656, longitude: 47.785817 },
          { latitude: 51.997068, longitude: 47.798854 },
        ],
        end: { latitude: 51.996366, longitude: 47.800424 },
        disconnectedParts: [
          {
            start: { latitude: 51.996366, longitude: 47.800424 },
            end: { latitude: 51.996169, longitude: 47.802442 },
          },
          {
            start: { latitude: 51.996366, longitude: 47.800424 },
            intermediate: [{ latitude: 51.995596, longitude: 47.801729 }],
            end: { latitude: 51.989124, longitude: 47.810674 },
          },
        ],
      },
    });
  });

  it('keeps Naberzhnaya Leonova as three disconnected street parts', () => {
    expect(findBalakovoLocationAlias('набережная леонова')).toMatchObject({
      id: 'naberezhnaya',
      title: 'Набережная Леонова',
      kind: 'STREET',
      streetGeometry: {
        start: { latitude: 52.006683, longitude: 47.785696 },
        end: { latitude: 52.011578, longitude: 47.792157 },
        disconnectedParts: [
          {
            start: { latitude: 52.012899, longitude: 47.790275 },
            end: { latitude: 52.033997, longitude: 47.831708 },
          },
          {
            start: { latitude: 52.024639, longitude: 47.817703 },
            end: { latitude: 52.032938, longitude: 47.83357 },
          },
        ],
      },
    });
  });

  it('keeps the verified geometry of Saratovskoe highway', () => {
    expect(findBalakovoLocationAlias('саратовское шоссе')).toMatchObject({
      id: 'saraovskoe-shosse',
      kind: 'STREET',
      streetGeometry: {
        start: { latitude: 51.962248, longitude: 47.738992 },
        intermediate: [
          { latitude: 52.02026, longitude: 47.849954 },
          { latitude: 52.021151, longitude: 47.849641 },
        ],
        end: { latitude: 52.034074, longitude: 47.831962 },
      },
    });
  });

  it('keeps Transportnaya pyatak separate from Transportnaya street', () => {
    const pyatak = findBalakovoLocationAlias('транспортная пятак');

    expect(pyatak).toMatchObject({
      id: 'transportnaya-pyatak',
      kind: 'LANDMARK',
      verifiedCoordinates: { latitude: 52.00107, longitude: 47.814671 },
    });
    expect(findBalakovoLocationAlias('транспортная')?.id).toBe('transportnaya');
  });

  it.each([
    '1кп',
    '1кпп',
    '1 микрорайон кп',
    '1микр кп',
    'три дороги',
    'треллер',
    'трэллер',
    'лисий хвост',
    'новая пристань',
    'кольцо 1180',
    'бывший ситилинк',
    'стелла быков отрог',
  ])('does not auto-confirm unknown local name: %s', (alias) => {
    expect(findBalakovoLocationAlias(alias)).toBeUndefined();
  });

  it('assigns more confidence to a known alias than an unknown location', () => {
    const known = parser.parse({ message: message('авария на комарова') });
    const unknown = parser.parse({
      message: message('авария менделеева комарова'),
    });

    expect(known.confidence).toBeGreaterThan(unknown.confidence);
  });

  it('contains at least 50 table-driven real-chat cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50);
  });

  it('uses only the dictionary selected by the trusted city id', () => {
    const testCity: CityConfig = {
      id: 'test-city',
      name: 'Тестовый город',
      center: { latitude: 55, longitude: 40 },
      defaultZoom: 12,
      coverageBounds: { north: 56, south: 54, east: 41, west: 39 },
      nearbyAreas: [],
      locations: [
        {
          id: 'test-street',
          title: 'Тестовая улица',
          aliases: ['тестовая'],
          kind: 'STREET',
        },
      ],
    };
    const cityParser = new TelegramMessageParser((cityId) =>
      cityId === testCity.id ? testCity : undefined,
    );
    const local = cityParser.parse({
      message: { ...message('авария тестовая'), cityId: testCity.id },
    });
    const foreign = cityParser.parse({
      message: { ...message('авария на комарова'), cityId: testCity.id },
    });
    const balakovo = parser.parse({ message: message('авария тестовая') });

    expect(local.locationAlias).toBe('test-street');
    expect(foreign.locationAlias).toBeNull();
    expect(foreign.locationText).toBe('комарова');
    expect(balakovo.locationAlias).toBeNull();
  });
});
