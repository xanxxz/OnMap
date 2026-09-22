import type { RoadEventType } from '../../../road-events/road-events.constants';
import type { ExternalRoadEventGeometry } from '../../tomtom/tomtom.types';
import type { TelegramLocationPrecision } from '../location-resolver/telegram-location-precision';

export type TelegramPersistenceReason =
  | 'ALREADY_APPLIED'
  | 'DUPLICATE_ACTIVE_EVENT'
  | 'TARGET_NOT_FOUND'
  | 'AMBIGUOUS_TARGET'
  | 'ALREADY_RESOLVED'
  | 'UNSUPPORTED_DECISION'
  | 'UNSUPPORTED_EVENT_TYPE'
  | 'INVALID_COORDINATES'
  | 'INVALID_TIMESTAMP';

export type TelegramPersistenceResult =
  | {
      readonly status: 'CREATED' | 'UPDATED' | 'RESOLVED';
      readonly roadEventId: string;
    }
  | {
      readonly status: 'NOOP';
      readonly reason: Exclude<TelegramPersistenceReason, 'AMBIGUOUS_TARGET'>;
      readonly roadEventId?: string;
    }
  | {
      readonly status: 'REVIEW';
      readonly reason: 'AMBIGUOUS_TARGET';
      readonly candidateCount: number;
    };

export interface TelegramPersistenceTarget {
  readonly id: string;
  readonly status: 'ACTIVE' | 'STALE' | 'RESOLVED';
  readonly locationPrecision?: TelegramLocationPrecision | null;
  readonly createdAt: Date | string;
}

export interface TelegramRoadEventInsertRow {
  readonly id: string;
}

export interface TelegramAppliedMessageRow {
  readonly roadEventId: string | null;
  readonly sourceTimestamp: Date | string;
  readonly appliedDecision: string;
  readonly outcome: string;
  readonly locationPrecision?: TelegramLocationPrecision | null;
  readonly createdAt?: Date | string | null;
}

export interface TelegramPersistenceCandidate {
  readonly cityId: string;
  readonly type: RoadEventType;
  readonly timestamp: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly geometry: ExternalRoadEventGeometry;
  readonly locationPrecision: TelegramLocationPrecision;
  readonly locationLabel: string | null;
  readonly sourceText: string;
}
