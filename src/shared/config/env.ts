import Config from 'react-native-config';

import {
  Platform,
} from 'react-native';

const normalizeUrl = (
  value: string | undefined,
): string => {
  return (
    value
      ?.trim()
      .replace(/\/+$/, '') ?? ''
  );
};

const resolvePlatformUrl = (
  sharedValue:
    | string
    | undefined,
  iosValue:
    | string
    | undefined,
  androidValue:
    | string
    | undefined,
): string => {
  const sharedUrl =
    normalizeUrl(
      sharedValue,
    );

  if (sharedUrl.length > 0) {
    return sharedUrl;
  }

  const platformValue =
    Platform.OS === 'ios'
      ? iosValue
      : Platform.OS ===
          'android'
        ? androidValue
        : undefined;

  return normalizeUrl(
    platformValue,
  );
};

const mapTilerApiKey =
  Config.MAPTILER_API_KEY?.trim() ??
  '';

const apiBaseUrl =
  resolvePlatformUrl(
    Config.API_BASE_URL,

    Config.IOS_API_BASE_URL,

    Config.ANDROID_API_BASE_URL,
  );

const socketUrl =
  resolvePlatformUrl(
    Config.SOCKET_URL,

    Config.IOS_SOCKET_URL,

    Config.ANDROID_SOCKET_URL,
  );

const realtimeRequested =
  Config.REALTIME_ENABLED
    ?.trim()
    .toLowerCase() === 'true';

export interface MapStyleProvider {
  id:
    | 'maptiler'
    | 'openfreemap';

  styleUrl: string;
}

export interface MapStyleConfiguration {
  primary:
    | MapStyleProvider
    | null;

  fallback: MapStyleProvider;

  initial: MapStyleProvider;
}

const OPENFREEMAP_STYLE: MapStyleProvider = {
  id: 'openfreemap',

  styleUrl:
    'https://tiles.openfreemap.org/styles/liberty',
};

export const resolveMapStyleConfiguration = (
  apiKey: string | undefined,
): MapStyleConfiguration => {
  const normalizedApiKey =
    apiKey?.trim() ?? '';

  const primary:
    | MapStyleProvider
    | null =
    normalizedApiKey.length > 0
      ? {
          id: 'maptiler',

          styleUrl: `https://api.maptiler.com/maps/streets-v4/style.json?key=${normalizedApiKey}`,
        }
      : null;

  return {
    primary,

    fallback:
      OPENFREEMAP_STYLE,

    initial:
      primary ??
      OPENFREEMAP_STYLE,
  };
};

const mapStyleConfiguration =
  resolveMapStyleConfiguration(
    mapTilerApiKey,
  );

export const env = {
  mapTilerApiKey,

  apiBaseUrl,

  socketUrl,

  hasApiBaseUrl:
    apiBaseUrl.length > 0,

  hasMapTilerApiKey:
    mapTilerApiKey.length > 0,

  realtimeEnabled:
    realtimeRequested &&
    socketUrl.length > 0,

  mapStyles:
    mapStyleConfiguration,
} as const;
