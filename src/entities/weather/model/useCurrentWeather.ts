import { useQuery } from '@tanstack/react-query';

import { weatherRepository } from '../api/weatherRepository';

export const useCurrentWeather = (cityId: string) => {
  return useQuery({
    queryKey: ['weather', cityId],
    queryFn: () => weatherRepository.getCurrent(cityId),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
};
