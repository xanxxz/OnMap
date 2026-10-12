import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  checkNotifications,
  openSettings,
  requestNotifications,
  RESULTS,
} from 'react-native-permissions';

export type NotificationPermissionState =
  | 'granted'
  | 'limited'
  | 'notDetermined'
  | 'denied'
  | 'unavailable';

const REQUESTED_KEY = 'onmap:notifications-permission-requested:v1';
let requestInFlight: Promise<NotificationPermissionState> | null = null;

const hasRequested = async () =>
  (await AsyncStorage.getItem(REQUESTED_KEY).catch(() => null)) === 'true';

const normalize = (
  status: string,
  requested: boolean,
): NotificationPermissionState => {
  if (status === RESULTS.GRANTED) return 'granted';
  if (status === RESULTS.LIMITED) return 'limited';
  if (status === RESULTS.UNAVAILABLE) return 'unavailable';
  if (status === RESULTS.BLOCKED) return 'denied';
  return requested ? 'denied' : 'notDetermined';
};

export const checkNotificationPermission = async (): Promise<NotificationPermissionState> => {
  try {
    const [requested, response] = await Promise.all([
      hasRequested(),
      checkNotifications(),
    ]);
    return normalize(response.status, requested);
  } catch {
    return 'unavailable';
  }
};

export const requestNotificationPermissionOnce = (): Promise<NotificationPermissionState> => {
  if (requestInFlight) return requestInFlight;
  requestInFlight = (async () => {
    const current = await checkNotificationPermission();
    if (current !== 'notDetermined') return current;
    // Persist before opening the OS dialog so a restart cannot prompt again.
    await AsyncStorage.setItem(REQUESTED_KEY, 'true').catch(() => undefined);
    try {
      const response = await requestNotifications(['alert', 'sound', 'badge']);
      return normalize(response.status, true);
    } catch {
      return 'unavailable';
    }
  })().finally(() => { requestInFlight = null; });
  return requestInFlight;
};

export const openNotificationSettings = () => openSettings('notifications');
