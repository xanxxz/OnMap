import {useEffect} from 'react';
import {AppState} from 'react-native';
import {useSelectedCityStore} from '../../shared/config/cities/useSelectedCityStore';
import {setBeforeAnonymousIdentityReset, subscribeAnonymousIdentityRefresh} from '../../shared/device/installationIdentity';
import {checkNotificationPermission} from './notificationPermission';
import {pushNative} from './pushNative';
import {registerPushDevice, revokePushDevice, revokePushDeviceBeforeIdentityReset} from './pushDeviceRegistration';

export const PushRegistrationGate = () => {
  const cityId = useSelectedCityStore(state => state.selectedCityId);
  useEffect(() => {
    setBeforeAnonymousIdentityReset(revokePushDeviceBeforeIdentityReset);
    return () => setBeforeAnonymousIdentityReset(null);
  }, []);
  useEffect(() => {
    let active = true;
    const sync = async () => {
      const permission = await checkNotificationPermission();
      if (!active) return;
      if (permission !== 'granted' && permission !== 'limited') {
        if (permission === 'denied') {
          await pushNative.disable().catch(() => undefined);
          await revokePushDevice().catch(() => undefined);
        }
        return;
      }
      const token = await pushNative.getToken();
      if (active && token) await registerPushDevice(cityId, token).catch(() => undefined);
    };
    sync().catch(() => undefined);
    const offToken = pushNative.onToken(token => {
      checkNotificationPermission().then(permission => {
        if (active && (permission === 'granted' || permission === 'limited')) {
          return registerPushDevice(cityId, token);
        }
      }).catch(() => undefined);
    });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') sync().catch(() => undefined);
    });
    const offRefresh = subscribeAnonymousIdentityRefresh(() => {
      if (active) sync().catch(() => undefined);
    });
    return () => { active = false; offToken(); offRefresh(); appState.remove(); };
  }, [cityId]);
  return null;
};
