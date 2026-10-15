import React, {useEffect, useState} from 'react';

import {
  AppState,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import {styles} from './MapControls.styles';
import {MapControlsDialog, type MapControlsDialogAction} from './MapControlsDialog';
import {
  checkNotificationPermission,
  openNotificationSettings,
  requestNotificationPermissionOnce,
  type NotificationPermissionState,
} from '../../../notifications/notificationPermission';
import type {LocationPermissionState} from '../../../user-location/useLocationPermission';
import {requestLocationPermission} from '../../../user-location/useLocationPermission';
import {getNotificationPreferences, setNotificationPreferences} from '../../../notifications/notificationPreferences';
import {bindOwnerTestDevice} from '../../../notifications/pushDeviceRegistration';

interface MapControlsProps {
  locationAvailable: boolean;
  locationMessage?: string | null;
  locationPermission?: LocationPermissionState;
  onOpenLocationSettings?: () => void;
  onRequestLocation?: () => Promise<boolean>;
  onRetryLocation?: () => Promise<boolean>;
  onContinueManually?: () => void;
  locationUnavailable?: boolean;

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
  onRetryLocation,
  onContinueManually,
  locationUnavailable = false,
  onZoomIn,
  onZoomOut,
  onLocate,
}: MapControlsProps) => {
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>('notDetermined');
  const [pairingVisible, setPairingVisible] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const [dialog, setDialog] = useState<{title: string; message: string; actions: MapControlsDialogAction[]} | null>(null);

  const showDialog = (title: string, message: string, actions: MapControlsDialogAction[]) =>
    setDialog({title, message, actions});

  const showNotificationPermissionDialog = (status: NotificationPermissionState) => {
    const unavailable = status === 'unavailable';
    showDialog(
      unavailable ? 'Уведомления недоступны' : 'Уведомления выключены',
      unavailable
        ? 'На этом устройстве сейчас нельзя включить уведомления. Проверьте системные настройки. Картой можно пользоваться и без них.'
        : 'Чтобы получать уведомления OnMap, разрешите их в настройках устройства. Карта и создание событий доступны и без уведомлений.',
      [
        {label: 'Настройки', primary: true, onPress: async () => {
          try {
            await openNotificationSettings();
          } catch {
            showDialog('Не удалось открыть настройки', 'Откройте настройки OnMap вручную. Уведомления не обязательны для работы карты.', [
              {label: 'Позже', primary: true, onPress: () => undefined},
            ]);
          }
        }},
        {label: 'Позже', onPress: () => undefined},
      ],
    );
  };

  const openNotificationPreferences = async () => {
    try {
      const preferences = await getNotificationPreferences();
      showDialog('Уведомления OnMap', 'Категории можно включать и выключать независимо. Отказ в системном разрешении остаётся под управлением устройства.', [
        {label: `ДПС: ${preferences.roadPushEnabled ? 'выключить' : 'включить'}`, onPress: async () => {
          const next = {...preferences, roadPushEnabled: !preferences.roadPushEnabled};
          try {
            await setNotificationPreferences(next);
            await openNotificationPreferences();
          } catch {
            showDialog('Не удалось сохранить', 'Попробуйте изменить настройку ещё раз.', [{label: 'Готово', primary: true, onPress: () => undefined}]);
          }
        }},
        {label: `Новости и предложения: ${preferences.newsPushEnabled ? 'выключить' : 'включить'}`, onPress: async () => {
          const next = {...preferences, newsPushEnabled: !preferences.newsPushEnabled};
          try {
            await setNotificationPreferences(next);
            await openNotificationPreferences();
          } catch {
            showDialog('Не удалось сохранить', 'Попробуйте изменить настройку ещё раз.', [{label: 'Готово', primary: true, onPress: () => undefined}]);
          }
        }},
        {label: 'Привязать для теста', onPress: () => setPairingVisible(true)},
        {label: 'Настройки устройства', onPress: async () => {
          try {
            await openNotificationSettings();
          } catch {
            showDialog('Не удалось открыть настройки', 'Откройте настройки OnMap вручную.', [{label: 'Готово', primary: true, onPress: () => undefined}]);
          }
        }},
        {label: 'Готово', primary: true, onPress: () => undefined},
      ]);
    } catch {
      showDialog('Не удалось загрузить настройки', 'Попробуйте открыть их ещё раз.', [{label: 'Готово', primary: true, onPress: () => undefined}]);
    }
  };

  const closePairing = () => {
    if (pairingBusy) return;
    setPairingVisible(false);
    setPairingCode('');
  };

  const confirmPairing = async () => {
    if (pairingBusy) return;
    setPairingBusy(true);
    try {
      await bindOwnerTestDevice(pairingCode);
      setPairingVisible(false);
      setPairingCode('');
      showDialog('Телефон привязан', 'Теперь владелец может отправить адресный тестовый push через бота.', [{label: 'Готово', primary: true, onPress: () => undefined}]);
    } catch {
      showDialog('Не удалось привязать', 'Проверьте код, разрешение уведомлений и подключение к сети. Код действует 10 минут.', [{label: 'Понятно', primary: true, onPress: () => undefined}]);
    } finally {
      setPairingBusy(false);
    }
  };

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
      openNotificationPreferences();
      return;
    }
    if (notificationPermission === 'notDetermined') {
      // Keep the actual system prompt native and immediate; no app-owned
      // pre-prompt is shown before it.
      requestNotificationPermissionOnce().then(status => {
        setNotificationPermission(status);
        if (status !== 'granted' && status !== 'limited') showNotificationPermissionDialog(status);
      }).catch(() => showNotificationPermissionDialog('unavailable'));
      return;
    }
    showNotificationPermissionDialog(notificationPermission);
  };

  const continueManually = () => {
    setDialog(null);
    onContinueManually?.();
  };

  const openLocationSettings = async () => {
    if (!onOpenLocationSettings) return;
    try {
      await onOpenLocationSettings();
    } catch {
      showDialog('Не удалось открыть настройки', 'Откройте настройки OnMap вручную. Вы также можете продолжить без GPS.', [
        {label: 'Поставить точку вручную', primary: true, onPress: continueManually},
      ]);
    }
  };

  const showManualLocationDialog = (message: string, retry: boolean) => {
    const actions: MapControlsDialogAction[] = [];
    if (retry && onRetryLocation) {
      actions.push({label: 'Повторить поиск', primary: true, onPress: async () => {
        try {
          const found = await onRetryLocation();
          if (!found) showManualLocationDialog('Не удалось получить свежую позицию. Проверьте разрешение и включены ли службы геолокации или выберите место вручную.', true);
        } catch {
          showManualLocationDialog('Не удалось получить свежую позицию. Проверьте разрешение и включены ли службы геолокации или выберите место вручную.', true);
        }
      }});
    }
    actions.push({label: 'Поставить точку вручную', primary: actions.length === 0, onPress: continueManually});
    if (onOpenLocationSettings && retry) {
      actions.push({label: 'Настройки', onPress: openLocationSettings});
    }
    showDialog('Моё местоположение недоступно', message, actions);
  };

  const handleLocationPress = () => {
    if (locationAvailable) {
      onLocate();
      return;
    }
    if (locationPermission === 'notDetermined' || locationPermission === 'denied') {
      const canRetry = locationPermission === 'denied';
      const actions: MapControlsDialogAction[] = [];
      if (canRetry) {
        actions.push({label: 'Повторить запрос', primary: true, onPress: async () => {
          const granted = await (onRequestLocation?.() ?? requestLocationPermission()).catch(() => false);
          if (!granted) showDialog('Геолокация всё ещё выключена', 'Разрешение не получено. Измените его в настройках устройства или выберите точку события вручную.', [
            ...(onOpenLocationSettings ? [{label: 'Настройки', primary: true, onPress: openLocationSettings}] : []),
            {label: 'Поставить точку вручную', onPress: continueManually},
          ]);
        }});
        if (onOpenLocationSettings) {
          actions.push({label: 'Настройки', onPress: openLocationSettings});
        }
      } else {
        actions.push({label: 'Поставить точку вручную', primary: true, onPress: continueManually});
        // On the first tap request OS permission immediately without an
        // app-owned explanation screen.
        (onRequestLocation?.() ?? requestLocationPermission()).then(granted => {
          if (!granted) showDialog('Геолокация не разрешена', 'Вы можете разрешить доступ в настройках устройства или выбрать точку события вручную.', [
            ...(onOpenLocationSettings ? [{label: 'Настройки', primary: true, onPress: openLocationSettings}] : []),
            {label: 'Поставить точку вручную', onPress: continueManually},
          ]);
        }).catch(() => showManualLocationDialog('Не удалось запросить геопозицию. Выберите точку вручную или проверьте настройки устройства.', false));
        return;
      }
      actions.push({label: 'Поставить точку вручную', onPress: continueManually});
      showDialog('Геолокация не разрешена', 'Можно повторить допустимый запрос или выбрать место события вручную.', actions);
      return;
    }
    if (locationPermission === 'blocked') {
      showDialog('Геолокация выключена', 'ОС больше не показывает системный запрос. Разрешите доступ в настройках или продолжите без GPS.', [
        ...(onOpenLocationSettings ? [{label: 'Настройки', primary: true, onPress: openLocationSettings}] : []),
        {label: 'Поставить точку вручную', onPress: continueManually},
      ]);
      return;
    }
    if (locationPermission === 'unavailable') {
      showManualLocationDialog('Служба геолокации недоступна. Проверьте системные настройки или выберите место вручную.', true);
      return;
    }
    if (locationPermission === 'granted' && locationUnavailable) {
      showManualLocationDialog(locationMessage ?? 'Не удалось получить свежую позицию. Проверьте, включены ли службы геолокации, или выберите точку вручную.', true);
      return;
    }
    showManualLocationDialog(locationMessage ?? 'Определяем ваше местоположение. Можно выбрать точку события вручную.', false);
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
        onPress={handleLocationPress}
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
      <Modal
        visible={pairingVisible}
        transparent
        animationType="fade"
        onRequestClose={closePairing}>
        <View style={styles.pairingBackdrop}>
          <View style={styles.pairingCard}>
            <Text style={styles.pairingTitle}>Тестовый телефон</Text>
            <Text style={styles.pairingHint}>Введите одноразовый код из личного чата владельца OnMap. Обычные уведомления работают без привязки.</Text>
            <TextInput
              accessibilityLabel="Одноразовый код тестового устройства"
              value={pairingCode}
              onChangeText={setPairingCode}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={14}
              placeholder="ABCD-EF12-3456"
              style={styles.pairingInput}
            />
            <View style={styles.pairingActions}>
              <Pressable accessibilityRole="button" onPress={closePairing} style={styles.pairingSecondary}>
                <Text style={styles.pairingSecondaryText}>Отмена</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={confirmPairing} disabled={pairingBusy} style={styles.pairingPrimary}>
                <Text style={styles.pairingPrimaryText}>{pairingBusy ? 'Проверяем…' : 'Привязать'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <MapControlsDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        actions={(dialog?.actions ?? []).map(action => ({
          ...action,
          onPress: async () => {
            setDialog(null);
            await action.onPress();
          },
        }))}
        onRequestClose={() => setDialog(null)}
      />
    </View>
  );
};
