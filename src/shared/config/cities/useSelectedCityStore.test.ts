import { balakovoCity } from './balakovo';
import {
  DEFAULT_CITY_ID,
  resolveSelectedCity,
  useSelectedCityStore,
} from './useSelectedCityStore';

describe('selected city foundation', () => {
  afterEach(() => {
    useSelectedCityStore.setState({ selectedCityId: DEFAULT_CITY_ID });
  });

  it('defaults to Balakovo without exposing a city picker', () => {
    expect(useSelectedCityStore.getState().selectedCityId).toBe('balakovo');
    expect(resolveSelectedCity('balakovo')).toBe(balakovoCity);
  });

  it('updates selectedCityId through the existing city state', () => {
    useSelectedCityStore.getState().setSelectedCityId('test-city');

    expect(useSelectedCityStore.getState().selectedCityId).toBe('test-city');
  });

  it('falls back safely when persisted selection is not registered', () => {
    useSelectedCityStore.getState().setSelectedCityId('unknown-city');

    expect(
      resolveSelectedCity(useSelectedCityStore.getState().selectedCityId),
    ).toBe(balakovoCity);
  });
});
