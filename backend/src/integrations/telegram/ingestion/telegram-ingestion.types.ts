import type {
  TelegramParserEventType,
  TelegramParserIntent,
  TelegramParserResult,
  TelegramParserState,
} from '../parser/telegram-parser.types';
import type { TelegramMessage } from '../telegram.types';
import type { ExternalRoadEventGeometry } from '../../tomtom/tomtom.types';
import type { TelegramLocationPrecision } from '../location-resolver/telegram-location-precision';
import type {
  TelegramGeometryProvider,
  TelegramGeometryStatus,
} from '../location-resolver/telegram-location-resolver.types';

export type TelegramIngestionDecision =
  'CREATE' | 'UPDATE' | 'RESOLVE' | 'IGNORE' | 'REVIEW';

export type TelegramIngestionDecisionReason =
  | 'READY_TO_CREATE'
  | 'UPDATE_CANDIDATE'
  | 'RESOLVE_CANDIDATE'
  | 'NOISE'
  | 'QUESTION'
  | 'UNSUPPORTED_EVENT_TYPE'
  | 'LOW_CONFIDENCE'
  | 'LOCATION_NOT_FOUND'
  | 'LOCATION_AMBIGUOUS'
  | 'LOCATION_OUTSIDE_SUPPORTED_AREA'
  | 'STREET_GEOMETRY_UNAVAILABLE'
  | 'AREA_GEOMETRY_UNAVAILABLE'
  | 'MISSING_COORDINATES'
  | 'MISSING_CONTEXT'
  | 'RESOLUTION_WITHOUT_LOCATION'
  | 'MULTI_LOCATION_AMBIGUOUS'
  | 'UNSAFE_STATE';

export type TelegramIngestionResolverStatus =
  'RESOLVED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'SKIPPED' | 'MULTIPLE';

export interface NormalizedTelegramEvent {
  readonly source: 'TELEGRAM';
  readonly cityId: string;
  readonly telegramMessageId: string;
  readonly externalId: string;
  readonly sourceChatId: string;
  readonly timestamp: string;
  readonly messageVersion?: string;
  readonly eventType: TelegramParserEventType;
  readonly intent: TelegramParserIntent;
  readonly state: TelegramParserState;
  readonly sourceText: string;
  readonly locationInput: string | null;
  readonly canonicalLocationId: string | null;
  readonly canonicalLocationTitle: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly geometry: ExternalRoadEventGeometry | null;
  readonly locationPrecision: TelegramLocationPrecision | null;
  readonly geometryProvider: TelegramGeometryProvider;
  readonly geometryStatus: TelegramGeometryStatus;
  readonly locationConfidence: number | null;
  readonly parserConfidence: number;
  readonly contextUsed: boolean;
  readonly replyContextUsed: boolean;
  readonly resolverStatus: TelegramIngestionResolverStatus;
  readonly decision: TelegramIngestionDecision;
  readonly reason: TelegramIngestionDecisionReason;
}

export interface TelegramDryRunIngestionInput {
  readonly message: TelegramMessage;
  readonly replyMessage?: TelegramMessage;
  readonly previousMessages?: readonly TelegramMessage[];
}

export interface TelegramDryRunIngestionResult {
  readonly parserResult: TelegramParserResult;
  readonly events: readonly NormalizedTelegramEvent[];
}

export interface TelegramDryRunSample {
  readonly textExcerpt: string;
  readonly eventType: TelegramParserEventType;
  readonly intent: TelegramParserIntent;
  readonly locationInput: string | null;
  readonly canonicalLocation: string | null;
  readonly resolverStatus: TelegramIngestionResolverStatus;
  readonly parserConfidence: number;
  readonly locationConfidence: number | null;
  readonly decisionReason: TelegramIngestionDecisionReason;
}

export interface TelegramPotentialDuplicateGroup {
  readonly eventType: TelegramParserEventType;
  readonly locationKey: string;
  readonly size: number;
  readonly from: string;
  readonly to: string;
}

export interface TelegramDryRunReport {
  readonly total: number;
  readonly normalized: number;
  readonly parserMatched: number;
  readonly resolverResolved: number;
  readonly resolverAmbiguous: number;
  readonly resolverNotFound: number;
  readonly decisions: Readonly<Record<TelegramIngestionDecision, number>>;
  readonly ignoreReasons: Readonly<Record<string, number>>;
  readonly reviewReasons: Readonly<Record<string, number>>;
  readonly samples: {
    readonly create: readonly TelegramDryRunSample[];
    readonly resolve: readonly TelegramDryRunSample[];
    readonly review: readonly TelegramDryRunSample[];
  };
  readonly duplicatePreview: {
    readonly groupCount: number;
    readonly groups: readonly TelegramPotentialDuplicateGroup[];
  };
}
