import {getCityConfig} from '../../../shared/config/cities';

export const getPartnerAddressUrl = (address: string | null, cityId: string): string | null => {
  const normalized = address?.trim();
  if (!normalized) return null;
  const cityName = getCityConfig(cityId)?.name;
  const query = cityName ? `${cityName}, ${normalized}` : normalized;
  return `https://yandex.ru/maps/?text=${encodeURIComponent(query)}`;
};
