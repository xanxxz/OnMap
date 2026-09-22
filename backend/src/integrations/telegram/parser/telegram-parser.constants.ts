import type {
  TelegramParserEventType,
  TelegramParserTermRule,
} from './telegram-parser.types';

export const TELEGRAM_PARSER_MAX_PREVIOUS_MESSAGES = 5;

export const TELEGRAM_PARSER_CONTEXT_WINDOW_MS = 20 * 60 * 1_000;

export const TELEGRAM_PARSER_REPLY_CONTEXT_WINDOW_MS = 2 * 60 * 60 * 1_000;

export const TELEGRAM_PARSER_MAX_LOCATION_LENGTH = 120;

const phrase = (source: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, 'u');

export const TELEGRAM_EVENT_TERM_RULES: Readonly<
  Record<
    Exclude<TelegramParserEventType, 'OTHER'>,
    readonly TelegramParserTermRule[]
  >
> = {
  DPS: [
    { term: 'дпс', pattern: phrase('дпс'), weight: 5 },
    { term: 'гибдд', pattern: phrase('гибдд'), weight: 5 },
    { term: 'актив', pattern: phrase('актив'), weight: 5 },
    { term: 'шкода', pattern: phrase('шкод(?:а|ы|у)?'), weight: 5 },
    { term: 'гаишники', pattern: phrase('гаишник(?:и|ов|ам)?'), weight: 4 },
    { term: 'гайцы', pattern: phrase('гайц(?:ы|ов|ам)?'), weight: 4 },
    { term: 'экипаж', pattern: phrase('экипаж(?:а|и|ей)?'), weight: 4 },
    { term: 'пост', pattern: phrase('пост(?:а|у|ом)?'), weight: 4 },
    {
      term: 'палки',
      pattern: phrase('\\d+\\s+пал(?:ка|ки|ок)'),
      weight: 5,
    },
    { term: 'стоят', pattern: phrase('стоят'), weight: 5 },
    { term: 'хавал', pattern: phrase('хавал'), weight: 5 },
    { term: 'встала', pattern: phrase('встал(?:а|и)?'), weight: 5 },
    {
      term: 'номер экипажа',
      pattern: phrase('(?:0\\d{3}|10\\d{2})'),
      weight: 4,
    },
    { term: 'с двух сторон', pattern: phrase('с двух сторон'), weight: 3 },
  ],
  ACCIDENT: [
    { term: 'дтп', pattern: phrase('(?<!без\\s)дтп'), weight: 5 },
    { term: 'авария', pattern: phrase('авари(?:я|и|ю|ей)'), weight: 5 },
    {
      term: 'столкнулись',
      pattern: phrase('столкнул(?:ись|ся|ась)|столкновение'),
      weight: 5,
    },
    {
      term: 'врезались',
      pattern: phrase('врезал(?:ся|ась|ись)'),
      weight: 5,
    },
    { term: 'въехал', pattern: phrase('въехал(?:а|и)?'), weight: 4 },
    {
      term: 'притерлись',
      pattern: phrase('притерл(?:ись|ся|ась)'),
      weight: 4,
    },
    {
      term: 'перевернулась',
      pattern: phrase('перевернул(?:ась|ся|ись)'),
      weight: 5,
    },
    { term: 'сбили', pattern: phrase('сбил(?:и|а)?'), weight: 5 },
    { term: 'разъехались', pattern: phrase('разъехались'), weight: 3 },
  ],
  TRAFFIC_JAM: [
    { term: 'пробка', pattern: phrase('пробк(?:а|и|у|ой)'), weight: 5 },
    { term: 'затор', pattern: phrase('затор(?:а|е|ы)?'), weight: 5 },
    {
      term: 'движение стоит',
      pattern: phrase('движение стоит'),
      weight: 5,
    },
    { term: 'все стоит', pattern: phrase('все стоит'), weight: 4 },
    { term: 'еле едет', pattern: phrase('еле едет'), weight: 4 },
    { term: 'тянучка', pattern: phrase('тянучк(?:а|и|у)'), weight: 4 },
    {
      term: 'плотное движение',
      pattern: phrase('плотное движение'),
      weight: 4,
    },
    { term: 'медленно', pattern: phrase('медленно'), weight: 2 },
  ],
  ROAD_CLOSURE: [
    {
      term: 'перекрыли',
      pattern: phrase('перекрыл(?:и|а|о)|перекрыт(?:а|о|ы)?'),
      weight: 5,
    },
    {
      term: 'дорога закрыта',
      pattern: phrase('дорог(?:а|у) закрыт(?:а|о)|закрыли дорогу'),
      weight: 5,
    },
    { term: 'проезда нет', pattern: phrase('проезда нет'), weight: 5 },
    {
      term: 'движение перекрыто',
      pattern: phrase('движение перекрыт(?:о|а)'),
      weight: 5,
    },
    { term: 'не проехать', pattern: phrase('не проехать'), weight: 5 },
    { term: 'открыли', pattern: phrase('открыли'), weight: 3 },
    { term: 'проезд открыт', pattern: phrase('проезд открыт'), weight: 4 },
    {
      term: 'снова проезжают',
      pattern: phrase('снова проезжают'),
      weight: 4,
    },
  ],
  ROADWORKS: [
    {
      term: 'ремонт дороги',
      pattern: phrase('ремонт дорог(?:и|у)|ремонт моста'),
      weight: 5,
    },
    {
      term: 'дорожные работы',
      pattern: phrase('дорожные работы'),
      weight: 5,
    },
    {
      term: 'ремонтируют',
      pattern: phrase('ремонтиру(?:ют|ется|ется)'),
      weight: 4,
    },
    {
      term: 'асфальтируют',
      pattern: phrase('асфальтиру(?:ют|ется)'),
      weight: 4,
    },
    {
      term: 'снимают асфальт',
      pattern: phrase('снимают асфальт'),
      weight: 5,
    },
  ],
  HAZARD: [
    { term: 'яма', pattern: phrase('ям(?:а|ы|у|е)'), weight: 5 },
    {
      term: 'дерево на дороге',
      pattern: phrase('дерево на дороге'),
      weight: 5,
    },
    {
      term: 'провода на дороге',
      pattern: phrase('провода (?:лежат )?на дороге'),
      weight: 5,
    },
    { term: 'препятствие', pattern: phrase('препятстви(?:е|я)'), weight: 4 },
    { term: 'лед', pattern: phrase('лед|гололед'), weight: 4 },
    {
      term: 'вода на дороге',
      pattern: phrase('вода на дороге'),
      weight: 5,
    },
    {
      term: 'опасный участок',
      pattern: phrase('опасный участок'),
      weight: 4,
    },
    {
      term: 'предмет на дороге',
      pattern: phrase('предмет на дороге'),
      weight: 4,
    },
  ],
  ROAD_STATE: [
    { term: 'чисто', pattern: phrase('чисто'), weight: 2 },
    { term: 'свободно', pattern: phrase('свободно'), weight: 2 },
    { term: 'проезжаемо', pattern: phrase('проезжаемо'), weight: 2 },
    { term: 'затруднено', pattern: phrase('затруднено'), weight: 2 },
    { term: 'движение есть', pattern: phrase('движение есть'), weight: 2 },
  ],
};

export const TELEGRAM_RESOLUTION_PATTERNS: readonly TelegramParserTermRule[] = [
  { term: 'разъехались', pattern: phrase('разъехались'), weight: 3 },
  { term: 'открыли', pattern: phrase('открыли'), weight: 3 },
  { term: 'проезд открыт', pattern: phrase('проезд открыт'), weight: 3 },
  {
    term: 'снова проезжают',
    pattern: phrase('снова проезжают'),
    weight: 3,
  },
  { term: 'чисто', pattern: phrase('чисто'), weight: 2 },
  { term: 'свободно', pattern: phrase('свободно'), weight: 2 },
  { term: 'проезжаемо', pattern: phrase('проезжаемо'), weight: 2 },
  { term: 'движение есть', pattern: phrase('движение есть'), weight: 2 },
  { term: 'уже нет', pattern: phrase('уже нет|нет уже'), weight: 3 },
  { term: 'уехали', pattern: phrase('уехали'), weight: 3 },
  { term: 'уехал', pattern: phrase('уехал(?:а)?'), weight: 3 },
];

export const TELEGRAM_CONTEXT_UPDATE_PATTERNS: readonly TelegramParserTermRule[] =
  [
    { term: 'стоят', pattern: phrase('стоят|еще стоят'), weight: 2 },
    { term: 'на месте', pattern: phrase('на месте'), weight: 2 },
    { term: 'затруднено', pattern: phrase('затруднено'), weight: 2 },
    { term: 'медленно', pattern: phrase('медленно'), weight: 2 },
  ];

export const TELEGRAM_QUESTION_PATTERN =
  /^(?:как там|что там|что на|как|что|где|есть ли|кто знает)(?:\s|$)/u;

export const TELEGRAM_REVERSE_QUESTION_PATTERN = /(?:^|\s)(?:как|что там)$/u;

export const TELEGRAM_BASELINE_TEMPORAL_PATTERN =
  /(?<![\p{L}\p{N}])(?:(?:было\s+)?\d+\s+(?:(?:мин|минут(?:а|ы)?|час(?:а|ов)?)\s+)?назад(?:\s+было)?|(?:было\s+)?минут\s+\d+\s+назад|было\s+(?:в\s+)?\d{1,2}[\s:]\d{2}|в\s+\d{1,2}[\s:]\d{2}|только что|ток что)(?![\p{L}\p{N}])/u;

export const TELEGRAM_TEMPORAL_PATTERN =
  /(?<![\p{L}\p{N}])(?:на данный момент|(?:было\s+)?(?:\d+|десять)\s+(?:(?:мин|минут(?:а|ы)?|час(?:а|ов)?)\s+)?назад(?:\s+было)?|(?:было\s+)?минут\s+\d+\s+назад|было\s+час\s+назад|было\s+(?:в\s+)?\d{1,2}[\s:]\d{2}|в\s+\d{1,2}[\s:]\d{2}|только что|ток что)(?![\p{L}\p{N}])/u;

export const TELEGRAM_DPS_SUPPORT_PATTERN =
  /(?<![\p{L}\p{N}])(?:актив|дежурит|проверяют|тормозят|стоит|стоят)(?![\p{L}\p{N}])/u;

export const TELEGRAM_LOCATION_ACTION_WORD_PATTERN =
  /(?<![\p{L}\p{N}])(?:оформляют|стоят|едет|едут|поехал(?:а|и)?|повернул(?:а|и)?|встал(?:а|и)?|проехал(?:а|и)?|уехал(?:а|и)?|разъехались|работают|убирают|актив|чисто)(?![\p{L}\p{N}])/gu;

export const TELEGRAM_VEHICLE_PATTERN =
  /(?<![\p{L}\p{N}])(?:шкода|хавал|веста)(?![\p{L}\p{N}])/u;

export const TELEGRAM_UNIT_COUNT_PATTERN =
  /(?<![\p{L}\p{N}])(?:\d+|один|два|две|три|четыре)\s*(?:экипаж(?:а|ей|и)?|машин(?:а|ы)?|шкод(?:а|ы)?|хавал(?:а|ов)?|вест(?:а|ы)?)(?![\p{L}\p{N}])/gu;

export const TELEGRAM_LOCATION_BOILERPLATE_PATTERN =
  /(?<![\p{L}\p{N}])(?:в другом чате писали что|другом чате писали что|где перекопано|где-то|где то|прямо|прям|короче)(?![\p{L}\p{N}])/gu;

export const TELEGRAM_EDITORIAL_MIN_WORD_COUNT = 28;

export const TELEGRAM_EDITORIAL_MIN_SENTENCE_COUNT = 2;

export const TELEGRAM_EDITORIAL_OFFICIAL_TERM_PATTERNS: readonly RegExp[] = [
  /(?<![\p{L}\p{N}])суд(?:а|ом|у|ы)?(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])(?:иск|истец|ответчик)(?:а|ом|у|и)?(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])взыскан(?:ие|ия|ии|ию|о|ы)?(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])ущерб(?:а|ом|у)?(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])следств(?:ие|ия|ием|у)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])приговор(?:а|ом|у)?(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])материал(?:ы|ов|ами)? дела(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])прокуратур(?:а|ы|ой|е)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])собственник(?:а|ом|у)?(?![\p{L}\p{N}])/u,
];

export const TELEGRAM_EDITORIAL_PROCEDURE_PATTERN =
  /(?<![\p{L}\p{N}])(?:удовлетворил(?:а|и)?|взыскал(?:а|и)?|рассмотрел(?:а|и)?|постановил(?:а|и)?|установил(?:а|и)?|вынес(?:ла|ли)? решение)(?![\p{L}\p{N}])/u;

export const TELEGRAM_REALTIME_REPORT_PATTERN =
  /(?<![\p{L}\p{N}])(?:сейчас|только что|ток что|прямо сейчас|стоит|перекрыто|не проехать)(?![\p{L}\p{N}])/u;

export const TELEGRAM_EDITORIAL_NEWS_PATTERNS: readonly RegExp[] = [
  /(?<![\p{L}\p{N}])что изменилось для водителей(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])разбираемся что нового(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])важн(?:ое|ых) изменени(?:е|й)(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])подписаться(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])прислать новость(?![\p{L}\p{N}])/u,
];

export const TELEGRAM_PROMOTIONAL_PATTERNS: readonly RegExp[] = [
  /(?<![\p{L}\p{N}])вступайте в сообщество(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])подпишись на группу(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])предлагайте вещи(?![\p{L}\p{N}])/u,
  /(?<![\p{L}\p{N}])эксклюзивный канал(?![\p{L}\p{N}])/u,
];
