import {
  LocationPosition,
  isLocationStale,
  qualifyLocation,
  mergeVisibleLocation,
  shouldAcceptLocationUpdate,
} from './locationQuality';

const position = (
  latitude: number,
  longitude: number,
  accuracy: number,
  timestamp = 100_000,
): LocationPosition => ({
  coords: {latitude, longitude, accuracy},
  timestamp,
});

describe('user location quality', () => {
  it('rejects stale, implausibly inaccurate, and invalid coordinates', () => {
    expect(qualifyLocation(position(52, 47, 10, 80_000), 100_000)).toBeNull();
    expect(qualifyLocation(position(52, 47, 251), 100_000)).toBeNull();
    expect(qualifyLocation(position(92, 47, 10), 100_000)).toBeNull();
  });

  it('rejects a cached fix that is too far in the future', () => {
    expect(qualifyLocation(position(52, 47, 10, 106_000), 100_000)).toBeNull();
  });

  it('accepts fresh usable coordinates and preserves their quality metadata', () => {
    expect(qualifyLocation(position(52, 47, 18), 100_000)).toEqual({
      coordinate: [47, 52],
      accuracy: 18,
      timestamp: 100_000,
    });
  });

  it('normalizes MapLibre iOS Unix seconds without changing Android milliseconds', () => {
    const now = 1_780_000_000_000;
    expect(qualifyLocation(position(52, 47, 18, now / 1000), now)).toEqual({
      coordinate: [47, 52],
      accuracy: 18,
      timestamp: now,
    });
    expect(qualifyLocation(position(52, 47, 18, now), now)?.timestamp).toBe(now);
  });

  it('marks a last known position stale after the live signal is lost', () => {
    expect(isLocationStale(100_000, 189_999)).toBe(false);
    expect(isLocationStale(100_000, 190_001)).toBe(true);
  });

  it('suppresses small GPS wander while stationary', () => {
    const previous = qualifyLocation(position(52, 47, 8), 100_000);
    const noisy = qualifyLocation(position(52.00003, 47, 8, 101_000), 101_000);

    expect(previous).not.toBeNull();
    expect(noisy).not.toBeNull();
    expect(shouldAcceptLocationUpdate(previous, noisy!)).toBe(false);
    expect(mergeVisibleLocation(previous, noisy!)).toEqual({
      ...noisy,
      coordinate: previous!.coordinate,
    });
  });

  it('accepts meaningful movement and a materially improved fix', () => {
    const previous = qualifyLocation(position(52, 47, 40), 100_000);
    const moved = qualifyLocation(position(52.0005, 47, 35, 101_000), 101_000);
    const refined = qualifyLocation(position(52.00002, 47, 12, 102_000), 102_000);

    expect(shouldAcceptLocationUpdate(previous, moved!)).toBe(true);
    expect(shouldAcceptLocationUpdate(previous, refined!)).toBe(true);
  });

  it('shows a deliberate short walk with an accurate fix', () => {
    const previous = qualifyLocation(position(52, 47, 10), 100_000);
    const walked = qualifyLocation(position(52.00006, 47, 10, 102_000), 102_000);
    expect(shouldAcceptLocationUpdate(previous, walked!)).toBe(true);
  });
});
