declare module 'react-native-config' {
  export interface NativeConfig {
    MAPTILER_API_KEY?: string;

    API_BASE_URL?: string;

    SOCKET_URL?: string;

    IOS_API_BASE_URL?: string;

    IOS_SOCKET_URL?: string;

    ANDROID_API_BASE_URL?: string;

    ANDROID_SOCKET_URL?: string;

    REALTIME_ENABLED?: string;
  }

  const Config: NativeConfig;

  export default Config;
}
