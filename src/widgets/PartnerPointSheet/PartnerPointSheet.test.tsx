import React from 'react';
import {Linking, StyleSheet} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {PartnerPointSheet} from './PartnerPointSheet';
import type {PartnerPoint} from '../../entities/partner-placement/model/partnerPlacement';

jest.mock('../../shared/ui/BottomSheet/BottomSheet', () => ({
  BottomSheet: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('@react-native-clipboard/clipboard', () => ({__esModule: true, default: {setString: jest.fn()}}));

const point: PartnerPoint = {
  id: 'partner-1', cityId: 'balakovo', title: 'Мастерская', category: 'Сервис',
  description: 'Ремонт автомобилей', coordinates: {longitude: 47.8, latitude: 52.02},
  displayAddress: 'Улица Ленина, 1', startsAt: '', endsAt: '', imageUrl: null, promoCode: null,
  contacts: [{type: 'PHONE', label: 'Позвонить', value: '+79990000000', displayOrder: 0}],
};

it('shows partner details and opens typed contacts', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const onContactPress = jest.fn();
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<PartnerPointSheet point={{...point, contacts: [{...point.contacts[0], id: 'contact-1'}]}} onClose={jest.fn()} onContactPress={onContactPress} />); });
  expect(renderer.root.findByProps({children: 'Мастерская'})).toBeDefined();
  await act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Позвонить: +79990000000'}).props.onPress();
  });
  expect(openURL).toHaveBeenCalledWith('tel:+79990000000');
  expect(onContactPress).toHaveBeenCalledWith('partner-1', 'contact-1');
  act(() => renderer.unmount());
  openURL.mockRestore();
});

it('keeps the first usable contact as the primary action and retains other contacts', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const contacts: PartnerPoint['contacts'] = [
    {type: 'OTHER', label: 'Ориентир', value: 'Главный вход', displayOrder: 0},
    {type: 'PHONE', label: 'Позвонить', value: '+79990000000', displayOrder: 1},
    {type: 'EMAIL', label: 'Почта', value: 'partner@example.test', displayOrder: 2},
  ];
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<PartnerPointSheet point={{...point, contacts}} onClose={jest.fn()} />); });

  expect(renderer.root.findByProps({children: 'Главный вход'})).toBeDefined();
  expect(renderer.root.findByProps({accessibilityLabel: 'Закрыть карточку'})).toBeDefined();
  await act(async () => {
    renderer.root.findByProps({accessibilityLabel: 'Почта: partner@example.test'}).props.onPress();
  });
  expect(openURL).toHaveBeenCalledWith('mailto:partner%40example.test');

  act(() => renderer.unmount());
  openURL.mockRestore();
});

it('applies the selected color pair to the partner category and contact action', () => {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<PartnerPointSheet
    point={{...point, appearance: {backgroundColor: '#F7F4EA', textColor: '#14241E'}}}
    onClose={jest.fn()}
  />); });
  const category = renderer.root.findByProps({testID: 'partner-category'});
  expect(StyleSheet.flatten(category.props.style)).toMatchObject({
    backgroundColor: '#F7F4EA', color: '#14241E',
  });
  const action = renderer.root.findByProps({accessibilityLabel: 'Позвонить: +79990000000'});
  expect(StyleSheet.flatten(action.props.style({pressed: false})).backgroundColor).toBe('#F7F4EA');
  act(() => renderer.unmount());
});

it('shows a promo only when present and copies its exact case', () => {
  const copy = Clipboard.setString as jest.Mock;
  copy.mockReset();
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<PartnerPointSheet point={point} onClose={jest.fn()} />); });
  expect(renderer.root.findAllByProps({testID: 'partner-promo'})).toHaveLength(0);
  act(() => renderer.update(<PartnerPointSheet point={{...point, promoCode: 'onMap-25'}} onClose={jest.fn()} />));
  expect(renderer.root.findByProps({children: 'onMap-25'})).toBeDefined();
  act(() => renderer.root.findByProps({testID: 'partner-promo-copy'}).props.onPress());
  expect(copy).toHaveBeenCalledWith('onMap-25');
  expect(renderer.root.findByProps({children: 'Скопировано'})).toBeDefined();
  act(() => renderer.unmount());
});

it('explains clipboard errors and leaves the code selectable', () => {
  const copy = Clipboard.setString as jest.Mock;
  copy.mockReset().mockImplementationOnce(() => { throw new Error('clipboard unavailable'); });
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<PartnerPointSheet point={{...point, promoCode: 'SALE_20'}} onClose={jest.fn()} />); });
  act(() => renderer.root.findByProps({testID: 'partner-promo-copy'}).props.onPress());
  expect(renderer.root.findByProps({children: 'Не удалось скопировать. Выделите код вручную.'})).toBeDefined();
  expect(renderer.root.findByProps({children: 'SALE_20'}).props.selectable).toBe(true);
  act(() => renderer.unmount());
});
