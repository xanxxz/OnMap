import React from 'react';

import { AppState, Linking, StyleSheet, View } from 'react-native';

import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { balakovoCity } from '../../shared/config/cities';

import { MapHeader } from './MapHeader';

jest.mock('../../shared/ui/BottomSheet/BottomSheet', () => {
  const ReactNative = require('react-native');

  return {
    BottomSheet: ({ children }: { children: React.ReactNode }) => (
      <ReactNative.View>{children}</ReactNative.View>
    ),
  };
});

const secondCity = {
  ...balakovoCity,
  id: 'second-city',
  name: 'Второй город',
};

describe('MapHeader', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
    jest.restoreAllMocks();
  });

  it('offers the real support chat from the city selector', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    act(() => {
      renderer = create(
        <MapHeader
          city={balakovoCity}
          cities={[balakovoCity]}
          dpsActivity={null}
          eventCount={0}
          realtimeStatus="connected"
          onSelectCity={jest.fn()}
        />,
      );
    });

    act(() => {
      renderer.root.findByProps({testID: 'city-header-button'}).props.onPress();
    });

    await act(async () => {
      renderer.root.findByProps({
        accessibilityLabel: 'Открыть поддержку @onMapSupport',
      }).props.onPress();
    });

    expect(openURL).toHaveBeenCalledWith('https://t.me/onMapSupport');
  });

  it('shows the city and selects another registry entry', () => {
    const onSelectCity = jest.fn();

    act(() => {
      renderer = create(
        <MapHeader
          city={balakovoCity}
          cities={[balakovoCity, secondCity]}
          dpsActivity={{ cityId: 'balakovo', onMap: 2, unlocated: 1, total: 3 }}
          eventCount={0}
          realtimeStatus="connected"
          onSelectCity={onSelectCity}
        />,
      );
    });

    act(() => {
      renderer.root
        .findByProps({ testID: 'city-header-button' })
        .props.onPress();
    });

    const option = renderer.root.findByProps({
      accessibilityLabel: 'Второй город',
    });

    act(() => option.props.onPress());

    expect(onSelectCity).toHaveBeenCalledWith('second-city');
  });

  it('uses a centered disclosure icon while keeping city selection on the full card', () => {
    const onSelectCity = jest.fn();

    act(() => {
      renderer = create(
        <MapHeader
          city={balakovoCity}
          cities={[balakovoCity]}
          dpsActivity={null}
          eventCount={0}
          realtimeStatus="connected"
          onSelectCity={onSelectCity}
        />,
      );
    });

    const chevron = renderer.root.findByProps({testID: 'city-header-chevron'});
    expect(
      chevron.findAllByType(View).filter(node => node !== chevron),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        node => node.type === require('react-native').Text && node.props.children === '⌄',
      ),
    ).toHaveLength(0);

    act(() => {
      renderer.root.findByProps({testID: 'city-header-button'}).props.onPress();
    });
    expect(renderer.root.findByProps({testID: 'city-header-button'})).toBeDefined();
  });

  it('shows the citywide DPS total including unlocated reports', () => {
    act(() => {
      renderer = create(
        <MapHeader
          city={balakovoCity}
          cities={[balakovoCity]}
          dpsActivity={{ cityId: 'balakovo', onMap: 2, unlocated: 1, total: 3 }}
          eventCount={0}
          realtimeStatus="connected"
          onSelectCity={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root
        .findAllByType(View)
        .filter(node => node.props.testID === 'dps-activity-card'),
    ).toHaveLength(1);

    const text = renderer.root
      .findAllByType(require('react-native').Text)
      .map(node => node.props.children)
      .join(' ');

    expect(text).toContain('3');
    expect(text).toContain('2 на карте\n1 без точки');
  });

  it('does not claim road conditions are calm before events load successfully', () => {
    act(() => {
      renderer = create(
        <MapHeader
          city={balakovoCity}
          cities={[balakovoCity]}
          dpsActivity={null}
          dpsActivityLoading
          eventCount={0}
          eventsStatus="loading"
          realtimeStatus="connected"
          onSelectCity={jest.fn()}
        />,
      );
    });

    const text = renderer.root
      .findAllByType(require('react-native').Text)
      .map(node => node.props.children)
      .join(' ');

    expect(text).toContain('Загружаем обстановку');
    expect(text).not.toContain('Дорожная обстановка спокойная');
    expect(text).toContain('загружаем');
  });

  it('shows a recoverable error for events and DPS when requests fail', () => {
    const retryDps = jest.fn();
    act(() => {
      renderer = create(
        <MapHeader
          city={balakovoCity}
          cities={[balakovoCity]}
          dpsActivity={null}
          dpsActivityError
          eventCount={0}
          eventsStatus="error"
          realtimeStatus="connected"
          onRetryDpsActivity={retryDps}
          onSelectCity={jest.fn()}
        />,
      );
    });

    const text = renderer.root
      .findAllByType(require('react-native').Text)
      .map(node => node.props.children)
      .join(' ');
    expect(text).toContain('Не удалось загрузить обстановку');
    expect(text).not.toContain('Дорожная обстановка спокойная');
    act(() => renderer.root.findByProps({testID: 'dps-summary-retry'}).props.onPress());
    expect(retryDps).toHaveBeenCalledTimes(1);
  });

  it('shows no partner block without a backend banner and opens the provided banner URL', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const onBannerPress = jest.fn();
    const common = {
      city: balakovoCity,
      cities: [balakovoCity],
      dpsActivity: null,
      eventCount: 0,
      realtimeStatus: 'connected' as const,
      onSelectCity: jest.fn(),
    };
    act(() => { renderer = create(<MapHeader {...common} partnerBanner={null} />); });
    expect(renderer.root.findAllByProps({testID: 'partner-banner'})).toHaveLength(0);

    act(() => renderer.update(<MapHeader {...common} onPartnerBannerPress={onBannerPress} partnerBanner={{
      id: 'banner-1', cityId: 'balakovo', partnerPointId: 'point-1',
      title: 'Мастерская рядом', text: 'Сервис для автомобиля',
      button: {label: 'Подробнее', url: 'https://example.com/'},
      startsAt: '', endsAt: '',
    }} />));
    expect(renderer.root.findAllByType(View).filter(node => node.props.testID === 'partner-banner')).toHaveLength(1);
    act(() => renderer.root.findByProps({testID: 'partner-banner-expand'}).props.onPress());
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: 'Подробнее'}).props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith('https://example.com/');
    expect(onBannerPress).toHaveBeenCalledWith('banner-1');
  });

  it('uses the linked point colors on the banner when supplied by the API', () => {
    act(() => { renderer = create(<MapHeader
      city={balakovoCity} cities={[balakovoCity]} dpsActivity={null}
      eventCount={0} realtimeStatus="connected" onSelectCity={jest.fn()}
      partnerBanner={{id: 'banner-1', cityId: 'balakovo', partnerPointId: 'point-1',
        title: 'Мастерская рядом', text: 'Сервис для автомобиля',
        button: {label: 'Подробнее', url: 'https://example.com/'},
        startsAt: '', endsAt: '',
        appearance: {backgroundColor: '#F7F4EA', textColor: '#14241E'}}}
    />); });
    const banner = renderer.root.findByProps({testID: 'partner-banner'});
    expect(StyleSheet.flatten(banner.props.style).backgroundColor).not.toBe('#F7F4EA');
    expect(StyleSheet.flatten(renderer.root.findByProps({children: 'Открыть'}).props.style).color).toBe('#153D32');
    act(() => renderer.root.findByProps({testID: 'partner-banner-expand'}).props.onPress());
    const action = renderer.root.findByProps({testID: 'partner-banner-action'});
    expect(StyleSheet.flatten(action.props.style({pressed: false}))).toMatchObject({backgroundColor: '#153D32', minHeight: 44});
    expect(StyleSheet.flatten(action.findAllByType(require('react-native').Text)[0].props.style).color).toBe('#FDFBF4');
    expect(StyleSheet.flatten(action.props.style({pressed: true})).opacity).toBeLessThan(1);
  });

  it('counts an impression only after one second of laid-out, active visibility, not on rerender', () => {
    jest.useFakeTimers();
    const previousState = AppState.currentState;
    Object.defineProperty(AppState, 'currentState', {value: 'active', configurable: true});
    const onImpression = jest.fn();
    const banner = {id: 'banner-1', cityId: 'balakovo', partnerPointId: 'point-1',
      title: 'Мастерская', text: 'Описание', button: {label: 'Подробнее', url: 'https://example.com'},
      startsAt: '', endsAt: ''};
    const props = {city: balakovoCity, cities: [balakovoCity], dpsActivity: null,
      eventCount: 0, realtimeStatus: 'connected' as const, onSelectCity: jest.fn(),
      partnerBanner: banner, onPartnerBannerImpression: onImpression};
    act(() => { renderer = create(<MapHeader {...props} />); });
    act(() => jest.advanceTimersByTime(2000));
    expect(onImpression).not.toHaveBeenCalled();
    act(() => renderer.root.findByProps({testID: 'partner-banner'}).props.onLayout({nativeEvent: {layout: {width: 250, height: 100}}}));
    act(() => jest.advanceTimersByTime(999));
    expect(onImpression).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onImpression).toHaveBeenCalledTimes(1);
    act(() => renderer.update(<MapHeader {...props} />));
    act(() => jest.advanceTimersByTime(2000));
    expect(onImpression).toHaveBeenCalledTimes(1);
    Object.defineProperty(AppState, 'currentState', {value: previousState, configurable: true});
    jest.useRealTimers();
  });

  it('does not count a banner obscured before the visibility threshold', () => {
    jest.useFakeTimers();
    const previousState = AppState.currentState;
    Object.defineProperty(AppState, 'currentState', {value: 'active', configurable: true});
    const onImpression = jest.fn();
    const props = {city: balakovoCity, cities: [balakovoCity], dpsActivity: null,
      eventCount: 0, realtimeStatus: 'connected' as const, onSelectCity: jest.fn(),
      partnerBanner: {id: 'banner-hidden', cityId: 'balakovo', partnerPointId: 'point-1',
        title: 'Мастерская', text: 'Описание', button: {label: 'Подробнее', url: 'https://example.com'},
        startsAt: '', endsAt: ''}, onPartnerBannerImpression: onImpression};
    act(() => { renderer = create(<MapHeader {...props} partnerBannerVisible />); });
    act(() => renderer.root.findByProps({testID: 'partner-banner'}).props.onLayout({nativeEvent: {layout: {width: 250, height: 100}}}));
    act(() => jest.advanceTimersByTime(500));
    act(() => renderer.update(<MapHeader {...props} partnerBannerVisible={false} />));
    act(() => jest.advanceTimersByTime(1500));
    expect(onImpression).not.toHaveBeenCalled();
    Object.defineProperty(AppState, 'currentState', {value: previousState, configurable: true});
    jest.useRealTimers();
  });
});
