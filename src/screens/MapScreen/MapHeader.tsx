import React, { useMemo, useState } from 'react';

import { Modal, Pressable, Text, View } from 'react-native';

import type { DpsActivitySummary } from '../../entities/road-event/api/roadEventRepository';
import type { CityConfig } from '../../shared/config/cities';
import type { RealtimeStatus } from '../../entities/road-event/model/useRoadEventRealtime';
import { BottomSheet } from '../../shared/ui/BottomSheet/BottomSheet';

import { headerStyles } from './MapHeader.styles';

interface MapHeaderProps {
  city: CityConfig;
  cities: readonly CityConfig[];
  dpsActivity: DpsActivitySummary | null | undefined;
  dpsActivityLoading?: boolean;
  eventCount: number;
  realtimeStatus: RealtimeStatus;
  onSelectCity: (cityId: string) => void;
}

const formatEventStatus = (
  eventCount: number,
  realtimeStatus: RealtimeStatus,
): string => {
  if (realtimeStatus === 'disconnected')
    return 'Обновления могут задерживаться';
  if (realtimeStatus === 'connecting') return 'Обновляем дорожную обстановку';
  if (eventCount === 0) return 'Дорожная обстановка спокойная';
  return eventCount === 1
    ? '1 свежее событие рядом'
    : `${eventCount} свежих событий рядом`;
};

export const MapHeader = ({
  city,
  cities,
  dpsActivity,
  dpsActivityLoading = false,
  eventCount,
  realtimeStatus,
  onSelectCity,
}: MapHeaderProps) => {
  const [selectorVisible, setSelectorVisible] = useState(false);
  const status = useMemo(
    () => formatEventStatus(eventCount, realtimeStatus),
    [eventCount, realtimeStatus],
  );

  return (
    <>
      <View style={headerStyles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Выбрать город. Сейчас ${city.name}`}
          testID="city-header-button"
          onPress={() => setSelectorVisible(true)}
          style={({ pressed }) => [
            headerStyles.cityCard,
            pressed && headerStyles.cardPressed,
          ]}
        >
          <Text style={headerStyles.brandLabel}>OnMap</Text>
          <View style={headerStyles.cityTitleRow}>
            <Text numberOfLines={1} style={headerStyles.cityTitle}>
              {city.name}
            </Text>
            <Text style={headerStyles.chevron}>⌄</Text>
          </View>

          <View style={headerStyles.statusRow}>
            <View
              style={[
                headerStyles.statusDot,
                realtimeStatus === 'disconnected' &&
                  headerStyles.statusDotDelayed,
              ]}
            />
            <Text numberOfLines={1} style={headerStyles.statusText}>
              {status}
            </Text>
          </View>
        </Pressable>

        <View
          accessibilityLabel={`Постов ДПС: ${dpsActivity?.total ?? 0}`}
          testID="dps-activity-card"
          style={headerStyles.dpsCard}
        >
          <Text style={headerStyles.dpsLabel}>ДПС</Text>
          <Text style={headerStyles.dpsTotal}>
            {dpsActivityLoading && !dpsActivity ? '—' : dpsActivity?.total ?? 0}
          </Text>
          <Text style={headerStyles.dpsBreakdown}>
            {dpsActivity
              ? `${dpsActivity.onMap} на карте\n${dpsActivity.unlocated} без точки`
              : 'считаем'}
          </Text>
        </View>
      </View>

      <Modal
        transparent
        statusBarTranslucent
        visible={selectorVisible}
        animationType="none"
        onRequestClose={() => setSelectorVisible(false)}
      >
        <BottomSheet
          visible={selectorVisible}
          offset={360}
          onClose={() => setSelectorVisible(false)}
        >
          <View style={headerStyles.selectorContent}>
            <Text style={headerStyles.selectorTitle}>Выберите город</Text>
            <Text style={headerStyles.selectorSubtitle}>
              Карта и события обновятся автоматически
            </Text>

            {cities.map(item => {
              const selected = item.id === city.id;

              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={item.name}
                  onPress={() => {
                    onSelectCity(item.id);
                    setSelectorVisible(false);
                  }}
                  style={({ pressed }) => [
                    headerStyles.cityOption,
                    selected && headerStyles.cityOptionSelected,
                    pressed && headerStyles.cityOptionPressed,
                  ]}
                >
                  <View>
                    <Text style={headerStyles.cityOptionTitle}>
                      {item.name}
                    </Text>
                    <Text style={headerStyles.cityOptionDescription}>
                      Доступный город OnMap
                    </Text>
                  </View>
                  <View
                    style={[
                      headerStyles.selectionMark,
                      selected && headerStyles.selectionMarkSelected,
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </BottomSheet>
      </Modal>
    </>
  );
};
