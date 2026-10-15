import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {httpRequest} from '../../shared/api/httpClient';
import {env} from '../../shared/config/env';
import {checkNotificationPermission, type NotificationPermissionState} from './notificationPermission';
import {pushNative} from './pushNative';
import {getNotificationPreferences} from './notificationPreferences';

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
  try {
    const preferences = await getNotificationPreferences();
    await httpRequest('/push/devices', { method: 'POST', body: JSON.stringify({
      installationId: await getPushInstallationId(),
      cityId,
      platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
      provider: pushNative.provider,
      token,
      ...preferences,
    }) }, {
      onIdentityReady: () => console.info('[push] anonymous_identity=ready'),
      onIdentityError: () => console.warn('[push] anonymous_identity=failed'),
      onRequestStarted: () => console.info('[push] device_registration_request=started'),
    });
    console.info('[push] device_registration_request=succeeded');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
      console.warn(`[push] device_registration_request=failed http_status=${error.status}`);
    } else {
      console.warn('[push] device_registration_request=failed network_or_identity_error');
    }
    throw error;
  }
  return true;
};

export const revokePushDevice = async (): Promise<void> => {
  if (!installationPromise && !(await AsyncStorage.getItem(INSTALLATION_KEY))) return;
  const id = await getPushInstallationId();
  await httpRequest(`/push/devices/${id}`, { method: 'DELETE' });
};

export const bindOwnerTestDevice = async (code: string): Promise<void> => {
  const compact = code.replace(/-/gu, '').trim().toUpperCase();
  if (!/^[A-F0-9]{12}$/u.test(compact))
    throw new Error('INVALID_PAIRING_CODE');
  await httpRequest('/push/devices/owner-test-pairing', {
    method: 'POST',
    body: JSON.stringify({
      installationId: await getPushInstallationId(),
      code: compact,
    }),
  });
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
