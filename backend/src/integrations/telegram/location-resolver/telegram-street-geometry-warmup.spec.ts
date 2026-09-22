import type { TelegramStreetGeometryProvider } from './telegram-street-geometry.provider';
import { warmupTelegramStreetGeometry } from './telegram-street-geometry-warmup';

describe('warmupTelegramStreetGeometry', () => {
  it('selects only configured STREET locations and resolves them through provider', async () => {
    const resolve: jest.MockedFunction<
      TelegramStreetGeometryProvider['resolve']
    > = jest.fn().mockResolvedValue({
      status: 'RESOLVED',
      provider: 'OSM',
      confidence: 0.95,
      geometry: {
        type: 'LineString',
        coordinates: [
          [47.8, 52.01],
          [47.81, 52.02],
        ],
      },
    });

    const result = await warmupTelegramStreetGeometry('balakovo', { resolve });

    expect(result.streets).toBeGreaterThan(0);
    expect(result.resolved).toBe(result.streets);
    expect(resolve).toHaveBeenCalledTimes(result.streets);
    expect(
      resolve.mock.calls.every(
        ([input]) =>
          typeof input.canonicalLocation === 'string' &&
          input.cityId === 'balakovo',
      ),
    ).toBe(true);
  });

  it('continues after an unavailable street and keeps accurate stats', async () => {
    const resolve: jest.MockedFunction<
      TelegramStreetGeometryProvider['resolve']
    > = jest
      .fn()
      .mockResolvedValueOnce({ status: 'UNAVAILABLE', provider: 'OSM' })
      .mockResolvedValue({ status: 'NOT_FOUND', provider: 'OSM' });

    const result = await warmupTelegramStreetGeometry('balakovo', { resolve });

    expect(result.streets).toBeGreaterThan(1);
    expect(resolve).toHaveBeenCalledTimes(result.streets);
    expect(result).toMatchObject({
      resolved: 0,
      ambiguous: 0,
      notFound: result.streets - 1,
      unavailable: 1,
    });
  });
});
