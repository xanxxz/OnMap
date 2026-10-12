import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppState, Linking, Modal, Pressable, Text, View } from 'react-native';

import type { DpsActivitySummary } from '../../entities/road-event/api/roadEventRepository';
import type { PartnerBanner } from '../../entities/partner-placement/model/partnerPlacement';
import { getPartnerAppearance } from '../../entities/partner-placement/lib/partnerAppearance';
import type { CityConfig } from '../../shared/config/cities';
import type { RealtimeStatus } from '../../entities/road-event/model/useRoadEventRealtime';
import { BottomSheet } from '../../shared/ui/BottomSheet/BottomSheet';
import { SUPPORT_HANDLE, SUPPORT_URL } from '../../shared/config/support';

import { headerStyles } from './MapHeader.styles';

interface MapHeaderProps {
  city: CityConfig;
  cities: readonly CityConfig[];
  dpsActivity: DpsActivitySummary | null | undefined;
  dpsActivityLoading?: boolean;
  eventCount: number;
  realtimeStatus: RealtimeStatus;
  partnerBanner?: PartnerBanner | null;
  partnerBannerVisible?: boolean;
  onPartnerBannerImpression?: (bannerId: string) => void;
  onPartnerBannerPress?: (bannerId: string) => void;
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
  partnerBanner,
  partnerBannerVisible = true,
  onPartnerBannerImpression,
  onPartnerBannerPress,
  onSelectCity,
}: MapHeaderProps) => {
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorMounted, setSelectorMounted] = useState(false);
  const [supportOpenFailed, setSupportOpenFailed] = useState(false);
  const [bannerOpenFailed, setBannerOpenFailed] = useState(false);
  const [bannerLaidOut, setBannerLaidOut] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const countedBanners = useRef(new Set<string>());
  const impressionCallback = useRef(onPartnerBannerImpression);
  impressionCallback.current = onPartnerBannerImpression;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    setBannerLaidOut(false);
  }, [partnerBanner?.id]);
  useEffect(() => {
    const id = partnerBanner?.id;
    if (!id || !bannerLaidOut || !partnerBannerVisible || !appActive || selectorMounted || countedBanners.current.has(id)) return;
    const timer = setTimeout(() => {
      countedBanners.current.add(id);
      impressionCallback.current?.(id);
    }, 1000);
    return () => clearTimeout(timer);
  }, [partnerBanner?.id, bannerLaidOut, partnerBannerVisible, appActive, selectorMounted]);
  const closeSelector = useCallback(() => setSelectorVisible(false), []);
  const selectorClosed = useCallback(() => setSelectorMounted(false), []);
  const status = useMemo(
    () => formatEventStatus(eventCount, realtimeStatus),
    [eventCount, realtimeStatus],
  );
  const bannerAppearance = getPartnerAppearance(partnerBanner?.appearance);

  return (
    <>
      <View style={headerStyles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Выбрать город. Сейчас ${city.name}`}
          testID="city-header-button"
          onPress={() => {
            setSelectorMounted(true);
            setSelectorVisible(true);
          }}
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
            <View
              accessible={false}
              pointerEvents="none"
              testID="city-header-chevron"
              style={headerStyles.chevron}
            >
              <View style={headerStyles.chevronShape} />
            </View>
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

      {partnerBanner ? (
        <View testID="partner-banner" onLayout={event => setBannerLaidOut(event.nativeEvent.layout.width > 0 && event.nativeEvent.layout.height > 0)} style={[headerStyles.partnerBanner, {backgroundColor: bannerAppearance.backgroundColor}]}>
          <Text numberOfLines={2} style={[headerStyles.partnerBannerTitle, {color: bannerAppearance.textColor}]}>{partnerBanner.title}</Text>
          <Text numberOfLines={2} style={[headerStyles.partnerBannerDescription, {color: bannerAppearance.textColor}]}>{partnerBanner.text}</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={partnerBanner.button.label}
            onPress={() => {
              onPartnerBannerPress?.(partnerBanner.id);
              Linking.openURL(partnerBanner.button.url).catch(() =>
                setBannerOpenFailed(true),
              );
            }}
            style={({ pressed }) => [
              headerStyles.partnerBannerButton,
              pressed && headerStyles.partnerBannerButtonPressed,
            ]}
          >
            <Text numberOfLines={1} style={[headerStyles.partnerBannerButtonText, {color: bannerAppearance.textColor}]}>
              {partnerBanner.button.label}
            </Text>
            <View style={[headerStyles.partnerBannerArrow, {borderColor: bannerAppearance.textColor}]} accessible={false}>
              <View style={[headerStyles.partnerBannerArrowHead, {borderColor: bannerAppearance.textColor}]} />
            </View>
          </Pressable>
        </View>
      ) : null}
      {partnerBanner && bannerOpenFailed ? (
        <Text selectable style={headerStyles.bannerError}>
          Не удалось открыть ссылку. Адрес: {partnerBanner.button.url}
        </Text>
      ) : null}

      <Modal
        transparent
        statusBarTranslucent
        visible={selectorMounted}
        animationType="none"
        onRequestClose={closeSelector}
      >
        <BottomSheet
          visible={selectorVisible}
          offset={360}
          onClose={closeSelector}
          onClosed={selectorClosed}
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
                    closeSelector();
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

            <View style={headerStyles.supportSection}>
              <Text style={headerStyles.supportTitle}>Поддержка</Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Открыть поддержку ${SUPPORT_HANDLE}`}
                onPress={() => {
                  Linking.openURL(SUPPORT_URL).catch(() =>
                    setSupportOpenFailed(true),
                  );
                }}
                style={headerStyles.supportLink}
              >
                <Text style={headerStyles.supportLinkText}>{SUPPORT_HANDLE}</Text>
              </Pressable>
              {supportOpenFailed ? (
                <Text selectable style={headerStyles.supportHint}>
                  Не удалось открыть ссылку. Адрес можно скопировать: {SUPPORT_URL}
                </Text>
              ) : null}
            </View>
          </View>
        </BottomSheet>
      </Modal>
    </>
  );
};
