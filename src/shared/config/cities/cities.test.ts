import {
  ACTIVE_CITY,
  CitiesRegistry,
  cityBoundsToMapBounds,
  getAvailableCities,
  getCityConfig,
} from '.';

describe('mobile city registry', () => {
  it('keeps Balakovo active and returns it from the registry', () => {
    expect(ACTIVE_CITY.id).toBe('balakovo');
    expect(getCityConfig('balakovo')).toBe(ACTIVE_CITY);
    expect(getCityConfig('unknown')).toBeUndefined();
  });

  it('exposes the selectable city list from the registry', () => {
    expect(getAvailableCities()).toEqual([ACTIVE_CITY]);
  });

  it('keeps a synthetic second-city fixture isolated from Balakovo', () => {
    const secondCity = {
      ...ACTIVE_CITY,
      id: 'test-city',
      name: 'Тестовый город',
      center: [40, 55] as [number, number],
    };
    const registry = new CitiesRegistry([ACTIVE_CITY, secondCity]);

    expect(registry.get('test-city')).toBe(secondCity);
    expect(registry.get('balakovo')).toBe(ACTIVE_CITY);
    expect(registry.get('missing')).toBeUndefined();
  });

  it('provides map center, expanded bounds and coverage boundary', () => {
    expect(ACTIVE_CITY.center).toEqual([47.8007, 52.0278]);
    expect(cityBoundsToMapBounds(ACTIVE_CITY.coverageBounds)).toEqual([
      47.5, 51.82, 48.2, 52.25,
    ]);
    expect(ACTIVE_CITY.coverageBoundary?.type).toBe('Polygon');
  });

  it('registers nearby settlements under Balakovo', () => {
    expect(ACTIVE_CITY.nearbyAreas.map(({ name }) => name)).toEqual([
      'Натальино',
      'Ивановка',
      'Подсосенки',
      'Быков Отрог',
    ]);
  });
});
