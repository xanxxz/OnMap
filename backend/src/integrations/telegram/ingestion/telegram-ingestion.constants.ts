import type { TelegramParserEventType } from '../parser/telegram-parser.types';

export const TELEGRAM_INGESTION_SUPPORTED_EVENT_TYPES: readonly TelegramParserEventType[] =
  [
    'ACCIDENT',
    'DPS',
    'TRAFFIC_JAM',
    'ROAD_CLOSURE',
    'ROADWORKS',
    'HAZARD',
    'ROAD_STATE',
  ];

export const TELEGRAM_INGESTION_THRESHOLDS = {
  createParserConfidence: 0.75,
  resolveParserConfidence: 0.6,
  updateParserConfidence: 0.75,
  parserReviewConfidence: 0.5,
  locationConfidence: 0.9,
  updateLocationConfidence: 0.7,
} as const;

export const TELEGRAM_INGESTION_CONTEXT_MESSAGE_LIMIT = 5;

export const TELEGRAM_INGESTION_DEDUP_PREVIEW_WINDOW_MS = 30 * 60 * 1_000;

export const TELEGRAM_INGESTION_SAMPLE_LIMIT = 10;
