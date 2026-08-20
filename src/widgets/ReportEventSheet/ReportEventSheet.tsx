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

import {
  ROAD_EVENT_META,
} from '../../entities/road-event/model/roadEventMeta';

import {
  RoadEventIcon,
} from '../../entities/road-event/ui/RoadEventIcon/RoadEventIcon';

import {
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

  locationValid: boolean;

  isSubmitting: boolean;

  onClose: () => void;

  onBack: () => void;

  onSelect: (
    type: RoadEventType,
  ) => void;

  onSubmit: () => void;
}

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
  locationValid,
  isSubmitting,
  onClose,
  onBack,
  onSelect,
  onSubmit,
}: ReportEventSheetProps) => {
  const canSubmit =
    Boolean(
      selectedType &&
        coordinate &&
        locationValid,
    ) && !isSubmitting;

  const selectedMeta =
    selectedType
      ? ROAD_EVENT_META[
          selectedType
        ]
      : null;

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

              {!coordinate ? (
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
              ) : (
                <Text
                  style={
                    styles.locationReady
                  }>
                  Точка готова к
                  отправке
                </Text>
              )}
            </View>
          </View>

          <View
            style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              style={({pressed}) => [
                styles.backButton,

                pressed &&
                  styles.actionPressed,
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
              disabled={!canSubmit}
              onPress={onSubmit}
              style={({pressed}) => [
                styles.submitButton,

                !canSubmit &&
                  styles.submitButtonDisabled,

                pressed &&
                  canSubmit &&
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
                  Сообщить
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </BottomSheet>
  );
};