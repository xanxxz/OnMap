import type { TelegramParserEventType } from '../parser/telegram-parser.types';

export const TELEGRAM_LOCATION_RESOLVER_CITY_ID = 'balakovo';

export const TELEGRAM_VERIFIED_LOCAL_CONFIDENCE = 0.99;

export const TELEGRAM_LOCATION_RESOLVER_ALLOWED_EVENT_TYPES: readonly TelegramParserEventType[] =
  [
    'ACCIDENT',
    'DPS',
    'TRAFFIC_JAM',
    'ROAD_CLOSURE',
    'ROADWORKS',
    'HAZARD',
    'ROAD_STATE',
  ];

export const TELEGRAM_LOCATION_RESOLVER_THRESHOLDS = {
  resolvedConfidence: 0.7,
  ambiguousConfidence: 0.58,
  resolvedScoreGap: 0.1,
  maxAmbiguousCandidates: 3,
  maxSearchAttempts: 3,
  localCanonicalBoost: 0.12,
  deduplicationDistanceMeters: 25,
} as const;

export const TELEGRAM_LOCATION_SEARCH_STRATEGIES: Readonly<
  Record<string, readonly string[]>
> = {
  'cinema-mir': ['Кинотеатр Мир', 'Мир Балаково', 'Кинотеатр Мир Балаково'],
  'bridge-pobedy': ['Мост Победы', 'Новый мост Балаково'],
  ges: ['ГЭС Балаково', 'Балаковская ГЭС'],
  'registry-office': ['ЗАГС Балаково'],
  'district-3g': ['3Г Балаково'],
  mayanga: ['Маянга', 'село Маянга', 'Маянга Саратовская область'],
} as const;
