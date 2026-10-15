import AsyncStorage from '@react-native-async-storage/async-storage';
import {getNotificationPreferences, setNotificationPreferences, subscribeNotificationPreferences} from './notificationPreferences';

describe('notification preferences', () => {
  beforeEach(() => {jest.clearAllMocks();});

  it('enables both categories by default after OS permission, but retains explicit opt-out', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    expect(await getNotificationPreferences()).toEqual({roadPushEnabled: true, newsPushEnabled: true});
    await setNotificationPreferences({roadPushEnabled: true, newsPushEnabled: false});
    expect(await getNotificationPreferences()).toEqual({roadPushEnabled: true, newsPushEnabled: false});
  });

  it('notifies registration gate after a change', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeNotificationPreferences(listener);
    await setNotificationPreferences({roadPushEnabled: false, newsPushEnabled: true});
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
