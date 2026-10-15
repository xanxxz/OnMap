import React, {
  PropsWithChildren,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
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
import {useReducedMotion} from 'react-native-reanimated';

import {
  LocationPrecision,
  RoadEvent,
  RoadEventFeedbackAction,
  TelegramRoadEvent,
  TomTomRoadEvent,
} from '../../entities/road-event/model/roadEvent';
import type {RoadEventActionErrorState} from '../../entities/road-event/model/roadEventActionError';
import {formatEventTime} from '../../entities/road-event/lib/formatEventTime';
import {EventMarker} from '../../entities/road-event/ui/EventMarker/EventMarker';
import {EventReportAction} from './EventReportAction';
import {styles} from './EventDetailsSheet.styles';

const LOCATION_PRECISION_LABEL: Record<LocationPrecision, string> = {
  EXACT: 'Точное место',
  INTERSECTION: 'Перекрёсток',
  LANDMARK: 'Ориентир',
  STREET: 'Примерное место',
  AREA: 'Примерно в этом районе',
  SETTLEMENT: 'Примерно в этом населённом пункте',
};

const STATUS_LABEL = {
  ACTIVE: 'Актуально',
  UNCONFIRMED: 'Нужно подтверждение',
  STALE: 'Давно не подтверждали',
  HIDDEN_PENDING_REVIEW: 'Временно скрыто на проверке',
  RESOLVED: 'Завершено',
} as const;

type PersistedEvent = Exclude<RoadEvent, {source: 'TOMTOM'}>;

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

export const formatTomTomDelay = (seconds: number | undefined): string | null => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return seconds < 60 ? '< 1 мин' : `${Math.round(seconds / 60)} мин`;
};

export const formatTomTomLength = (meters: number | undefined): string | null => {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) {
    return null;
  }
  return meters < 1_000
    ? `${Math.round(meters)} м`
    : `${(meters / 1_000).toLocaleString('ru-RU', {maximumFractionDigits: 1})} км`;
};

const formatOptionalDateTime = (value: string | undefined): string | null => {
  if (!value || !Number.isFinite(new Date(value).getTime())) {
    return null;
  }
  return formatEventTime(value);
};

const EventTitle = ({event}: {event: RoadEvent}) => {
  const timestamp = event.source === 'TOMTOM' ? event.fetchedAt : event.createdAt;
  const timeLabel = event.source === 'TELEGRAM'
    ? 'сообщение'
    : event.source === 'TOMTOM' ? 'данные получены' : 'добавлено';
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleMarker}>
        <EventMarker type={event.type} illustrationScale={1.55} accessibilityLabel={event.title} />
      </View>
      <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
      <View style={styles.eventTime}>
        <Text style={styles.eventTimeValue}>{formatEventTime(timestamp) ?? '—'}</Text>
        <Text style={styles.eventTimeLabel}>{timeLabel}</Text>
      </View>
    </View>
  );
};

export const shouldCaptureEventSheetDismiss = (scrollOffset: number, dy: number, dx: number) =>
  scrollOffset <= 1 && dy > 12 && dy > Math.abs(dx) * 1.2;

export const shouldDismissEventSheet = (dy: number, vy: number) =>
  dy >= 110 || (dy >= 60 && vy >= 1.2);

const AnimatedSheetContainer = ({
  children,
  footer,
  testID,
  bottomInset = 0,
  onClose,
  registerDismiss,
}: PropsWithChildren<{
  footer?: ReactNode;
  testID?: string;
  bottomInset?: number;
  onClose: () => void;
  registerDismiss: (dismiss: (() => void) | null) => void;
}>) => {
  const {height: windowHeight} = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const scrollOffset = useRef(0);
  const sheetHeight = useRef(0);
  const closing = useRef(false);
  const reduceMotion = useReducedMotion();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(dragY, {
      toValue: sheetHeight.current || windowHeight,
      duration: reduceMotion ? 0 : 220,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished) onCloseRef.current();
      else {
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

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      !closing.current && shouldCaptureEventSheetDismiss(scrollOffset.current, gesture.dy, gesture.dx),
    onPanResponderMove: (_, gesture) => dragY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (shouldDismissEventSheet(gesture.dy, gesture.vy)) {
        dismissRef.current();
      } else {
        Animated.spring(dragY, {
          toValue: 0, damping: 22, stiffness: 240, useNativeDriver: true,
        }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(dragY, {toValue: 0, useNativeDriver: true}).start();
    },
    onPanResponderTerminationRequest: () => false,
  })).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.spring(progress, {
      toValue: 1, damping: 22, stiffness: 240, mass: 0.85, useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      testID={testID}
      onLayout={event => { sheetHeight.current = event.nativeEvent.layout.height; }}
      style={[
        styles.container,
        {paddingBottom: bottomInset + 12, maxHeight: windowHeight * 0.82},
        {
          opacity: progress,
          transform: [{translateY: Animated.add(progress.interpolate({
            inputRange: [0, 1], outputRange: [24, 0],
          }), dragY)}],
        },
      ]}
    >
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollInner}
        onScroll={event => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? <View testID="event-sheet-footer" style={styles.footer}>{footer}</View> : null}
    </Animated.View>
  );
};

const SourceAndStatus = ({event}: {event: PersistedEvent}) => (
  <View style={styles.topline}>
    <Text
      testID={event.source === 'TELEGRAM' ? 'telegram-source-badge' : undefined}
      style={styles.sourceLabel}
    >
      {event.source === 'TELEGRAM'
        ? 'Telegram'
        : event.viewerRelation === 'CREATOR' ? 'ВАША МЕТКА' : 'СООБЩЕНО ПОЛЬЗОВАТЕЛЕМ'}
    </Text>
    <View style={styles.statusRow}>
      <View style={[
        styles.statusDot,
        event.status === 'ACTIVE' && styles.statusDotActive,
        event.status === 'STALE' && styles.statusDotStale,
        event.status === 'RESOLVED' && styles.statusDotResolved,
      ]} />
      <Text style={styles.statusText}>{STATUS_LABEL[event.status]}</Text>
    </View>
  </View>
);

const EventClose = ({onPress}: {onPress: () => void}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Закрыть"
    onPress={onPress}
    style={styles.closeButton}
  >
    <Text style={styles.closeText}>×</Text>
  </Pressable>
);

const EventLocation = ({event}: {event: PersistedEvent}) => {
  const telegram = event.source === 'TELEGRAM' ? event as TelegramRoadEvent : null;
  const label = telegram?.locationLabel?.trim();
  const precision = telegram ? LOCATION_PRECISION_LABEL[telegram.locationPrecision] : null;
  return (
    <View style={styles.locationLine}>
      <View style={styles.locationMark}><View style={styles.locationMarkCenter} /></View>
      <View style={styles.locationContent}>
        <Text style={styles.locationTitle}>
          {label || (telegram ? precision : 'Точка на карте')}
        </Text>
        <Text style={styles.locationDetail}>
          {telegram ? (label ? precision : 'Точный адрес не указан') : 'Место указано на карте'}
        </Text>
      </View>
      {telegram && (telegram.locationPrecision === 'STREET' || telegram.locationPrecision === 'AREA' || telegram.locationPrecision === 'SETTLEMENT') ? (
        <Text style={styles.approximationMark}>≈</Text>
      ) : null}
    </View>
  );
};

const EventMetrics = ({event}: {event: PersistedEvent}) => {
  const confidence = event.confidencePercent;
  const hasVotes = event.confirmationCount !== undefined || event.rejectionCount !== undefined;
  if (confidence === undefined && !hasVotes) return null;
  return (
    <View style={styles.communityLine}>
      {confidence !== undefined ? (
        <View style={styles.confidencePair}>
          <Text style={styles.confidenceValue}>{`${confidence}%`}</Text>
          <Text style={styles.communityLabel}>доверие</Text>
        </View>
      ) : null}
      {hasVotes ? (
        <View style={styles.voteCounts}>
          {event.confirmationCount !== undefined ? (
            <Text style={styles.communityLabel}><Text style={styles.countValue}>{event.confirmationCount}</Text> актуально</Text>
          ) : null}
          {event.rejectionCount !== undefined ? (
            <Text style={styles.communityLabel}><Text style={styles.countValue}>{event.rejectionCount}</Text> уже нет</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const TelegramSourceMessage = ({event}: {event: TelegramRoadEvent}) => {
  const [expanded, setExpanded] = useState(false);
  if (!event.sourceText?.trim()) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Исходное сообщение"
      accessibilityState={{expanded}}
      onPress={() => setExpanded(value => !value)}
      style={styles.sourceMessage}
    >
      <View style={styles.sourceMessageHeading}>
        <Text style={styles.sourceMessageLabel}>Исходное сообщение</Text>
        <Text style={styles.sourceMessageToggle}>{expanded ? 'Свернуть −' : 'Показать +'}</Text>
      </View>
      {expanded ? <Text style={styles.sourceMessageText}>{event.sourceText}</Text> : null}
    </Pressable>
  );
};

const FeedbackReceipt = ({relation}: {relation: 'CREATOR' | 'CONFIRM' | 'REJECT'}) => (
  <View style={styles.receipt}>
    <Text style={styles.receiptMark}>✓</Text>
    <View style={styles.receiptContent}>
      <Text style={styles.receiptTitle}>
        {relation === 'CREATOR' ? 'Ваш первый сигнал уже учтён'
          : relation === 'CONFIRM' ? 'Вы подтвердили актуальность'
            : 'Вы отметили, что события уже нет'}
      </Text>
      <Text style={styles.receiptDescription}>
        {relation === 'CREATOR' ? 'Повторно голосовать за свою метку не нужно.' : 'Ваш ответ сохранён.'}
      </Text>
    </View>
  </View>
);

const FeedbackError = ({error}: {error: RoadEventActionErrorState}) => (
  <View accessibilityRole="summary" style={styles.feedbackError}>
    <Text style={styles.feedbackErrorTitle}>{error.title}</Text>
    <Text style={styles.feedbackErrorDescription}>{error.description}</Text>
  </View>
);

const VotingActions = ({
  isSubmitting, pendingAction, onFeedback,
}: {
  isSubmitting: boolean;
  pendingAction: RoadEventFeedbackAction | null;
  onFeedback: (action: RoadEventFeedbackAction) => void;
}) => (
  <View style={styles.feedbackActions}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Подтвердить актуальность события"
      disabled={isSubmitting}
      onPress={() => onFeedback('CONFIRM')}
      style={({pressed}) => [styles.confirmButton, pressed && styles.buttonPressed, isSubmitting && styles.buttonDisabled]}
    >
      {isSubmitting && pendingAction === 'CONFIRM'
        ? <ActivityIndicator size="small" color="#FFFFFF" />
        : <Text style={styles.confirmButtonText}>Актуально</Text>}
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Сообщить, что события уже нет"
      disabled={isSubmitting}
      onPress={() => onFeedback('REJECT')}
      style={({pressed}) => [styles.rejectButton, pressed && styles.buttonPressed, isSubmitting && styles.buttonDisabled]}
    >
      {isSubmitting && pendingAction === 'REJECT'
        ? <ActivityIndicator size="small" color="#B94A50" />
        : <Text style={styles.rejectButtonText}>Уже нет</Text>}
    </Pressable>
  </View>
);

const TomTomEventDetails = ({
  event, onClose, onRequestClose, registerDismiss, bottomInset,
}: {
  event: TomTomRoadEvent;
  onClose: () => void;
  onRequestClose: () => void;
  registerDismiss: (dismiss: (() => void) | null) => void;
  bottomInset: number;
}) => {
  const route = [event.from, event.to].filter((value): value is string => Boolean(value)).join(' → ');
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
          <Text style={styles.sourceLabel}>TOMTOM</Text>
          <EventTitle event={event} />
        </View>
        <EventClose onPress={onRequestClose} />
      </View>
      {event.description ? <Text style={styles.description}>{event.description}</Text> : null}
      {route ? <Text style={styles.externalRoute}>{route}</Text> : null}
      {delay || length ? (
        <View style={styles.externalMetrics}>
          {delay ? <View style={styles.externalMetric}><Text style={styles.metricValue}>{delay}</Text><Text style={styles.metricLabel}>задержка</Text></View> : null}
          {length ? <View style={styles.externalMetric}><Text style={styles.metricValue}>{length}</Text><Text style={styles.metricLabel}>длина участка</Text></View> : null}
        </View>
      ) : null}
      {startTime || endTime ? (
        <View style={styles.timestamps}>
          {startTime ? <Text style={styles.timestamp}>Начало: {startTime}</Text> : null}
          {endTime ? <Text style={styles.timestamp}>Окончание: {endTime}</Text> : null}
        </View>
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
  if (!event) return null;

  const content = event.source === 'TOMTOM' ? (
    <TomTomEventDetails
      event={event}
      onClose={onClose}
      onRequestClose={requestClose}
      registerDismiss={registerDismiss}
      bottomInset={bottomInset}
    />
  ) : (() => {
    const relation = event.viewerRelation === 'CREATOR' || event.viewerRelation === 'CONFIRM' || event.viewerRelation === 'REJECT'
      ? event.viewerRelation
      : feedbackAction;
    const isCreator = relation === 'CREATOR';
    const isActive = event.status !== 'RESOLVED' && event.status !== 'HIDDEN_PENDING_REVIEW';
    const acceptsFeedback = event.source === 'USER' || event.type === 'ROAD_PATROL';
    const canVote = isActive && acceptsFeedback && !relation;
    const canReport = isActive && !isCreator;
    const showFooter = canVote || canReport;
    return (
      <AnimatedSheetContainer
        testID={event.source === 'TELEGRAM' && event.type !== 'ROAD_PATROL' ? 'telegram-event-details' : 'user-event-details'}
        bottomInset={bottomInset}
        onClose={onClose}
        registerDismiss={registerDismiss}
        footer={showFooter ? (
          <>
            {canVote ? <VotingActions isSubmitting={isSubmitting} pendingAction={pendingAction} onFeedback={onFeedback} /> : null}
            {canReport ? <EventReportAction key={event.id} event={event} bottomInset={bottomInset} /> : null}
          </>
        ) : undefined}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <SourceAndStatus event={event} />
            <EventTitle event={event} />
          </View>
          <EventClose onPress={requestClose} />
        </View>
        {event.description ? <Text style={styles.description}>{event.description}</Text> : null}
        <EventLocation event={event} />
        <EventMetrics event={event} />
        {event.lastConfirmedAt && formatOptionalDateTime(event.lastConfirmedAt) ? (
          <Text style={styles.lastConfirmed}>Последнее подтверждение: {formatOptionalDateTime(event.lastConfirmedAt)}</Text>
        ) : null}
        {event.source === 'TELEGRAM' ? <TelegramSourceMessage key={event.id} event={event} /> : null}
        {relation ? <FeedbackReceipt relation={relation} /> : null}
        {feedbackError && canVote ? <FeedbackError error={feedbackError} /> : null}
        {event.status === 'HIDDEN_PENDING_REVIEW' ? (
          <Text style={styles.inactiveNote}>Метка временно скрыта на проверке.</Text>
        ) : event.status === 'RESOLVED' ? (
          <Text style={styles.inactiveNote}>Событие завершено.</Text>
        ) : null}
      </AnimatedSheetContainer>
    );
  })();

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть событие"
        testID="event-details-backdrop"
        onPress={requestClose}
        style={styles.backdrop}
      />
      {content}
    </View>
  );
};
