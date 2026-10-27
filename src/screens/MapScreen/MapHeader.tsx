import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppState, Linking, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import type { DpsActivitySummary } from '../../entities/road-event/api/roadEventRepository';
import type { PartnerBanner } from '../../entities/partner-placement/model/partnerPlacement';
import {getPartnerAccentColor, getPartnerAccentTextColor, getPartnerAppearance} from '../../entities/partner-placement/lib/partnerAppearance';
import type { CityConfig } from '../../shared/config/cities';
import type { RealtimeStatus } from '../../entities/road-event/model/useRoadEventRealtime';
import { BottomSheet } from '../../shared/ui/BottomSheet/BottomSheet';
import { SUPPORT_HANDLE, SUPPORT_URL } from '../../shared/config/support';
import { LEGAL_DOCUMENTS } from '../../shared/config/legal';

import { headerStyles } from './MapHeader.styles';

interface MapHeaderProps {
  city: CityConfig;
  cities: readonly CityConfig[];
  dpsActivity: DpsActivitySummary | null | undefined;
  dpsActivityLoading?: boolean;
  dpsActivityError?: boolean;
  onRetryDpsActivity?: () => void;
  eventCount: number;
  eventsStatus?: 'loading' | 'error' | 'success';
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
  eventsStatus: 'loading' | 'error' | 'success',
): string => {
  if (eventsStatus === 'loading') return 'Загружаем обстановку';
  if (eventsStatus === 'error') return 'Не удалось загрузить обстановку';
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
  dpsActivityError = false,
  onRetryDpsActivity,
  eventCount,
  eventsStatus = 'success',
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
  const [legalOpenFailed, setLegalOpenFailed] = useState<string | null>(null);
  const {height: windowHeight} = useWindowDimensions();
  const selectorScrollStyle = useMemo(() => ({maxHeight: windowHeight * 0.72}), [windowHeight]);
  const [bannerOpenFailed, setBannerOpenFailed] = useState(false);
  const [bannerLaidOut, setBannerLaidOut] = useState(false);
  const [bannerExpanded, setBannerExpanded] = useState(false);
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
    setBannerExpanded(false);
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
    () => formatEventStatus(eventCount, realtimeStatus, eventsStatus),
    [eventCount, eventsStatus, realtimeStatus],
  );
  const bannerAppearance = getPartnerAppearance(partnerBanner?.appearance);
  const bannerAccentColor = getPartnerAccentColor(bannerAppearance);
  const bannerAccentTextColor = getPartnerAccentTextColor(bannerAppearance, bannerAccentColor);

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
                (realtimeStatus === 'disconnected' || eventsStatus !== 'success') &&
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
            {dpsActivity?.total ?? '—'}
          </Text>
          {dpsActivityError && !dpsActivity ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Повторить загрузку сводки ДПС"
              disabled={dpsActivityLoading}
              onPress={onRetryDpsActivity}
              testID="dps-summary-retry"
            >
              <Text style={headerStyles.dpsBreakdown}>
                {dpsActivityLoading ? 'загружаем' : 'повторить'}
              </Text>
            </Pressable>
          ) : (
            <Text style={headerStyles.dpsBreakdown}>
            {dpsActivity
              ? `${dpsActivity.onMap} на карте\n${dpsActivity.unlocated} без точки`
              : dpsActivityLoading ? 'загружаем' : 'нет данных'}
            </Text>
          )}
        </View>
      </View>

      {partnerBanner ? (
        <View testID="partner-banner" onLayout={event => setBannerLaidOut(event.nativeEvent.layout.width > 0 && event.nativeEvent.layout.height > 0)} style={headerStyles.partnerBanner}>
          <View style={[headerStyles.partnerBannerAccent, {backgroundColor: bannerAccentColor}]} />
          <Pressable
            testID="partner-banner-expand"
            accessibilityRole="button"
            accessibilityState={{expanded: bannerExpanded}}
            accessibilityLabel={`Предложение партнёра: ${partnerBanner.title}`}
            onPress={() => setBannerExpanded(open => !open)}
            style={({pressed}) => [headerStyles.partnerBannerSummary, pressed && headerStyles.partnerBannerButtonPressed]}
          >
            <View style={[headerStyles.partnerBannerMark, {borderColor: bannerAccentColor}]}><Text style={[headerStyles.partnerBannerMarkText, {color: bannerAccentColor}]}>П</Text></View>
            <View style={headerStyles.partnerBannerCopy}>
              <Text style={headerStyles.partnerBannerKicker}>ПАРТНЁР РЯДОМ</Text>
              <Text numberOfLines={1} style={headerStyles.partnerBannerTitle}>{partnerBanner.title}</Text>
              {!bannerExpanded ? <Text numberOfLines={1} style={headerStyles.partnerBannerDescription}>{partnerBanner.text}</Text> : null}
            </View>
            <Text style={[headerStyles.partnerBannerExpandLabel, {color: bannerAccentColor}]}>{bannerExpanded ? 'Свернуть' : 'Открыть'}</Text>
          </Pressable>
          {bannerExpanded ? (
            <View style={headerStyles.partnerBannerDetails}>
              <Text style={headerStyles.partnerBannerFullText}>{partnerBanner.text}</Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={partnerBanner.button.label}
                onPress={() => {
                  onPartnerBannerPress?.(partnerBanner.id);
                  Linking.openURL(partnerBanner.button.url).catch(() => setBannerOpenFailed(true));
                }}
                testID="partner-banner-action"
                style={({pressed}) => [headerStyles.partnerBannerButton, {backgroundColor: bannerAccentColor, borderColor: bannerAccentColor}, pressed && headerStyles.partnerBannerButtonPressed]}
              >
                <Text numberOfLines={1} style={[headerStyles.partnerBannerButtonText, {color: bannerAccentTextColor}]}>{partnerBanner.button.label}</Text>
                <Text style={[headerStyles.partnerBannerLinkArrow, {color: bannerAccentTextColor}]}>↗</Text>
              </Pressable>
            </View>
          ) : null}
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
          <ScrollView
            style={selectorScrollStyle}
            contentContainerStyle={headerStyles.selectorContent}
            showsVerticalScrollIndicator
            testID="city-selector-content"
          >
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
            <View style={headerStyles.legalSection}>
              <Text style={headerStyles.supportTitle}>Документы OnMap</Text>
              {LEGAL_DOCUMENTS.map(document => (
                <Pressable
                  key={document.id}
                  testID={`legal-link-${document.id}`}
                  accessibilityRole="link"
                  accessibilityLabel={document.title}
                  accessibilityHint="Откроется в браузере"
                  onPress={async () => {
                    setLegalOpenFailed(null);
                    try {
                      await Linking.openURL(document.url);
                    } catch {
                      setLegalOpenFailed(document.url);
                    }
                  }}
                  style={({pressed}) => [headerStyles.legalLink, pressed && headerStyles.legalLinkPressed]}
                >
                  <Text style={headerStyles.legalLinkText}>{document.title}</Text>
                </Pressable>
              ))}
              {legalOpenFailed ? (
                <Text selectable style={headerStyles.supportHint} accessibilityLiveRegion="polite">
                  Не удалось открыть документ. Проверьте подключение и нажмите ссылку ещё раз или скопируйте адрес в браузер: {legalOpenFailed}
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </BottomSheet>
      </Modal>
    </>
  );
};
