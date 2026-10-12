import AsyncStorage from '@react-native-async-storage/async-storage';
import {httpRequest} from '../../shared/api/httpClient';
import {checkNotificationPermission} from './notificationPermission';
import {pushNative} from './pushNative';
import {getPushInstallationId, registerPushDevice, revokePushDevice} from './pushDeviceRegistration';

jest.mock('../../shared/api/httpClient', () => ({httpRequest: jest.fn()}));
jest.mock('./notificationPermission', () => ({checkNotificationPermission: jest.fn()}));
jest.mock('./pushNative', () => ({pushNative: {provider: 'APNS'}}));

describe('push device registration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (checkNotificationPermission as jest.Mock).mockResolvedValue('granted');
  });

  it('never transmits a token after denial', async () => {
    (checkNotificationPermission as jest.Mock).mockResolvedValue('denied');
    expect(await registerPushDevice('balakovo', 'a'.repeat(64))).toBe(false);
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('registers an allowed token and reuses one installation handle on refresh', async () => {
    const first = await getPushInstallationId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(await registerPushDevice('balakovo', 'a'.repeat(64))).toBe(true);
    expect(await registerPushDevice('balakovo', 'b'.repeat(64))).toBe(true);
    const calls = (httpRequest as jest.Mock).mock.calls;
    expect(JSON.parse(calls[0][1].body).installationId).toBe(first);
    expect(JSON.parse(calls[1][1].body).installationId).toBe(first);
    expect(JSON.parse(calls[1][1].body).token).toBe('b'.repeat(64));
    await revokePushDevice();
    expect(httpRequest).toHaveBeenLastCalledWith(`/push/devices/${first}`, {method: 'DELETE'});
  });

  it('does not register without a configured native token transport', async () => {
    const previous = pushNative.provider;
    Object.assign(pushNative, {provider: null});
    expect(await registerPushDevice('balakovo', 'a'.repeat(64))).toBe(false);
    expect(httpRequest).not.toHaveBeenCalled();
    Object.assign(pushNative, {provider: previous});
  });
});
