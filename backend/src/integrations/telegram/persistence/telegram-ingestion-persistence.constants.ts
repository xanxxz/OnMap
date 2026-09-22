import type { RoadEventType } from '../../../road-events/road-events.constants';
import type { TelegramParserEventType } from '../parser/telegram-parser.types';

export const TELEGRAM_PERSISTENCE_TARGET_MATCH_WINDOW_MS = 24 * 60 * 60_000;

export const TELEGRAM_TO_ROAD_EVENT_TYPE: Readonly<
  Partial<Record<TelegramParserEventType, RoadEventType>>
> = {
  ACCIDENT: 'ACCIDENT',
  DPS: 'ROAD_PATROL',
  TRAFFIC_JAM: 'TRAFFIC',
  ROAD_CLOSURE: 'ROAD_CLOSURE',
  ROADWORKS: 'ROADWORKS',
  HAZARD: 'ROAD_HAZARD',
  ROAD_STATE: 'OTHER',
};
