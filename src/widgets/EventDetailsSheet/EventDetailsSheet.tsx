import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { useReducedMotion } from 'react-native-reanimated';

import {
  LocationPrecision,
  RoadEvent,
  TelegramRoadEvent,
  TomTomRoadEvent,
} from '../../entities/road-event/model/roadEvent';

import type { RoadEventActionErrorState } from '../../entities/road-event/model/roadEventActionError';

import { RoadEventFeedbackAction } from '../../entities/road-event/model/roadEvent';

import { formatEventTime } from '../../entities/road-event/lib/formatEventTime';

import { EventMarker } from '../../entities/road-event/ui/EventMarker/EventMarker';

import { EventReportAction } from './EventReportAction';
import { styles } from './EventDetailsSheet.styles';

const LOCATION_PRECISION_LABEL: Record<LocationPrecision, string> = {
  EXACT: 'Точное место',
  INTERSECTION: 'Перекрёсток',
  LANDMARK: 'Ориентир',
  STREET: 'Примерное место',
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

  HIDDEN_PENDING_REVIEW: 'Временно скрыто на проверке',

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

const EventTitle = ({ event }: { event: RoadEvent }) => (
  <View style={styles.titleRow}>
    <View style={styles.titleMarker}>
      <EventMarker
        type={event.type}
        illustrationScale={1.6}
        accessibilityLabel={event.title}
      />
    </View>

    <Text style={styles.title}>{event.title}</Text>
  </View>
);

export const shouldCaptureEventSheetDismiss = (
  scrollOffset: number,
  dy: number,
  dx: number,
) => scrollOffset <= 1 && dy > 12 && dy > Math.abs(dx) * 1.2;

export const shouldDismissEventSheet = (dy: number, vy: number) =>
  dy >= 110 || (dy >= 60 && vy >= 1.2);

const AnimatedSheetContainer = ({
  children,
  testID,
  bottomInset = 0,
  onClose,
  registerDismiss,
}: PropsWithChildren<{
  testID?: string;
  bottomInset?: number;
  onClose: () => void;
  registerDismiss: (dismiss: (() => void) | null) => void;
}>) => {
  const { height: windowHeight } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const scrollOffset = useRef(0);
  const sheetHeight = useRef(0);
  const closing = useRef(false);
  const reduceMotion = useReducedMotion();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = useCallback(() => {
    if (closing.current) {
      return;
    }
    closing.current = true;
    Animated.timing(dragY, {
      toValue: sheetHeight.current || windowHeight,
      duration: reduceMotion ? 0 : 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onCloseRef.current();
      } else {
        closing.current = false;
        dragY.setValue(0);
      }
    });
  }, [dragY, reduceMotion, windowHeight]);
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    registerDismiss(dismiss);
    return () => registerDismiss(null);
  }, [dismiss, registerDismiss]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        !closing.current &&
        shouldCaptureEventSheetDismiss(
          scrollOffset.current,
          gesture.dy,
          gesture.dx,
        ),
      onPanResponderMove: (_, gesture) => {
        dragY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (shouldDismissEventSheet(gesture.dy, gesture.vy)) {
          dismissRef.current();
          return;
        }

        Animated.spring(dragY, {
          toValue: 0,
          damping: 22,
          stiffness: 240,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.spring(progress, {
      toValue: 1,
      damping: 22,
      stiffness: 240,
      mass: 0.85,
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      testID={testID}
      onLayout={event => {
        sheetHeight.current = event.nativeEvent.layout.height;
      }}
      style={[
        styles.container,
        { paddingBottom: bottomInset + 20, maxHeight: windowHeight * 0.82 },
        {
          opacity: progress,
          transform: [
            {
              translateY: Animated.add(
                progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
                dragY,
              ),
            },
          ],
        },
      ]}
    >
      <ScrollView
        style={styles.scrollContent}
        onScroll={event => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
};

const TomTomEventDetails = ({
  event,
  onClose,
  onRequestClose,
  registerDismiss,
  bottomInset,
}: {
  event: TomTomRoadEvent;

  onClose: () => void;
  onRequestClose: () => void;
  registerDismiss: (dismiss: (() => void) | null) => void;

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
      onClose={onClose}
      registerDismiss={registerDismiss}
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
          onPress={onRequestClose}
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
  onRequestClose,
  registerDismiss,
  bottomInset,
}: {
  event: TelegramRoadEvent;

  onClose: () => void;
  onRequestClose: () => void;
  registerDismiss: (dismiss: (() => void) | null) => void;

  bottomInset?: number;
}) => {
  return (
    <AnimatedSheetContainer
      testID="telegram-event-details"
      bottomInset={bottomInset}
      onClose={onClose}
      registerDismiss={registerDismiss}
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
          onPress={onRequestClose}
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
        <Text style={styles.timestamp}>{formatEventTime(event.createdAt)}</Text>
      </View>

      {event.status !== 'RESOLVED' ? (
        <EventReportAction key={event.id} event={event} bottomInset={bottomInset} />
      ) : null}
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
  const dismissRef = useRef<(() => void) | null>(null);
  const registerDismiss = useCallback((dismiss: (() => void) | null) => {
    dismissRef.current = dismiss;
  }, []);
  const requestClose = useCallback(() => dismissRef.current?.(), []);
  if (!event) {
    return null;
  }

  if (event.source === 'TOMTOM') {
    return (
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть событие"
          testID="event-details-backdrop"
          onPress={requestClose}
          style={styles.backdrop}
        />
        <TomTomEventDetails
          event={event}
          onClose={onClose}
          registerDismiss={registerDismiss}
          onRequestClose={requestClose}
          bottomInset={bottomInset}
        />
      </View>
    );
  }

  if (event.source === 'TELEGRAM' && event.type !== 'ROAD_PATROL') {
    return (
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть событие"
          testID="event-details-backdrop"
          onPress={requestClose}
          style={styles.backdrop}
        />
        <TelegramEventDetails
          event={event}
          onClose={onClose}
          registerDismiss={registerDismiss}
          onRequestClose={requestClose}
          bottomInset={bottomInset}
        />
      </View>
    );
  }

  const viewerRelation = event.viewerRelation;

  const effectiveFeedback =
    viewerRelation === 'CONFIRM' || viewerRelation === 'REJECT'
      ? viewerRelation
      : feedbackAction;

  const isCreator = viewerRelation === 'CREATOR';

  const confidencePercent = event.confidencePercent;

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
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть событие"
        testID="event-details-backdrop"
        onPress={requestClose}
        style={styles.backdrop}
      />
      <AnimatedSheetContainer
        testID="user-event-details"
        bottomInset={bottomInset}
        onClose={onClose}
        registerDismiss={registerDismiss}
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.headerContent}>
            {event.source === 'TELEGRAM' ? (
              <View testID="telegram-source-badge" style={styles.sourceBadge}>
                <Text style={styles.sourceBadgeText}>Telegram</Text>
              </View>
            ) : null}

            <EventTitle event={event} />

            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,

                  event.status === 'ACTIVE' && styles.statusDotActive,

                  event.status === 'STALE' && styles.statusDotStale,

                  event.status === 'RESOLVED' && styles.statusDotResolved,
                ]}
              />

              <Text style={styles.statusText}>
                {STATUS_LABEL[event.status]}
              </Text>
            </View>

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
            onPress={requestClose}
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
            <Text style={styles.metricValue}>
              {confidencePercent === undefined ? '—' : `${confidencePercent}%`}
            </Text>

            <Text style={styles.metricLabel}>доверие</Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {event.confirmationCount ?? 0}
            </Text>

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

        {event.status !== 'RESOLVED' ? (
          <EventReportAction key={event.id} event={event} bottomInset={bottomInset} />
        ) : null}
      </AnimatedSheetContainer>
    </View>
  );
};
