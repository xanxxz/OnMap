import {create} from 'zustand';

import {balakovoCity} from './balakovo';
import {getCityConfig} from '.';
import type {CityConfig} from './city.types';

export const DEFAULT_CITY_ID = balakovoCity.id;

interface SelectedCityState {
  selectedCityId: string;
  setSelectedCityId: (cityId: string) => void;
}

export const useSelectedCityStore = create<SelectedCityState>(
  set => ({
    selectedCityId: DEFAULT_CITY_ID,
    setSelectedCityId: cityId => set({selectedCityId: cityId}),
  }),
);

export const resolveSelectedCity = (cityId: string): CityConfig =>
  getCityConfig(cityId) ?? balakovoCity;
