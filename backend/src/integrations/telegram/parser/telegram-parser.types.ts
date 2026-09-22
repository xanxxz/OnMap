import type { CityLocationKind } from '../../../cities/city.types';

export type TelegramParserEventType =
  | 'DPS'
  | 'ACCIDENT'
  | 'TRAFFIC_JAM'
  | 'ROAD_CLOSURE'
  | 'ROADWORKS'
  | 'HAZARD'
  | 'ROAD_STATE'
  | 'OTHER';

export type TelegramParserIntent =
  'REPORT' | 'QUESTION' | 'UPDATE' | 'RESOLUTION' | 'NOISE';

export type TelegramParserState = 'ACTIVE' | 'RESOLVED' | 'UNKNOWN';

export interface TelegramParserMessage {
  readonly externalId?: string;
  readonly text: string;
  readonly publishedAt: string;
  readonly chatId: string;
  readonly cityId: string;
  readonly authorName?: string;
}

export type TelegramParserContextSource = 'NONE' | 'REPLY' | 'PREVIOUS_MESSAGE';

export interface TelegramParserInput {
  readonly message: TelegramParserMessage;
  readonly replyMessage?: TelegramParserMessage;
  readonly previousMessages?: readonly TelegramParserMessage[];
}

export interface TelegramParserLocation {
  readonly text: string;
  readonly alias: string | null;
}

export type TelegramLocationRelation =
  'TOWARDS' | 'FROM' | 'BEFORE' | 'AFTER' | 'BETWEEN' | 'NEAR';

export interface TelegramLocationDirection {
  readonly relation: TelegramLocationRelation;
  readonly targetLocationId?: string;
  readonly targetText?: string;
}

export interface TelegramParserResult {
  readonly matched: boolean;
  readonly eventType: TelegramParserEventType;
  readonly intent: TelegramParserIntent;
  readonly state: TelegramParserState;
  readonly locationText: string | null;
  readonly locationAlias: string | null;
  readonly locations: readonly TelegramParserLocation[];
  readonly direction?: TelegramLocationDirection | null;
  readonly locationResolutionAllowed: boolean;
  readonly confidence: number;
  readonly matchedTerms: readonly string[];
  readonly contextUsed: boolean;
  readonly contextSource?: TelegramParserContextSource;
  readonly contextMessageId?: string | null;
  readonly reason?: string;
}

export type BalakovoLocationKind = CityLocationKind;

export interface BalakovoLocationAlias {
  readonly id: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly kind?: BalakovoLocationKind;
}

export interface NormalizedTelegramParserMessage extends TelegramParserMessage {
  readonly normalizedText: string;
  readonly hadQuestionMark: boolean;
}

export interface TelegramParserContext {
  readonly current: NormalizedTelegramParserMessage;
  readonly nearby: readonly TelegramParserContextMessage[];
}

export interface TelegramParserContextMessage extends NormalizedTelegramParserMessage {
  readonly contextSource: Exclude<TelegramParserContextSource, 'NONE'>;
}

export interface TelegramParserTermRule {
  readonly term: string;
  readonly pattern: RegExp;
  readonly weight: number;
}
