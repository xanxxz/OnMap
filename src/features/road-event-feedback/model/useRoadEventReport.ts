import { useMutation, useQueryClient } from '@tanstack/react-query';
import { roadEventRepository } from '../../../entities/road-event/api/httpRoadEventRepository';
import type { RoadEventReportInput } from '../../../entities/road-event/api/roadEventRepository';
import { roadEventKeys } from '../../../entities/road-event/model/useRoadEvents';

export const useRoadEventReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RoadEventReportInput) => roadEventRepository.report(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadEventKeys.all }),
  });
};
