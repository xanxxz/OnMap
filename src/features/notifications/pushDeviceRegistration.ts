import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {httpRequest} from '../../shared/api/httpClient';
import {env} from '../../shared/config/env';
import {checkNotificationPermission, type NotificationPermissionState} from './notificationPermission';
import {pushNative} from './pushNative';

const INSTALLATION_KEY = 'onmap:push-installation-id:v1';
let installationPromise: Promise<string> | null = null;

// This UUID is an idempotency handle, not an authentication credential.
const newInstallationId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, marker => {
  const nibble = Math.floor(Math.random() * 16);
  return (marker === 'x' ? nibble : (nibble % 4) + 8).toString(16);
});

export const getPushInstallationId = (): Promise<string> => {
  if (!installationPromise) {
    installationPromise = (async () => {
      const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
      if (existing) return existing;
      const created = newInstallationId();
      await AsyncStorage.setItem(INSTALLATION_KEY, created);
      return created;
    })().catch(error => { installationPromise = null; throw error; });
  }
  return installationPromise;
};

export const canRegisterPush = (permission: NotificationPermissionState): boolean =>
  permission === 'granted' || permission === 'limited';

export const registerPushDevice = async (cityId: string, token: string): Promise<boolean> => {
  const permission = await checkNotificationPermission();
  if (!canRegisterPush(permission) || !pushNative.provider || !token) return false;
  await httpRequest('/push/devices', { method: 'POST', body: JSON.stringify({
    installationId: await getPushInstallationId(),
    cityId,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    provider: pushNative.provider,
    token,
  }) });
  return true;
};

export const revokePushDevice = async (): Promise<void> => {
  if (!installationPromise && !(await AsyncStorage.getItem(INSTALLATION_KEY))) return;
  const id = await getPushInstallationId();
  await httpRequest(`/push/devices/${id}`, { method: 'DELETE' });
};

export const revokePushDeviceBeforeIdentityReset = async (oldToken: string): Promise<void> => {
  const id = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (!id || !env.apiBaseUrl) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    await fetch(`${env.apiBaseUrl}/push/devices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {Authorization: `Bearer ${oldToken}`},
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};
