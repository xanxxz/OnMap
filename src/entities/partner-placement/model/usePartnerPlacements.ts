import {useQuery} from '@tanstack/react-query';
import type {MapBounds} from '../../../shared/types/map';
import {partnerPlacementRepository} from '../api/partnerPlacementRepository';

export const partnerPlacementKeys = {
  all: ['partner-placements'] as const,
  city: (cityId: string) => [...partnerPlacementKeys.all, cityId] as const,
  viewport: (cityId: string, bounds: MapBounds) =>
    [...partnerPlacementKeys.city(cityId), ...bounds] as const,
};

export const usePartnerPlacements = (cityId: string, bounds: MapBounds | null) =>
  useQuery({
    queryKey: bounds
      ? partnerPlacementKeys.viewport(cityId, bounds)
      : [...partnerPlacementKeys.city(cityId), 'pending'],
    enabled: bounds !== null,
    queryFn: () => {
      if (!bounds) throw new Error('Viewport bounds are required');
      return partnerPlacementRepository.list(cityId, bounds);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });
