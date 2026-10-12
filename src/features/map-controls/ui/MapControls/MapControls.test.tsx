import React from 'react';
import {Alert, Text} from 'react-native';
import {act, create, ReactTestRenderer} from 'react-test-renderer';

import {MapControls} from './MapControls';
import {checkNotificationPermission, openNotificationSettings} from '../../../notifications/notificationPermission';

jest.mock('../../../notifications/notificationPermission', () => ({
  checkNotificationPermission: jest.fn().mockResolvedValue('granted'),
  requestNotificationPermissionOnce: jest.fn().mockResolvedValue('granted'),
  openNotificationSettings: jest.fn().mockResolvedValue(undefined),
}));

describe('MapControls location feedback', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.mocked(checkNotificationPermission).mockResolvedValue('granted');
  });

  it('shows a visible status and explains manual placement when GPS is unavailable', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    await act(async () => {
      renderer = create(
        <MapControls
          locationAvailable={false}
          locationMessage="Не удалось определить место. Поставьте точку вручную."
          onLocate={jest.fn()}
          onZoomIn={jest.fn()}
          onZoomOut={jest.fn()}
        />,
      );
    });
    expect(renderer.root.findAllByType(Text).some(node =>
      node.props.children === 'Геопозиция недоступна',
    )).toBe(true);
    act(() => renderer.root.findByProps({accessibilityLabel: 'Показать моё местоположение'}).props.onPress());
    expect(alert).toHaveBeenCalledWith('Моё местоположение', 'Не удалось определить место. Поставьте точку вручную.');
  });

  it('centers the map when a device coordinate exists', async () => {
    const onLocate = jest.fn();
    await act(async () => {
      renderer = create(
        <MapControls locationAvailable onLocate={onLocate} onZoomIn={jest.fn()} onZoomOut={jest.fn()} />,
      );
    });
    act(() => renderer.root.findByProps({accessibilityLabel: 'Показать моё местоположение'}).props.onPress());
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('offers device settings after location denial', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const onOpenLocationSettings = jest.fn();
    await act(async () => {
      renderer = create(<MapControls locationAvailable={false} locationPermission="denied" onOpenLocationSettings={onOpenLocationSettings} onLocate={jest.fn()} onZoomIn={jest.fn()} onZoomOut={jest.fn()} />);
    });
    act(() => renderer.root.findByProps({accessibilityLabel: 'Показать моё местоположение'}).props.onPress());
    const actions = alert.mock.calls[0][2];
    actions?.find(action => action.text === 'Настройки')?.onPress?.();
    expect(onOpenLocationSettings).toHaveBeenCalledTimes(1);
  });

  it('opens notification settings after denial without requesting again', async () => {
    jest.mocked(checkNotificationPermission).mockResolvedValue('denied');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    await act(async () => {
      renderer = create(<MapControls locationAvailable onLocate={jest.fn()} onZoomIn={jest.fn()} onZoomOut={jest.fn()} />);
    });
    act(() => renderer.root.findByProps({accessibilityLabel: 'Уведомления'}).props.onPress());
    await act(async () => {
      alert.mock.calls[0][2]?.find(action => action.text === 'Настройки')?.onPress?.();
    });
    expect(openNotificationSettings).toHaveBeenCalledTimes(1);
  });
});
