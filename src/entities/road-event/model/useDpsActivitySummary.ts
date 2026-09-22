import { useQuery } from '@tanstack/react-query';

import { roadEventRepository } from '../api/httpRoadEventRepository';

export const dpsActivitySummaryKey = (cityId: string) =>
  ['road-events', 'dps-summary', cityId] as const;

export const useDpsActivitySummary = (cityId: string) =>
  useQuery({
    queryKey: dpsActivitySummaryKey(cityId),
    queryFn: () => roadEventRepository.getDpsActivitySummary(cityId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 2,
  });
