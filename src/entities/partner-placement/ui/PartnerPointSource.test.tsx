import React from 'react';
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
