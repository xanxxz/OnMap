import Config from 'react-native-config';

const normalizeUrl = (
  value: string | undefined,
): string => {
  return (
    value
      ?.trim()
      .replace(/\/+$/, '') ?? ''
  );
};

const mapTilerApiKey =
  Config.MAPTILER_API_KEY?.trim() ??
  '';

const apiBaseUrl =
  normalizeUrl(
    Config.API_BASE_URL,
  );

const socketUrl =
  normalizeUrl(
    Config.SOCKET_URL,
  );

const realtimeRequested =
  Config.REALTIME_ENABLED
    ?.trim()
    .toLowerCase() === 'true';

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

  mapStyleUrl:
    mapTilerApiKey.length > 0
      ? `https://api.maptiler.com/maps/streets-v4/style.json?key=${mapTilerApiKey}`
      : 'https://tiles.openfreemap.org/styles/liberty',
} as const;