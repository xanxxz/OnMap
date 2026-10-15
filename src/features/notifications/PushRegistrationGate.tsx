import {useEffect} from 'react';
import {AppState} from 'react-native';
import {useSelectedCityStore} from '../../shared/config/cities/useSelectedCityStore';
import {setBeforeAnonymousIdentityReset, subscribeAnonymousIdentityRefresh} from '../../shared/device/installationIdentity';
import {checkNotificationPermission} from './notificationPermission';
import {pushNative} from './pushNative';
import {registerPushDevice, revokePushDevice, revokePushDeviceBeforeIdentityReset} from './pushDeviceRegistration';
import {ApiError} from '../../shared/api/httpClient';
import {subscribeNotificationPreferences} from './notificationPreferences';

const RETRY_DELAYS_MS = [1_000, 5_000, 15_000];

export const PushRegistrationGate = () => {
  const cityId = useSelectedCityStore(state => state.selectedCityId);
  useEffect(() => {
    setBeforeAnonymousIdentityReset(revokePushDeviceBeforeIdentityReset);
    return () => setBeforeAnonymousIdentityReset(null);
  }, []);
  useEffect(() => {
    let active = true;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let syncInFlight: Promise<void> | null = null;
    let registerInFlight: Promise<void> | null = null;
    const scheduleRetry = () => {
      if (!active || retryCount >= RETRY_DELAYS_MS.length) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        sync().catch(() => undefined);
      }, RETRY_DELAYS_MS[retryCount++]);
    };
    const register = (token: string) => {
      if (registerInFlight) return registerInFlight;
      registerInFlight = registerPushDevice(cityId, token)
        .then(() => { retryCount = 0; })
        .catch(error => {
          const status = error instanceof ApiError ? ` (HTTP ${error.status})` : '';
          console.warn(`[push] device registration failed${status}`);
          scheduleRetry();
        })
        .finally(() => { registerInFlight = null; });
      return registerInFlight;
    };
    const sync = async () => {
      if (!active || syncInFlight) return syncInFlight;
      syncInFlight = (async () => {
        let stage = 'permission_check';
        try {
          const permission = await checkNotificationPermission();
          if (!active) return;
          console.info(`[push] notification_permission=${permission}`);
          console.info(`[push] native_module=${pushNative.available ? 'available' : 'unavailable'}`);
          if (!pushNative.available) return;
          if (permission !== 'granted' && permission !== 'limited') {
            if (permission === 'denied') {
              await pushNative.disable().catch(() => undefined);
              await revokePushDevice().catch(() => undefined);
            }
            return;
          }
          stage = 'native_token_request';
          console.info('[push] native_push_registration=requested');
          const token = await pushNative.getToken();
          if (!active) return;
          if (token) {
            console.info('[push] native_push_token=available');
            await register(token);
          } else {
            console.warn('[push] native_push_token=not_available_yet');
            scheduleRetry();
          }
        } catch {
          console.warn(`[push] ${stage}=failed`);
          scheduleRetry();
        }
      })().finally(() => { syncInFlight = null; });
      return syncInFlight;
    };
    sync().catch(() => undefined);
    const offToken = pushNative.onToken(token => {
      console.info('[push] native_push_callback=success');
      console.info('[push] native_push_token=available');
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      register(token).catch(() => undefined);
    });
    const offRegistrationError = pushNative.onRegistrationError(code => {
      console.warn(`[push] native_push_callback=failed error_code=${code}`);
      scheduleRetry();
    });
    console.info('[push] native_event_subscribers=attached');
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') {
        retryCount = 0;
        sync().catch(() => undefined);
      }
    });
    const offRefresh = subscribeAnonymousIdentityRefresh(() => {
      if (active) sync().catch(() => undefined);
    });
    const offPreferences = subscribeNotificationPreferences(() => {
      // A toggle made while token registration is in flight must be posted
      // after that request, otherwise its older payload can win on the server.
      Promise.all([syncInFlight, registerInFlight]).then(() => {
        if (active) sync().catch(() => undefined);
      }).catch(() => undefined);
    });
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      offToken();
      offRegistrationError();
      offRefresh();
      offPreferences();
      appState.remove();
    };
  }, [cityId]);
  return null;
};
