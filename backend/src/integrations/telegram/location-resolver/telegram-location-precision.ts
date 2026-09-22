import type { CityLocationKind } from '../../../cities/city.types';

export type TelegramLocationPrecision =
  'EXACT' | 'INTERSECTION' | 'LANDMARK' | 'STREET' | 'AREA' | 'SETTLEMENT';

const LOCATION_PRECISION_RANK: Readonly<
  Record<TelegramLocationPrecision, number>
> = {
  SETTLEMENT: 0,
  AREA: 1,
  STREET: 2,
  LANDMARK: 3,
  INTERSECTION: 4,
  EXACT: 5,
};

export const compareLocationPrecision = (
  left: TelegramLocationPrecision,
  right: TelegramLocationPrecision,
): number => LOCATION_PRECISION_RANK[left] - LOCATION_PRECISION_RANK[right];

export const isMorePreciseLocation = (
  proposed: TelegramLocationPrecision,
  current: TelegramLocationPrecision,
): boolean => compareLocationPrecision(proposed, current) > 0;

export const locationPrecisionFor = (
  kind: CityLocationKind | undefined,
  intersection: boolean,
): TelegramLocationPrecision => {
  if (intersection || kind === 'INTERSECTION') return 'INTERSECTION';
  if (kind === 'STREET') return 'STREET';
  if (kind === 'DISTRICT' || kind === 'AREA') return 'AREA';
  if (kind === 'SETTLEMENT') return 'SETTLEMENT';
  if (kind === 'LANDMARK' || kind === 'BRIDGE') return 'LANDMARK';

  return 'EXACT';
};
