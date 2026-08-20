import React from 'react';

import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native';

import {
  RoadEvent,
} from '../../entities/road-event/model/roadEvent';

import {
  RoadEventFeedbackAction,
} from '../../entities/road-event/lib/roadEventFreshness';

import {
  styles,
} from './EventDetailsSheet.styles';

interface EventDetailsSheetProps {
  event:
    | RoadEvent
    | null;

  feedbackAction?:
    | RoadEventFeedbackAction
    | null;

  isSubmitting:
    boolean;

  onFeedback: (
    action:
      RoadEventFeedbackAction,
  ) => void;

  onClose:
    () => void;
}

const STATUS_LABEL = {
  ACTIVE:
    'Актуально',

  UNCONFIRMED:
    'Нужно подтверждение',

  STALE:
    'Давно не подтверждали',

  RESOLVED:
    'Завершено',
} as const;

const formatDateTime = (
  value:
    string,
): string => {
  const date =
    new Date(
      value,
    );

  return date.toLocaleString(
    'ru-RU',
    {
      day:
        '2-digit',

      month:
        '2-digit',

      hour:
        '2-digit',

      minute:
        '2-digit',
    },
  );
};

export const EventDetailsSheet = ({
  event,
  feedbackAction,
  isSubmitting,
  onFeedback,
  onClose,
}: EventDetailsSheetProps) => {
  if (!event) {
    return null;
  }

  const viewerRelation =
    event.viewerRelation;

  const effectiveFeedback =
    viewerRelation ===
      'CONFIRM' ||
    viewerRelation ===
      'REJECT'
      ? viewerRelation
      : feedbackAction;

  const isCreator =
    viewerRelation ===
    'CREATOR';

  const confidencePercent =
    Math.round(
      event.confidence *
        100,
    );

  return (
    <View
      style={
        styles.container
      }>
      <View
        style={
          styles.handle
        }
      />

      <View
        style={
          styles.header
        }>
        <View
          style={
            styles.headerContent
          }>
          <View
            style={
              styles.statusRow
            }>
            <View
              style={[
                styles.statusDot,

                event.status ===
                  'ACTIVE' &&
                  styles.statusDotActive,

                event.status ===
                  'STALE' &&
                  styles.statusDotStale,

                event.status ===
                  'RESOLVED' &&
                  styles.statusDotResolved,
              ]}
            />

            <Text
              style={
                styles.statusText
              }>
              {
                STATUS_LABEL[
                  event.status
                ]
              }
            </Text>
          </View>

          <Text
            style={
              styles.title
            }>
            {
              event.title
            }
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={
            onClose
          }
          style={
            styles.closeButton
          }>
          <Text
            style={
              styles.closeText
            }>
            ×
          </Text>
        </Pressable>
      </View>

      {event.description ? (
        <Text
          style={
            styles.description
          }>
          {
            event.description
          }
        </Text>
      ) : null}

      <View
        style={
          styles.metrics
        }>
        <View
          style={
            styles.metric
          }>
          <Text
            style={
              styles.metricValue
            }>
            {
              confidencePercent
            }%
          </Text>

          <Text
            style={
              styles.metricLabel
            }>
            доверие
          </Text>
        </View>

        <View
          style={
            styles.metricDivider
          }
        />

        <View
          style={
            styles.metric
          }>
          <Text
            style={
              styles.metricValue
            }>
            {
              event.confirmationCount
            }
          </Text>

          <Text
            style={
              styles.metricLabel
            }>
            актуально
          </Text>
        </View>

        <View
          style={
            styles.metricDivider
          }
        />

        <View
          style={
            styles.metric
          }>
          <Text
            style={
              styles.metricValue
            }>
            {
              event.rejectionCount
            }
          </Text>

          <Text
            style={
              styles.metricLabel
            }>
            уже нет
          </Text>
        </View>
      </View>

      <View
        style={
          styles.timestamps
        }>
        <Text
          style={
            styles.timestamp
          }>
          Создано:{' '}
          {formatDateTime(
            event.createdAt,
          )}
        </Text>

        {event.lastConfirmedAt ? (
          <Text
            style={
              styles.timestamp
            }>
            Подтверждено:{' '}
            {formatDateTime(
              event.lastConfirmedAt,
            )}
          </Text>
        ) : null}
      </View>

      <View
        style={
          styles.feedbackSection
        }>
        {isCreator ? (
          <View
            style={
              styles.relationCard
            }>
            <Text
              style={
                styles.relationIcon
              }>
              ✓
            </Text>

            <View
              style={
                styles.relationContent
              }>
              <Text
                style={
                  styles.relationTitle
                }>
                Вы сообщили об этом событии
              </Text>

              <Text
                style={
                  styles.relationDescription
                }>
                Ваше сообщение уже
                учтено как первый
                сигнал. Подтверждать
                собственную метку
                повторно не нужно.
              </Text>
            </View>
          </View>
        ) : effectiveFeedback ? (
          <View
            style={
              styles.relationCard
            }>
            <Text
              style={
                styles.relationIcon
              }>
              ✓
            </Text>

            <View
              style={
                styles.relationContent
              }>
              <Text
                style={
                  styles.relationTitle
                }>
                {effectiveFeedback ===
                'CONFIRM'
                  ? 'Вы подтвердили актуальность'
                  : 'Вы отметили, что события уже нет'}
              </Text>

              <Text
                style={
                  styles.relationDescription
                }>
                Ваш ответ уже
                учтён в оценке
                актуальности этого
                события.
              </Text>
            </View>
          </View>
        ) : (
          <>
            <Text
              style={
                styles.feedbackTitle
              }>
              Событие ещё актуально?
            </Text>

            <View
              style={
                styles.feedbackActions
              }>
              <Pressable
                disabled={
                  isSubmitting
                }
                onPress={() =>
                  onFeedback(
                    'CONFIRM',
                  )
                }
                style={({pressed}) => [
                  styles.confirmButton,

                  pressed &&
                    styles.buttonPressed,

                  isSubmitting &&
                    styles.buttonDisabled,
                ]}>
                {isSubmitting ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.confirmButtonText
                    }>
                    ✓ Актуально
                  </Text>
                )}
              </Pressable>

              <Pressable
                disabled={
                  isSubmitting
                }
                onPress={() =>
                  onFeedback(
                    'REJECT',
                  )
                }
                style={({pressed}) => [
                  styles.rejectButton,

                  pressed &&
                    styles.buttonPressed,

                  isSubmitting &&
                    styles.buttonDisabled,
                ]}>
                <Text
                  style={
                    styles.rejectButtonText
                  }>
                  × Уже нет
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
};