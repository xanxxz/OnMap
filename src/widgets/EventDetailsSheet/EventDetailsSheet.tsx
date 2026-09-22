import React, { PropsWithChildren, useEffect, useRef } from 'react';

import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  View,
} from 'react-native';

import {
  LocationPrecision,
  RoadEvent,
  TelegramRoadEvent,
  TomTomRoadEvent,
} from '../../entities/road-event/model/roadEvent';

import type { RoadEventActionErrorState } from '../../entities/road-event/model/roadEventActionError';

import { RoadEventFeedbackAction } from '../../entities/road-event/lib/roadEventFreshness';

import { formatEventTime } from '../../entities/road-event/lib/formatEventTime';

import { EventMarker } from '../../entities/road-event/ui/EventMarker/EventMarker';

import { styles } from './EventDetailsSheet.styles';

const LOCATION_PRECISION_LABEL: Record<LocationPrecision, string> = {
  EXACT: 'Точное место',
  INTERSECTION: 'Перекрёсток',
  LANDMARK: 'Ориентир',
  STREET: 'Примерно на этой улице',
  AREA: 'Примерно в этом районе',
  SETTLEMENT: 'Примерно в этом населённом пункте',
};

const APPROXIMATE_PRECISIONS: readonly LocationPrecision[] = [
  'STREET',
  'AREA',
  'SETTLEMENT',
];

interface EventDetailsSheetProps {
  event: RoadEvent | null;

  feedbackAction?: RoadEventFeedbackAction | null;

  isSubmitting: boolean;

  pendingAction?: RoadEventFeedbackAction | null;

  feedbackError?: RoadEventActionErrorState | null;

  onFeedback: (action: RoadEventFeedbackAction) => void;

  onClose: () => void;

  bottomInset?: number;
}

const STATUS_LABEL = {
  ACTIVE: 'Актуально',

  UNCONFIRMED: 'Нужно подтверждение',

  STALE: 'Давно не подтверждали',

  RESOLVED: 'Завершено',
} as const;

export const formatTomTomDelay = (
  seconds: number | undefined,
): string | null => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  if (seconds < 60) {
    return '< 1 мин';
  }

  return `${Math.round(seconds / 60)} мин`;
};

export const formatTomTomLength = (
  meters: number | undefined,
): string | null => {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) {
    return null;
  }

  if (meters < 1_000) {
    return `${Math.round(meters)} м`;
  }

  return `${(meters / 1_000).toLocaleString('ru-RU', {
    maximumFractionDigits: 1,
  })} км`;
};

const formatOptionalDateTime = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? formatEventTime(value) : null;
};

const EventTitle = ({event}: {event: RoadEvent}) => (
  <View style={styles.titleRow}>
    <View style={styles.titleMarker}>
      <EventMarker
        compact
        type={event.type}
        accessibilityLabel={event.title}
      />
    </View>

    <Text style={styles.title}>{event.title}</Text>
  </View>
);

const AnimatedSheetContainer = ({
  children,
  testID,
  bottomInset = 0,
}: PropsWithChildren<{ testID?: string; bottomInset?: number }>) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.85,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.container,
        { bottom: Math.max(bottomInset, 12) },
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const TomTomEventDetails = ({
  event,
  onClose,
  bottomInset,
}: {
  event: TomTomRoadEvent;

  onClose: () => void;

  bottomInset?: number;
}) => {
  const route = [event.from, event.to]
    .filter((value): value is string => Boolean(value))
    .join(' → ');
  const delay = formatTomTomDelay(event.delaySeconds);
  const length = formatTomTomLength(event.lengthMeters);
  const startTime = formatOptionalDateTime(event.startTime);
  const endTime = formatOptionalDateTime(event.endTime);

  return (
    <AnimatedSheetContainer
      testID="tomtom-event-details"
      bottomInset={bottomInset}
    >
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>TomTom</Text>
          </View>

          <EventTitle event={event} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      {event.description ? (
        <Text style={styles.description}>{event.description}</Text>
      ) : null}

      {route ? <Text style={styles.externalRoute}>{route}</Text> : null}

      {delay || length ? (
        <View style={styles.externalMetrics}>
          {delay ? (
            <View style={styles.externalMetric}>
              <Text style={styles.metricValue}>{delay}</Text>

              <Text style={styles.metricLabel}>задержка</Text>
            </View>
          ) : null}

          {length ? (
            <View style={styles.externalMetric}>
              <Text style={styles.metricValue}>{length}</Text>

              <Text style={styles.metricLabel}>длина участка</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {startTime || endTime ? (
        <View style={styles.timestamps}>
          {startTime ? (
            <Text style={styles.timestamp}>Начало: {startTime}</Text>
          ) : null}

          {endTime ? (
            <Text style={styles.timestamp}>Окончание: {endTime}</Text>
          ) : null}
        </View>
      ) : null}
    </AnimatedSheetContainer>
  );
};

const TelegramEventDetails = ({
  event,
  onClose,
  bottomInset,
}: {
  event: TelegramRoadEvent;

  onClose: () => void;

  bottomInset?: number;
}) => {
  return (
    <AnimatedSheetContainer
      testID="telegram-event-details"
      bottomInset={bottomInset}
    >
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View testID="telegram-source-badge" style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>Telegram</Text>
          </View>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                event.status === 'ACTIVE' && styles.statusDotActive,
                event.status === 'STALE' && styles.statusDotStale,
                event.status === 'RESOLVED' && styles.statusDotResolved,
              ]}
            />

            <Text style={styles.statusText}>{STATUS_LABEL[event.status]}</Text>
          </View>

          <EventTitle event={event} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      {event.description ? (
        <Text style={styles.description}>{event.description}</Text>
      ) : null}

      <View style={styles.telegramLocation}>
        {event.locationLabel ? (
          <Text style={styles.telegramLocationTitle}>
            {event.locationLabel}
          </Text>
        ) : null}

        <Text style={styles.telegramPrecision}>
          {LOCATION_PRECISION_LABEL[event.locationPrecision]}
        </Text>

        {APPROXIMATE_PRECISIONS.includes(event.locationPrecision) ? (
          <Text style={styles.telegramApproximationWarning}>
            Точное место не указано
          </Text>
        ) : null}
      </View>

      {event.sourceText ? (
        <View style={styles.telegramSourceText}>
          <Text style={styles.telegramSourceTextLabel}>Исходное сообщение</Text>
          <Text style={styles.telegramSourceTextValue}>{event.sourceText}</Text>
        </View>
      ) : null}

      <View style={styles.timestamps}>
        <Text style={styles.timestamp}>
          {formatEventTime(event.createdAt)}
        </Text>
      </View>
    </AnimatedSheetContainer>
  );
};

export const EventDetailsSheet = ({
  event,
  feedbackAction,
  isSubmitting,
  pendingAction = null,
  feedbackError = null,
  onFeedback,
  onClose,
  bottomInset = 0,
}: EventDetailsSheetProps) => {
  if (!event) {
    return null;
  }

  if (event.source === 'TOMTOM') {
    return (
      <TomTomEventDetails
        event={event}
        onClose={onClose}
        bottomInset={bottomInset}
      />
    );
  }

  if (event.source === 'TELEGRAM' && event.type !== 'ROAD_PATROL') {
    return (
      <TelegramEventDetails
        event={event}
        onClose={onClose}
        bottomInset={bottomInset}
      />
    );
  }

  const viewerRelation = event.viewerRelation;

  const effectiveFeedback =
    viewerRelation === 'CONFIRM' || viewerRelation === 'REJECT'
      ? viewerRelation
      : feedbackAction;

  const isCreator = viewerRelation === 'CREATOR';

  const confidencePercent = Math.round((event.confidence ?? 0.5) * 100);

  const isDps = event.type === 'ROAD_PATROL';

  const dpsSubtitle = isDps
    ? event.status === 'ACTIVE'
      ? 'Пост недавно подтверждён'
      : event.status === 'STALE'
      ? 'Актуальность под сомнением'
      : event.status === 'RESOLVED'
      ? 'Пост завершён'
      : 'Ждёт свежего подтверждения'
    : null;

  return (
    <AnimatedSheetContainer bottomInset={bottomInset}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View
            testID={
              event.source === 'TELEGRAM'
                ? 'telegram-source-badge'
                : 'user-source-badge'
            }
            style={styles.sourceBadge}
          >
            <Text style={styles.sourceBadgeText}>
              {event.source === 'TELEGRAM' ? 'Telegram' : 'Пользователь'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,

                event.status === 'ACTIVE' && styles.statusDotActive,

                event.status === 'STALE' && styles.statusDotStale,

                event.status === 'RESOLVED' && styles.statusDotResolved,
              ]}
            />

            <Text style={styles.statusText}>{STATUS_LABEL[event.status]}</Text>
          </View>

          <EventTitle event={event} />

          {dpsSubtitle ? (
            <View
              style={[
                styles.dpsSubtitle,
                event.status === 'STALE' && styles.dpsSubtitleWarning,
              ]}
            >
              <Text
                style={[
                  styles.dpsSubtitleText,
                  event.status === 'STALE' && styles.dpsSubtitleTextWarning,
                ]}
              >
                {dpsSubtitle}
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      {event.description ? (
        <Text style={styles.description}>{event.description}</Text>
      ) : null}

      {event.source === 'TELEGRAM' ? (
        <>
          <View style={styles.telegramLocation}>
            {event.locationLabel ? (
              <Text style={styles.telegramLocationTitle}>
                {event.locationLabel}
              </Text>
            ) : null}
            <Text style={styles.telegramPrecision}>
              {LOCATION_PRECISION_LABEL[event.locationPrecision]}
            </Text>
          </View>

          {event.sourceText ? (
            <View style={styles.telegramSourceText}>
              <Text style={styles.telegramSourceTextLabel}>
                Исходное сообщение
              </Text>
              <Text style={styles.telegramSourceTextValue}>
                {event.sourceText}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{confidencePercent}%</Text>

          <Text style={styles.metricLabel}>доверие</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metric}>
          <Text style={styles.metricValue}>{event.confirmationCount ?? 0}</Text>

          <Text style={styles.metricLabel}>актуально</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metric}>
          <Text style={styles.metricValue}>{event.rejectionCount ?? 0}</Text>

          <Text style={styles.metricLabel}>уже нет</Text>
        </View>
      </View>

      <View style={styles.timestamps}>
        <Text style={styles.timestamp}>
          {formatEventTime(event.createdAt)}
        </Text>

        {event.lastConfirmedAt ? (
          <Text style={styles.timestamp}>
            Подтверждено: {formatEventTime(event.lastConfirmedAt)}
          </Text>
        ) : null}
      </View>

      <View style={styles.feedbackSection}>
        {isCreator ? (
          <View style={styles.relationCard}>
            <Text style={styles.relationIcon}>✓</Text>

            <View style={styles.relationContent}>
              <Text style={styles.relationTitle}>
                Вы сообщили об этом событии
              </Text>

              <Text style={styles.relationDescription}>
                Ваше сообщение уже учтено как первый сигнал. Подтверждать
                собственную метку повторно не нужно.
              </Text>
            </View>
          </View>
        ) : effectiveFeedback ? (
          <View style={styles.relationCard}>
            <Text style={styles.relationIcon}>✓</Text>

            <View style={styles.relationContent}>
              <Text style={styles.relationTitle}>
                {effectiveFeedback === 'CONFIRM'
                  ? 'Вы подтвердили актуальность'
                  : 'Вы отметили, что события уже нет'}
              </Text>

              <Text style={styles.relationDescription}>
                Ваш ответ уже учтён в оценке актуальности этого события.
              </Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.feedbackTitle}>Событие ещё актуально?</Text>

            {feedbackError ? (
              <View
                accessibilityRole="summary"
                style={[
                  styles.feedbackError,

                  feedbackError.kind === 'rateLimit' &&
                    styles.feedbackErrorRateLimit,
                ]}
              >
                <View
                  style={[
                    styles.feedbackErrorIcon,

                    feedbackError.kind === 'rateLimit' &&
                      styles.feedbackErrorIconRateLimit,
                  ]}
                >
                  <Text
                    style={[
                      styles.feedbackErrorIconText,

                      feedbackError.kind === 'rateLimit' &&
                        styles.feedbackErrorIconTextRateLimit,
                    ]}
                  >
                    !
                  </Text>
                </View>

                <View style={styles.feedbackErrorContent}>
                  <Text
                    style={[
                      styles.feedbackErrorTitle,

                      feedbackError.kind === 'rateLimit' &&
                        styles.feedbackErrorTitleRateLimit,
                    ]}
                  >
                    {feedbackError.title}
                  </Text>

                  <Text
                    style={[
                      styles.feedbackErrorDescription,

                      feedbackError.kind === 'rateLimit' &&
                        styles.feedbackErrorDescriptionRateLimit,
                    ]}
                  >
                    {feedbackError.description}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.feedbackActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Подтвердить актуальность события"
                disabled={isSubmitting}
                onPress={() => onFeedback('CONFIRM')}
                style={({ pressed }) => [
                  styles.confirmButton,

                  pressed && styles.buttonPressed,

                  isSubmitting && styles.buttonDisabled,
                ]}
              >
                {isSubmitting && pendingAction === 'CONFIRM' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>✓ Актуально</Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Сообщить, что события уже нет"
                disabled={isSubmitting}
                onPress={() => onFeedback('REJECT')}
                style={({ pressed }) => [
                  styles.rejectButton,

                  pressed && styles.buttonPressed,

                  isSubmitting && styles.buttonDisabled,
                ]}
              >
                {isSubmitting && pendingAction === 'REJECT' ? (
                  <ActivityIndicator size="small" color="#D94348" />
                ) : (
                  <Text style={styles.rejectButtonText}>× Уже нет</Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </AnimatedSheetContainer>
  );
};
