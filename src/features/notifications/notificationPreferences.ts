import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'onmap:notification-preferences:v1';

export type NotificationPreferences = {
  roadPushEnabled: boolean;
  newsPushEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  roadPushEnabled: true,
  newsPushEnabled: true,
};

let cache: NotificationPreferences | null = null;
const listeners = new Set<() => void>();

export const getNotificationPreferences = async (): Promise<NotificationPreferences> => {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const values = parsed as Partial<NotificationPreferences>;
      return {
        roadPushEnabled: values.roadPushEnabled === false ? false : true,
        newsPushEnabled: values.newsPushEnabled !== false,
      };
    }
  } catch { /* Invalid local state falls back to privacy-safe defaults. */ }
  return DEFAULT_NOTIFICATION_PREFERENCES;
};

export const setNotificationPreferences = async (next: NotificationPreferences): Promise<void> => {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  cache = next;
  listeners.forEach(listener => listener());
};

export const subscribeNotificationPreferences = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
