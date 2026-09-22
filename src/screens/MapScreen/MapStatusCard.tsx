import React from 'react';

import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { RealtimeStatus } from '../../entities/road-event/model/useRoadEventRealtime';

import { colors } from '../../shared/theme';

import { statusStyles } from './MapStatusCard.styles';

export type MapDataStatus = 'loading' | 'error' | 'empty' | 'ready';

interface ResolveMapDataStatusInput {
  boundsReady: boolean;

  isPending: boolean;

  isError: boolean;

  eventCount: number;
}

export const resolveMapDataStatus = ({
  boundsReady,
  isPending,
  isError,
  eventCount,
}: ResolveMapDataStatusInput): MapDataStatus => {
  if (isError) {
    return 'error';
  }

  if (!boundsReady || isPending) {
    return 'loading';
  }

  if (eventCount === 0) {
    return 'empty';
  }

  return 'ready';
};

export const formatRoadEventCount = (count: number): string => {
  const absoluteCount = Math.abs(count);
  const lastTwoDigits = absoluteCount % 100;
  const lastDigit = absoluteCount % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} событий`;
  }

  if (lastDigit === 1) return `${count} событие`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} события`;
  return `${count} событий`;
};

interface MapStatusCardProps {
  status: Extract<MapDataStatus, 'loading' | 'error'>;

  isRetrying?: boolean;

  onRetry?: () => void;
}

const STATUS_CONTENT = {
  loading: {
    title: 'Загружаем обстановку',
    description:
      'Карта уже доступна — свежие события появятся через мгновение.',
  },
  error: {
    title: 'Не удалось загрузить события',
    description:
      'Карта продолжает работать. Проверьте связь и попробуйте ещё раз.',
  },
} as const;

export const MapStatusCard = ({
  status,
  isRetrying = false,
  onRetry,
}: MapStatusCardProps) => {
  const content = STATUS_CONTENT[status];

  return (
    <View
      accessibilityRole="summary"
      style={[statusStyles.card, status === 'error' && statusStyles.cardError]}
    >
      <View
        style={[
          statusStyles.icon,

          status === 'error' && statusStyles.iconError,
        ]}
      >
        {status === 'loading' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text
            style={[
              statusStyles.iconText,

              status === 'error' && statusStyles.iconTextError,
            ]}
          >
            !
          </Text>
        )}
      </View>

      <View style={statusStyles.content}>
        <Text numberOfLines={2} style={statusStyles.title}>
          {content.title}
        </Text>

        <Text style={statusStyles.description}>{content.description}</Text>

        {status === 'error' && onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку событий"
            disabled={isRetrying}
            onPress={onRetry}
            style={({ pressed }) => [
              statusStyles.retryButton,

              pressed && statusStyles.retryButtonPressed,

              isRetrying && statusStyles.retryButtonDisabled,
            ]}
          >
            {isRetrying ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={statusStyles.retryText}>Повторить</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

interface RealtimeStatusBadgeProps {
  status: RealtimeStatus;
}

export const RealtimeStatusBadge = ({ status }: RealtimeStatusBadgeProps) => {
  if (status === 'disabled') {
    return null;
  }

  const connecting = status === 'connecting';

  const connected = status === 'connected';

  return (
    <View
      accessibilityLabel={
        connected
          ? 'Realtime подключён'
          : connecting
          ? 'Realtime восстанавливает связь'
          : 'Realtime временно недоступен'
      }
      style={statusStyles.realtime}
    >
      {connecting ? (
        <ActivityIndicator size={10} color={colors.warning} />
      ) : (
        <View
          style={[
            statusStyles.realtimeDot,

            connected
              ? statusStyles.realtimeDotConnected
              : statusStyles.realtimeDotDisconnected,
          ]}
        />
      )}

      <Text numberOfLines={1} style={statusStyles.realtimeText}>
        {connected
          ? 'Онлайн'
          : connecting
          ? 'Восстанавливаем связь'
          : 'Обновления с задержкой'}
      </Text>
    </View>
  );
};

export const MapSuccessNotice = () => {
  return (
    <View accessibilityRole="summary" style={statusStyles.successNotice}>
      <View style={statusStyles.successDot} />

      <View style={statusStyles.successContent}>
        <Text style={statusStyles.successTitle}>Событие добавлено</Text>

        <Text numberOfLines={2} style={statusStyles.successDescription}>
          Метка уже появилась на карте.
        </Text>
      </View>
    </View>
  );
};
