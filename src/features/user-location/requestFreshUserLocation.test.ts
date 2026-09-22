import {
  GOOD_LOCATION_ACCURACY_METERS,
  requestFreshUserLocation,
} from './requestFreshUserLocation';

jest.mock('@maplibre/maplibre-react-native', () => ({
  LocationManager: {},
}));

interface Position {
  coords: {longitude: number; latitude: number; accuracy: number};
  timestamp: number;
}

const createManager = (permission = true) => {
  let listener: ((position: Position) => void) | null = null;

  return {
    requestPermissions: jest.fn().mockResolvedValue(permission),
    addListener: jest.fn((next: (position: Position) => void) => {
      listener = next;
    }),
    removeListener: jest.fn(),
    emit: (position: Position) => listener?.(position),
  };
};

describe('requestFreshUserLocation', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a fresh accurate fix and removes its listener', async () => {
    const now = 1_000_000;
    const manager = createManager();
    const request = requestFreshUserLocation(
      'granted',
      manager,
      () => now,
      1_000,
    );

    manager.emit({
      coords: {
        longitude: 47.8,
        latitude: 52.02,
        accuracy: GOOD_LOCATION_ACCURACY_METERS,
      },
      timestamp: now,
    });

    await expect(request).resolves.toEqual({
      status: 'READY',
      coordinate: [47.8, 52.02],
      accuracy: GOOD_LOCATION_ACCURACY_METERS,
    });
    expect(manager.removeListener).toHaveBeenCalledTimes(1);
  });

  it('waits for a delayed accurate fix instead of accepting a rough one', async () => {
    const now = 1_000_000;
    const manager = createManager();
    const request = requestFreshUserLocation(
      'granted',
      manager,
      () => now,
      1_000,
    );

    manager.emit({
      coords: {longitude: 47.79, latitude: 52.01, accuracy: 130},
      timestamp: now,
    });
    manager.emit({
      coords: {longitude: 47.8, latitude: 52.02, accuracy: 18},
      timestamp: now,
    });

    await expect(request).resolves.toMatchObject({
      status: 'READY',
      coordinate: [47.8, 52.02],
      accuracy: 18,
    });
  });

  it('returns the best approximate fix after the bounded wait', async () => {
    jest.useFakeTimers();
    const now = 1_000_000;
    const manager = createManager();
    const request = requestFreshUserLocation(
      'granted',
      manager,
      () => now,
      500,
    );

    manager.emit({
      coords: {longitude: 47.8, latitude: 52.02, accuracy: 85},
      timestamp: now,
    });
    jest.advanceTimersByTime(500);

    await expect(request).resolves.toEqual({
      status: 'APPROXIMATE',
      coordinate: [47.8, 52.02],
      accuracy: 85,
    });
  });

  it('rejects a stale cached coordinate and falls back to unavailable', async () => {
    jest.useFakeTimers();
    const now = 1_000_000;
    const manager = createManager();
    const request = requestFreshUserLocation(
      'granted',
      manager,
      () => now,
      500,
    );

    manager.emit({
      coords: {longitude: 47.8, latitude: 52.02, accuracy: 10},
      timestamp: now - 60_000,
    });
    jest.advanceTimersByTime(500);

    await expect(request).resolves.toEqual({status: 'UNAVAILABLE'});
  });

  it('returns a controlled permission result when access is denied', async () => {
    const manager = createManager(false);

    await expect(
      requestFreshUserLocation('denied', manager, Date.now, 100),
    ).resolves.toEqual({status: 'PERMISSION_DENIED'});
    expect(manager.addListener).not.toHaveBeenCalled();
  });
});
