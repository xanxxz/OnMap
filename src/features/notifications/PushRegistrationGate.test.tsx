import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {useSelectedCityStore} from '../../shared/config/cities/useSelectedCityStore';
import {checkNotificationPermission} from './notificationPermission';
import {pushNative} from './pushNative';
import {registerPushDevice} from './pushDeviceRegistration';
import {PushRegistrationGate} from './PushRegistrationGate';
import {setNotificationPreferences} from './notificationPreferences';

jest.mock('../../shared/config/cities/useSelectedCityStore', () => ({
  useSelectedCityStore: jest.fn(),
}));
jest.mock('../../shared/device/installationIdentity', () => ({
  setBeforeAnonymousIdentityReset: jest.fn(),
  subscribeAnonymousIdentityRefresh: jest.fn(() => jest.fn()),
}));
jest.mock('./notificationPermission', () => ({checkNotificationPermission: jest.fn()}));
jest.mock('./pushNative', () => ({
  pushNative: {
    available: true,
    provider: 'APNS',
    getToken: jest.fn(),
    disable: jest.fn(),
    onToken: jest.fn(() => jest.fn()),
    onRegistrationError: jest.fn(() => jest.fn()),
  },
}));
jest.mock('./pushDeviceRegistration', () => ({
  registerPushDevice: jest.fn(),
  revokePushDevice: jest.fn(),
  revokePushDeviceBeforeIdentityReset: jest.fn(),
}));

describe('PushRegistrationGate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.mocked(useSelectedCityStore).mockReturnValue('balakovo' as never);
    jest.mocked(checkNotificationPermission).mockResolvedValue('granted');
    jest.mocked(pushNative.getToken).mockResolvedValue('apns-device-token');
    jest.mocked(registerPushDevice).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries a temporarily unavailable APNs token and registers it once available', async () => {
    jest.mocked(pushNative.getToken)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('apns-device-token');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<PushRegistrationGate />);
      await Promise.resolve();
    });
    expect(registerPushDevice).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[push] native_push_token=not_available_yet');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(registerPushDevice).toHaveBeenCalledTimes(1);
    expect(registerPushDevice).toHaveBeenCalledWith('balakovo', 'apns-device-token');

    await act(async () => renderer!.unmount());
    warn.mockRestore();
  });

  it('logs a safe native request failure and retries without blocking launch', async () => {
    jest.mocked(pushNative.getToken)
      .mockRejectedValueOnce(new Error('sensitive native error'))
      .mockResolvedValueOnce('apns-device-token');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<PushRegistrationGate />);
      await Promise.resolve();
    });

    expect(warn).toHaveBeenCalledWith('[push] native_token_request=failed');
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('sensitive native error'));
    expect(registerPushDevice).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(registerPushDevice).toHaveBeenCalledTimes(1);

    await act(async () => renderer!.unmount());
    warn.mockRestore();
  });

  it('posts changed preferences after an in-flight registration completes', async () => {
    let finishFirst!: () => void;
    jest.mocked(registerPushDevice)
      .mockImplementationOnce(() => new Promise(resolve => {
        finishFirst = () => resolve(true);
      }))
      .mockResolvedValue(true);
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<PushRegistrationGate />);
      await Promise.resolve();
    });
    expect(registerPushDevice).toHaveBeenCalledTimes(1);
    await act(async () => {
      await setNotificationPreferences({roadPushEnabled: true, newsPushEnabled: false});
      finishFirst();
      await Promise.resolve();
    });
    expect(registerPushDevice).toHaveBeenCalledTimes(2);
    await act(async () => renderer!.unmount());
  });
});
