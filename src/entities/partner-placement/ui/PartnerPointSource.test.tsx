import React from 'react';
import {StyleSheet} from 'react-native';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {PartnerPointSource} from './PartnerPointSource';
import type {PartnerPoint} from '../model/partnerPlacement';

jest.mock('@maplibre/maplibre-react-native', () => ({
  Marker: ({children, ...props}: Record<string, unknown> & {children: React.ReactNode}) => {
    const View = require('react-native').View;
    return <View {...props}>{children}</View>;
  },
}));

const point: PartnerPoint = {
  id: 'partner-1', cityId: 'balakovo', title: 'Мастерская', category: 'Сервис',
  description: null, coordinates: {longitude: 47.8, latitude: 52.02},
  displayAddress: null, startsAt: '', endsAt: '', imageUrl: null, promoCode: null, contacts: [],
};

it('uses a distinct partner marker and selects its own point', () => {
  const onPointPress = jest.fn();
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<PartnerPointSource points={[point]} onPointPress={onPointPress} />); });
  const marker = renderer.root.findByProps({id: 'partner-point-marker-partner-1'});
  expect(marker.props.lngLat).toEqual([47.8, 52.02]);
  act(() => renderer.root.findByProps({testID: 'partner-point-partner-1'}).props.onPress());
  expect(onPointPress).toHaveBeenCalledWith(point);
  expect(renderer.root.findAllByProps({id: 'road-event-marker-partner-1'})).toHaveLength(0);
  act(() => renderer.unmount());
});

it('keeps a cream partner colour visible on the map marker without changing the saved appearance', () => {
  const lightPoint = {...point, appearance: {backgroundColor: '#F7F4EA', textColor: '#14241E'}};
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<PartnerPointSource points={[lightPoint]} onPointPress={jest.fn()} />); });
  expect(lightPoint.appearance).toEqual({backgroundColor: '#F7F4EA', textColor: '#14241E'});
  expect(StyleSheet.flatten(renderer.root.findByProps({testID: 'partner-artwork'}).props.style).borderColor).toBe('#153D32');
  expect(renderer.root.findByProps({testID: 'partner-artwork-fallback'}).props.style).toEqual(expect.arrayContaining([expect.objectContaining({color: '#153D32'})]));
  expect(StyleSheet.flatten(renderer.root.findByProps({testID: 'partner-point-tip-partner-1'}).props.style).borderColor).toBe('#153D32');
  act(() => renderer.unmount());
});
