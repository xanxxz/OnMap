import { getCityConfig } from '../../../cities/city.registry';
import type { TelegramStreetGeometryProvider } from './telegram-street-geometry.provider';

export interface TelegramStreetGeometryWarmupSummary {
  readonly cityId: string;
  readonly streets: number;
  readonly resolved: number;
  readonly ambiguous: number;
  readonly notFound: number;
  readonly unavailable: number;
}

export const warmupTelegramStreetGeometry = async (
  cityId: string,
  provider: TelegramStreetGeometryProvider,
): Promise<TelegramStreetGeometryWarmupSummary> => {
  const city = getCityConfig(cityId);

  if (city === undefined) {
    throw new Error('Unsupported city');
  }

  const streets = city.locations.filter(
    (location) => location.kind === 'STREET',
  );
  const summary = {
    cityId,
    streets: streets.length,
    resolved: 0,
    ambiguous: 0,
    notFound: 0,
    unavailable: 0,
  };

  for (const street of streets) {
    const result = await provider.resolve({
      cityId,
      canonicalLocation: street.id,
      displayName: street.title,
    });

    if (result.status === 'RESOLVED') summary.resolved += 1;
    else if (result.status === 'AMBIGUOUS') summary.ambiguous += 1;
    else if (result.status === 'NOT_FOUND') summary.notFound += 1;
    else summary.unavailable += 1;
  }

  return summary;
};
