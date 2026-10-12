import {useQuery} from '@tanstack/react-query';
import {partnerPlacementRepository} from '../api/partnerPlacementRepository';
import {partnerPlacementKeys, usePartnerPlacements} from './usePartnerPlacements';

jest.mock('@tanstack/react-query', () => ({useQuery: jest.fn()}));
jest.mock('../api/partnerPlacementRepository', () => ({
  partnerPlacementRepository: {list: jest.fn()},
}));

it('separates partner cache by city and viewport', () => {
  const bounds: [number, number, number, number] = [47.7, 51.9, 47.9, 52.1];
  expect(partnerPlacementKeys.viewport('balakovo', bounds)).not.toEqual(
    partnerPlacementKeys.viewport('saratov', bounds),
  );
  expect(partnerPlacementKeys.viewport('balakovo', bounds)).not.toEqual(
    partnerPlacementKeys.viewport('balakovo', [47.8, 51.9, 48, 52.1]),
  );
});

it('loads each city/viewport from the public endpoint and waits for map bounds', async () => {
  const bounds: [number, number, number, number] = [47.7, 51.9, 47.9, 52.1];
  usePartnerPlacements('balakovo', null);
  expect((useQuery as jest.Mock).mock.lastCall?.[0].enabled).toBe(false);

  usePartnerPlacements('balakovo', bounds);
  const first = (useQuery as jest.Mock).mock.lastCall?.[0];
  expect(first.queryKey).toEqual(partnerPlacementKeys.viewport('balakovo', bounds));
  await first.queryFn();
  expect(partnerPlacementRepository.list).toHaveBeenCalledWith('balakovo', bounds);

  const moved: [number, number, number, number] = [47.8, 51.9, 48, 52.1];
  usePartnerPlacements('saratov', moved);
  const next = (useQuery as jest.Mock).mock.lastCall?.[0];
  expect(next.queryKey).not.toEqual(first.queryKey);
  await next.queryFn();
  expect(partnerPlacementRepository.list).toHaveBeenCalledWith('saratov', moved);
});
