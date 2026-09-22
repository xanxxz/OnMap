import { BALAKOVO_CITY_CONFIG } from './balakovo/balakovo.config';
import {
  CitiesRegistry,
  getCityConfig,
  isCoordinateInsideCityCoverage,
} from './city.registry';

describe('city registry', () => {
  it('returns the Balakovo configuration and rejects an unknown city', () => {
    expect(getCityConfig('balakovo')).toBe(BALAKOVO_CITY_CONFIG);
    expect(getCityConfig('unknown')).toBeUndefined();
  });

  it('keeps a synthetic second-city fixture isolated in the registry', () => {
    const secondCity = {
      ...BALAKOVO_CITY_CONFIG,
      id: 'test-city',
      name: 'Тестовый город',
      locations: [],
    };
    const registry = new CitiesRegistry([BALAKOVO_CITY_CONFIG, secondCity]);

    expect(registry.get('test-city')).toBe(secondCity);
    expect(registry.get('balakovo')).toBe(BALAKOVO_CITY_CONFIG);
  });

  it('accepts coordinates in the Balakovo coverage and rejects distant ones', () => {
    expect(
      isCoordinateInsideCityCoverage(BALAKOVO_CITY_CONFIG, 52.0278, 47.8007),
    ).toBe(true);
    expect(isCoordinateInsideCityCoverage(BALAKOVO_CITY_CONFIG, 55, 40)).toBe(
      false,
    );
  });

  it.each([
    ['Натальино', 'natalyino'],
    ['Ивановка', 'ivanovka'],
    ['Подсосенки', 'podsosenki'],
    ['Быков Отрог', 'bykov-otrog'],
  ])('includes %s in the Balakovo coverage areas', (name, id) => {
    expect(BALAKOVO_CITY_CONFIG.nearbyAreas).toContainEqual(
      expect.objectContaining({ id, name, type: 'SETTLEMENT' }),
    );
  });

  it('keeps the coverage boundary aligned with the configured bounds', () => {
    const boundary = BALAKOVO_CITY_CONFIG.coverageBoundary;

    expect(boundary?.type).toBe('Polygon');
    expect(boundary?.coordinates).toEqual([
      [
        [47.5, 51.82],
        [48.2, 51.82],
        [48.2, 52.25],
        [47.5, 52.25],
        [47.5, 51.82],
      ],
    ]);
  });
});
