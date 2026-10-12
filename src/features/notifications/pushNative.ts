import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

type OnMapPushModule = {
  getToken(): Promise<string | null>;
  consumeInitialUrl(): Promise<string | null>;
  disable(): Promise<void>;
};

const module = NativeModules.OnMapPush as OnMapPushModule | undefined;

const emitter = module ? new NativeEventEmitter(NativeModules.OnMapPush) : null;

export const pushNative = {
  provider: module ? (Platform.OS === 'ios' ? 'APNS' as const : 'FCM' as const) : null,
  getToken: () => module?.getToken() ?? Promise.resolve(null),
  disable: () => module?.disable() ?? Promise.resolve(),
  consumeInitialUrl: () => module?.consumeInitialUrl() ?? Promise.resolve(null),
  onToken(listener: (token: string) => void) {
    const subscription = emitter?.addListener('OnMapPushToken', payload => {
      if (typeof payload?.token === 'string') listener(payload.token);
    });
    return () => subscription?.remove();
  },
  onOpen(listener: (url: string) => void) {
    const subscription = emitter?.addListener('OnMapPushOpen', payload => {
      if (typeof payload?.url === 'string') {
        module?.consumeInitialUrl().catch(() => undefined);
        listener(payload.url);
      }
    });
    return () => subscription?.remove();
  },
};
