import type {
  ExternalLineStringGeometry,
  ExternalMultiLineStringGeometry,
} from '../../tomtom/tomtom.types';

export interface TelegramStreetGeometryInput {
  readonly cityId: string;
  readonly canonicalLocation: string;
  readonly displayName?: string;
}

export type TelegramStreetGeometryResult =
  | {
      readonly status: 'RESOLVED';
      readonly geometry:
        ExternalLineStringGeometry | ExternalMultiLineStringGeometry;
      readonly confidence: number;
      readonly provider: 'OSM';
      readonly endpointIndex?: number;
    }
  | {
      readonly status: 'NOT_FOUND' | 'AMBIGUOUS' | 'UNAVAILABLE';
      readonly provider: 'OSM';
      readonly endpointIndex?: number;
    };

export interface TelegramStreetGeometryProvider {
  resolve(
    input: TelegramStreetGeometryInput,
  ): Promise<TelegramStreetGeometryResult>;
}

/**
 * The current TomTom Search contract exposes a representative position only,
 * not the road shape. Keep STREET events on review until a shape-capable
 * provider is connected instead of presenting that position as an exact point.
 */
export const unavailableTelegramStreetGeometryProvider: TelegramStreetGeometryProvider =
  {
    resolve: () => Promise.resolve({ status: 'UNAVAILABLE', provider: 'OSM' }),
  };
