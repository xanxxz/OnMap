import React from 'react';

import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native';

import {
  RoadEventType,
} from '../../entities/road-event/model/roadEvent';

import type {
  RoadEventActionErrorState,
} from '../../entities/road-event/model/roadEventActionError';

import {
  ROAD_EVENT_META,
} from '../../entities/road-event/model/roadEventMeta';

import {
  RoadEventIcon,
} from '../../entities/road-event/ui/RoadEventIcon/RoadEventIcon';

import {
  ReportLocationStatus,
  ReportEventStep,
  ReportLocationSource,
} from '../../features/report-event/model/reportEventDraft';

import {
  colors,
} from '../../shared/theme';

import {
  BottomSheet,
} from '../../shared/ui/BottomSheet/BottomSheet';

import {styles} from './ReportEventSheet.styles';

interface ReportEventSheetProps {
  visible: boolean;

  step: ReportEventStep;

  selectedType:
    | RoadEventType
    | null;

  coordinate:
    | [number, number]
    | null;

  locationSource:
    | ReportLocationSource
    | null;

  locationStatus: ReportLocationStatus;

  locationAccuracy: number | null;

  locationValid: boolean;

  isSubmitting: boolean;

  submissionError?:
    | RoadEventActionErrorState
    | null;

  onClose: () => void;

  onBack: () => void;

  onSelect: (
    type: RoadEventType,
  ) => void;

  onSubmit: () => void;

  onOpenSettings: () => void;
}

interface CanSubmitReportEventInput {
  selectedType:
    | RoadEventType
    | null;

  coordinate:
    | [number, number]
    | null;

  locationValid: boolean;

  isSubmitting: boolean;
}

export const canSubmitReportEvent = ({
  selectedType,
  coordinate,
  locationValid,
  isSubmitting,
}: CanSubmitReportEventInput): boolean => {
  return (
    Boolean(
      selectedType &&
        coordinate &&
        locationValid,
    ) && !isSubmitting
  );
};

const EVENT_TYPES: RoadEventType[] =
  [
    'ACCIDENT',
    'ROAD_CLOSURE',
    'ROADWORKS',
    'TRAFFIC',
    'ROAD_HAZARD',
    'TRAFFIC_LIGHT',
    'ROAD_SERVICE',
    'ROAD_PATROL',
    'OTHER',
  ];

const getLocationTitle = (
  source:
    | ReportLocationSource
    | null,
): string => {
  if (
    source ===
    'MAP_LONG_PRESS'
  ) {
    return 'Точка на карте';
  }

  return 'Текущее место';
};

export const ReportEventSheet = ({
  visible,
  step,
  selectedType,
  coordinate,
  locationSource,
  locationStatus,
  locationAccuracy,
  locationValid,
  isSubmitting,
  submissionError = null,
  onClose,
  onBack,
  onSelect,
  onSubmit,
  onOpenSettings,
}: ReportEventSheetProps) => {
  const canSubmit =
    canSubmitReportEvent({
      selectedType,
      coordinate,
      locationValid,
      isSubmitting,
    });

  const selectedMeta =
    selectedType
      ? ROAD_EVENT_META[
          selectedType
        ]
      : null;

  const dismissDuplicate =
    submissionError?.kind ===
    'duplicate';

  const primaryEnabled =
    dismissDuplicate
      ? !isSubmitting
      : canSubmit;

  return (
    <BottomSheet
      visible={visible}
      offset={720}
      onClose={onClose}>
      {step === 'TYPE' ? (
        <View style={styles.content}>
          <Text style={styles.title}>
            Что произошло?
          </Text>

          <Text
            style={styles.subtitle}>
            Выберите тип события
          </Text>

          <View style={styles.grid}>
            {EVENT_TYPES.map(type => {
              const meta =
                ROAD_EVENT_META[
                  type
                ];

              return (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityLabel={
                    meta.label
                  }
                  onPress={() =>
                    onSelect(type)
                  }
                  style={({pressed}) => [
                    styles.item,

                    pressed &&
                      styles.itemPressed,
                  ]}>
                  <RoadEventIcon
                    type={type}
                  />

                  <Text
                    numberOfLines={2}
                    style={styles.label}>
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.title}>
            Подтвердите событие
          </Text>

          <Text
            style={styles.subtitle}>
            Проверьте тип и место
          </Text>

          {selectedType &&
          selectedMeta ? (
            <View
              style={
                styles.summaryCard
              }>
              <RoadEventIcon
                type={
                  selectedType
                }
              />

              <View
                style={
                  styles.summaryText
                }>
                <Text
                  style={
                    styles.summaryLabel
                  }>
                  Тип события
                </Text>

                <Text
                  style={
                    styles.summaryValue
                  }>
                  {
                    selectedMeta.label
                  }
                </Text>
              </View>
            </View>
          ) : null}

          <View
            style={
              styles.locationCard
            }>
            <View
              style={
                styles.locationMarker
              }>
              <View
                style={
                  styles.locationMarkerDot
                }
              />
            </View>

            <View
              style={
                styles.locationText
              }>
              <Text
                style={
                  styles.summaryLabel
                }>
                Место
              </Text>

              <Text
                style={
                  styles.summaryValue
                }>
                {getLocationTitle(
                  locationSource,
                )}
              </Text>

              {locationStatus === 'LOCATING' ? (
                <View style={styles.locationProgress}>
                  <ActivityIndicator size="small" color={colors.primary} />

                  <Text style={styles.locationProgressText}>
                    Определяем вашу позицию
                  </Text>
                </View>
              ) : locationStatus === 'PERMISSION_DENIED' ? (
                <>
                  <Text style={styles.locationError}>
                    Доступ к геопозиции не выдан. Поставьте точку долгим
                    нажатием на карте или разрешите доступ в настройках.
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Открыть настройки геолокации"
                    onPress={onOpenSettings}
                    style={styles.settingsButton}
                  >
                    <Text style={styles.settingsButtonText}>
                      Открыть настройки
                    </Text>
                  </Pressable>
                </>
              ) : locationStatus === 'UNAVAILABLE' ? (
                <Text style={styles.locationError}>
                  Не удалось получить свежую геопозицию. Поставьте точку
                  долгим нажатием на карте.
                </Text>
              ) : !coordinate ? (
                <Text
                  style={
                    styles.locationError
                  }>
                  GPS пока не получен.
                  Выберите точку долгим
                  нажатием на карте.
                </Text>
              ) : !locationValid ? (
                <Text
                  style={
                    styles.locationError
                  }>
                  Точка находится вне
                  рабочей зоны Балаково.
                </Text>
              ) : locationStatus === 'APPROXIMATE' ? (
                <Text style={styles.locationWarning}>
                  Точка определена приблизительно. Проверьте положение на
                  карте
                  {locationAccuracy
                    ? ` · около ${Math.round(locationAccuracy)} м`
                    : ''}
                  .
                </Text>
              ) : locationStatus === 'MANUAL' ? (
                <Text style={styles.locationReady}>
                  Точка выбрана вручную. Её можно скорректировать долгим
                  нажатием на карте.
                </Text>
              ) : (
                <Text
                  style={
                    styles.locationReady
                  }>
                  Точка определена. При необходимости скорректируйте её на
                  карте.
                </Text>
              )}
            </View>
          </View>

          {submissionError ? (
            <View
              accessibilityRole="summary"
              style={[
                styles.submissionError,

                submissionError.kind !==
                  'generic' &&
                  styles.submissionErrorWarning,
              ]}>
              <View
                style={[
                  styles.submissionErrorIcon,

                  submissionError.kind !==
                    'generic' &&
                    styles.submissionErrorIconWarning,
                ]}>
                <Text
                  style={[
                    styles.submissionErrorIconText,

                    submissionError.kind !==
                      'generic' &&
                      styles.submissionErrorIconTextWarning,
                  ]}>
                  {submissionError.kind ===
                  'duplicate'
                    ? '≈'
                    : '!'}
                </Text>
              </View>

              <View
                style={
                  styles.submissionErrorContent
                }>
                <Text
                  style={
                    styles.submissionErrorTitle
                  }>
                  {
                    submissionError.title
                  }
                </Text>

                <Text
                  style={
                    styles.submissionErrorDescription
                  }>
                  {
                    submissionError.description
                  }
                </Text>
              </View>
            </View>
          ) : null}

          <View
            style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Вернуться к выбору типа события"
              disabled={
                isSubmitting
              }
              onPress={onBack}
              style={({pressed}) => [
                styles.backButton,

                pressed &&
                  !isSubmitting &&
                  styles.actionPressed,

                isSubmitting &&
                  styles.backButtonDisabled,
              ]}>
              <Text
                style={
                  styles.backButtonText
                }>
                Назад
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                dismissDuplicate
                  ? 'Закрыть сообщение о похожем событии'
                  : submissionError
                    ?.canRetry
                    ? 'Повторить отправку события'
                    : 'Отправить событие'
              }
              disabled={
                !primaryEnabled
              }
              onPress={
                dismissDuplicate
                  ? onClose
                  : onSubmit
              }
              style={({pressed}) => [
                styles.submitButton,

                !primaryEnabled &&
                  styles.submitButtonDisabled,

                pressed &&
                  primaryEnabled &&
                  styles.actionPressed,
              ]}>
              {isSubmitting ? (
                <ActivityIndicator
                  size="small"
                  color={
                    colors.textInverse
                  }
                />
              ) : (
                <Text
                  style={
                    styles.submitButtonText
                  }>
                  {dismissDuplicate
                    ? 'Понятно'
                    : submissionError
                      ?.canRetry
                      ? 'Повторить'
                      : 'Сообщить'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </BottomSheet>
  );
};
