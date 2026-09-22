import type { TelegramMtprotoConnectionSnapshot } from '../telegram.types';

export type TelegramIngestionRuntimeStatus =
  'DISABLED' | 'STARTING' | 'RUNNING' | 'ERROR' | 'STOPPING' | 'STOPPED';

export interface TelegramIngestionRuntimeCounters {
  readonly received: number;
  readonly normalized: number;
  readonly matched: number;
  readonly ignored: number;
  readonly reviewed: number;
  readonly createCandidates: number;
  readonly updateCandidates: number;
  readonly resolveCandidates: number;
  readonly created: number;
  readonly updated: number;
  readonly resolved: number;
  readonly noop: number;
  readonly errors: number;
}

export interface TelegramIngestionRuntimeSnapshot {
  readonly status: TelegramIngestionRuntimeStatus;
  readonly connection: TelegramMtprotoConnectionSnapshot;
  readonly counters: TelegramIngestionRuntimeCounters;
  readonly inFlight: number;
}
