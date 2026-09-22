import { getCityConfig } from '../../cities/city.registry';

import { TomTomIntegrationError } from './tomtom.errors';
import type { CityBounds } from './tomtom.types';

export const resolveTomTomCityBounds = (cityId: string): CityBounds => {
  const city = getCityConfig(cityId);

  if (city === undefined) {
    throw new TomTomIntegrationError(
      'UNSUPPORTED_CITY',
      `TomTom integration does not support cityId: ${cityId}`,
    );
  }

  return city.coverageBounds;
};

export const resolveTomTomCityCenter = (cityId: string) => {
  const city = getCityConfig(cityId);

  if (city === undefined) {
    throw new TomTomIntegrationError(
      'UNSUPPORTED_CITY',
      `TomTom integration does not support cityId: ${cityId}`,
    );
  }

  return city.center;
};

export const getCityBoundsCenter = (bounds: CityBounds) => {
  return {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
  };
};
