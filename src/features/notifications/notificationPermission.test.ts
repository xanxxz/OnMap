import AsyncStorage from '@react-native-async-storage/async-storage';
import {checkNotifications, requestNotifications, RESULTS} from 'react-native-permissions';
import {checkNotificationPermission, requestNotificationPermissionOnce} from './notificationPermission';

const checkMock = jest.mocked(checkNotifications);
const requestMock = jest.mocked(requestNotifications);

describe('notification permission', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    checkMock.mockResolvedValue({status: RESULTS.DENIED, settings: {}});
    requestMock.mockResolvedValue({status: RESULTS.GRANTED, settings: {}});
  });

  it('requests once on first run and remembers the decision', async () => {
    await expect(checkNotificationPermission()).resolves.toBe('notDetermined');
    await expect(requestNotificationPermissionOnce()).resolves.toBe('granted');
    checkMock.mockResolvedValue({status: RESULTS.DENIED, settings: {}});
    await expect(requestNotificationPermissionOnce()).resolves.toBe('denied');
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('treats an existing grant and limited access as usable without a new dialog', async () => {
    checkMock.mockResolvedValue({status: RESULTS.GRANTED, settings: {}});
    await expect(requestNotificationPermissionOnce()).resolves.toBe('granted');
    checkMock.mockResolvedValue({status: RESULTS.LIMITED, settings: {}});
    await expect(checkNotificationPermission()).resolves.toBe('limited');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('does not block the app when the native request fails', async () => {
    requestMock.mockRejectedValue(new Error('native unavailable'));
    await expect(requestNotificationPermissionOnce()).resolves.toBe('unavailable');
    await expect(requestNotificationPermissionOnce()).resolves.toBe('denied');
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
