import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roadEventRepository } from '../api/httpRoadEventRepository';

export const roadEventModerationNoticeKey = ['road-event-moderation-notices'] as const;

export const useRoadEventModerationNotices = () =>
  useQuery({
    queryKey: roadEventModerationNoticeKey,
    queryFn: () => roadEventRepository.getModerationNotices(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

export const useAcknowledgeRoadEventModerationNotice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: string) =>
      roadEventRepository.acknowledgeModerationNotice(noticeId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: roadEventModerationNoticeKey }),
  });
};
