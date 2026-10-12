import React, {useEffect, useState} from 'react';

import {
  Alert,
  AppState,
  Pressable,
  Text,
  View,
} from 'react-native';

import {styles} from './MapControls.styles';
import {
  checkNotificationPermission,
  openNotificationSettings,
  requestNotificationPermissionOnce,
  type NotificationPermissionState,
} from '../../../notifications/notificationPermission';
import type {LocationPermissionState} from '../../../user-location/useLocationPermission';
import {requestLocationPermission} from '../../../user-location/useLocationPermission';

interface MapControlsProps {
  locationAvailable: boolean;
  locationMessage?: string | null;
  locationPermission?: LocationPermissionState;
  onOpenLocationSettings?: () => void;
  onRequestLocation?: () => Promise<void>;

  onZoomIn: () => void;

  onZoomOut: () => void;

  onLocate: () => void;
}

export const MapControls = ({
  locationAvailable,
  locationMessage = null,
  locationPermission,
  onOpenLocationSettings,
  onRequestLocation,
  onZoomIn,
  onZoomOut,
  onLocate,
}: MapControlsProps) => {
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>('notDetermined');

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      checkNotificationPermission().then(status => {
        if (mounted) setNotificationPermission(status);
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const handleNotifications = () => {
    if (notificationPermission === 'granted' || notificationPermission === 'limited') {
      Alert.alert('Уведомления включены', 'Разрешение можно изменить в настройках устройства.', [
        {text: 'Закрыть'},
        {text: 'Настройки', onPress: () => { openNotificationSettings().catch(() => Alert.alert('Не удалось открыть настройки', 'Откройте настройки OnMap вручную.')); }},
      ]);
      return;
    }
    if (notificationPermission === 'notDetermined') {
      Alert.alert(
        'Уведомления OnMap',
        'Они могут сообщать о новых дорожных событиях выбранных приложением типов и предложениях партнёров. Отказ не мешает пользоваться картой.',
        [
          {text: 'Не сейчас', style: 'cancel'},
          {text: 'Продолжить', onPress: () => {
            requestNotificationPermissionOnce().then(setNotificationPermission);
          }},
        ],
      );
      return;
    }
    Alert.alert(
      'Уведомления недоступны',
      'Разрешите уведомления для OnMap в настройках устройства. Карта работает и без них.',
      [
        {text: 'Закрыть', style: 'cancel'},
        {text: 'Настройки', onPress: () => { openNotificationSettings().catch(() => Alert.alert('Не удалось открыть настройки', 'Откройте настройки OnMap вручную.')); }},
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.zoomGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Приблизить карту"
          onPress={onZoomIn}
          style={({pressed}) => [
            styles.control,

            pressed &&
              styles.controlPressed,
          ]}>
          <Text style={styles.zoomText}>
            +
          </Text>
        </Pressable>

        <View
          style={styles.divider}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отдалить карту"
          onPress={onZoomOut}
          style={({pressed}) => [
            styles.control,

            pressed &&
              styles.controlPressed,
          ]}>
          <Text style={styles.zoomText}>
            −
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Уведомления"
        onPress={handleNotifications}
        style={({pressed}) => [styles.locationButton, pressed && styles.controlPressed]}>
        <View style={styles.bellDome} />
        <View style={styles.bellRim} />
        <View style={styles.bellClapper} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Показать моё местоположение"
        onPress={() => {
          if (locationAvailable) {
            onLocate();
          } else if (locationPermission === 'notDetermined') {
            Alert.alert(
              'Моё местоположение',
              'Разрешите геопозицию, чтобы вернуться к себе на карте. Без неё можно выбрать точку события вручную.',
              [
                {text: 'Не сейчас', style: 'cancel'},
                {text: 'Разрешить', onPress: () => {
                  (onRequestLocation?.() ?? requestLocationPermission().then(() => undefined))
                    .catch(() => Alert.alert('Геопозиция недоступна', 'Проверьте разрешение в настройках или поставьте точку вручную.'));
                }},
              ],
            );
          } else if (locationPermission === 'denied' && onOpenLocationSettings) {
            Alert.alert(
              'Геолокация выключена',
              'Разрешите OnMap доступ к геопозиции в настройках устройства. Точку события можно поставить вручную.',
              [
                {text: 'Закрыть', style: 'cancel'},
                {text: 'Настройки', onPress: onOpenLocationSettings},
              ],
            );
          } else {
            Alert.alert(
              'Моё местоположение',
              locationMessage ??
                'Определяем ваше местоположение. Если поиск затянется, поставьте точку события вручную.',
            );
          }
        }}
        style={({pressed}) => [
          styles.locationButton,

          !locationAvailable && locationPermission === 'loading' &&
            styles.locationButtonDisabled,

          pressed &&
            locationAvailable &&
            styles.controlPressed,
        ]}>
        <View style={styles.targetOuter}>
          <View
            style={styles.targetInner}
          />
        </View>
      </Pressable>
      {locationMessage ? (
        <Text accessibilityRole="alert" style={styles.locationHint}>
          Геопозиция недоступна
        </Text>
      ) : null}
    </View>
  );
};
