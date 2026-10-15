import React from 'react';
import {Text, TextInput} from 'react-native';
import {act, create, ReactTestInstance, ReactTestRenderer} from 'react-test-renderer';

import {MapControls} from './MapControls';
import {checkNotificationPermission, openNotificationSettings, requestNotificationPermissionOnce} from '../../../notifications/notificationPermission';
import {getNotificationPreferences, setNotificationPreferences} from '../../../notifications/notificationPreferences';
import {bindOwnerTestDevice} from '../../../notifications/pushDeviceRegistration';
import {requestLocationPermission} from '../../../user-location/useLocationPermission';

jest.mock('../../../notifications/pushDeviceRegistration', () => ({bindOwnerTestDevice: jest.fn().mockResolvedValue(undefined)}));
jest.mock('../../../user-location/useLocationPermission', () => ({requestLocationPermission: jest.fn().mockResolvedValue(true)}));
jest.mock('../../../notifications/notificationPermission', () => ({
  checkNotificationPermission: jest.fn().mockResolvedValue('granted'),
  requestNotificationPermissionOnce: jest.fn().mockResolvedValue('granted'),
  openNotificationSettings: jest.fn().mockResolvedValue(undefined),
}));

const renderControls = async (props: Partial<React.ComponentProps<typeof MapControls>> = {}) => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MapControls locationAvailable={false} onLocate={jest.fn()} onZoomIn={jest.fn()} onZoomOut={jest.fn()} {...props} />);
  });
  return renderer;
};

const press = async (renderer: ReactTestRenderer, label: string) => {
  await act(async () => renderer.root.findByProps({accessibilityLabel: label}).props.onPress());
};

const pressDialogAction = async (renderer: ReactTestRenderer, label: string) => {
  const activeDialog = renderer.root.findAllByProps({testID: 'map-controls-dialog-modal'}).find(node => node.props.visible);
  if (!activeDialog) throw new Error('Expected an OnMap dialog to be visible');
  await act(async () => activeDialog.findByProps({accessibilityLabel: label}).props.onPress());
};

const readText = (renderer: ReactTestRenderer) => renderer.root.findAllByType(Text).map(node => node.props.children).join(' ');

describe('MapControls permission feedback', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(checkNotificationPermission).mockResolvedValue('granted');
    jest.mocked(requestNotificationPermissionOnce).mockResolvedValue('granted');
    jest.mocked(requestLocationPermission).mockResolvedValue(true);
  });

  it('opens a native location request directly on first use, without an app pre-prompt', async () => {
    const onRequestLocation = jest.fn().mockResolvedValue(true);
    renderer = await renderControls({locationPermission: 'notDetermined', onRequestLocation});
    await press(renderer, 'Показать моё местоположение');
    expect(onRequestLocation).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({testID: 'map-controls-dialog-modal'}).props.visible).toBe(false);
  });

  it('shows confirmed no-GPS state and starts the manual point-selection flow', async () => {
    const onContinueManually = jest.fn();
    renderer = await renderControls({
      locationPermission: 'granted', locationUnavailable: true,
      locationMessage: 'Не удалось определить место.', onRetryLocation: jest.fn().mockResolvedValue(false),
      onOpenLocationSettings: jest.fn(), onContinueManually,
    });
    await press(renderer, 'Показать моё местоположение');
    expect(readText(renderer)).toContain('Не удалось определить место.');
    await press(renderer, 'Поставить точку вручную');
    expect(onContinueManually).toHaveBeenCalledTimes(1);
  });

  it('offers retry and settings when Android denial may be requested again', async () => {
    const onRequestLocation = jest.fn().mockResolvedValue(false);
    const onOpenLocationSettings = jest.fn().mockResolvedValue(undefined);
    renderer = await renderControls({locationPermission: 'denied', onRequestLocation, onOpenLocationSettings, onContinueManually: jest.fn()});
    await press(renderer, 'Показать моё местоположение');
    await press(renderer, 'Повторить запрос');
    expect(onRequestLocation).toHaveBeenCalledTimes(1);
    expect(readText(renderer)).toContain('Настройки');
  });

  it('does not offer a useless repeat prompt when the OS blocks location requests', async () => {
    const onRequestLocation = jest.fn();
    const onOpenLocationSettings = jest.fn();
    renderer = await renderControls({locationPermission: 'blocked', onRequestLocation, onOpenLocationSettings, onContinueManually: jest.fn()});
    await press(renderer, 'Показать моё местоположение');
    expect(readText(renderer)).toContain('ОС больше не показывает системный запрос');
    expect(renderer.root.findAllByProps({accessibilityLabel: 'Повторить запрос'})).toHaveLength(0);
  });

  it('centers the map when a device coordinate exists', async () => {
    const onLocate = jest.fn();
    renderer = await renderControls({locationAvailable: true, onLocate});
    await press(renderer, 'Показать моё местоположение');
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('asks for notification permission immediately, then shows a custom settings/later dialog after denial', async () => {
    jest.mocked(checkNotificationPermission).mockResolvedValue('notDetermined');
    jest.mocked(requestNotificationPermissionOnce).mockResolvedValue('denied');
    renderer = await renderControls();
    await press(renderer, 'Уведомления');
    expect(requestNotificationPermissionOnce).toHaveBeenCalledTimes(1);
    expect(readText(renderer)).toContain('Уведомления выключены');
    const activeDialog = renderer.root.findAllByProps({testID: 'map-controls-dialog-modal'}).find(node => node.props.visible);
    expect(activeDialog?.findByProps({accessibilityLabel: 'Настройки'})).toBeDefined();
    expect(activeDialog?.findByProps({accessibilityLabel: 'Позже'})).toBeDefined();
    await press(renderer, 'Уведомления');
    expect(requestNotificationPermissionOnce).toHaveBeenCalledTimes(1);
  });

  it('does not show a success message unless the OS confirms notification access', async () => {
    jest.mocked(checkNotificationPermission).mockResolvedValue('notDetermined');
    jest.mocked(requestNotificationPermissionOnce).mockResolvedValue('granted');
    renderer = await renderControls();
    await press(renderer, 'Уведомления');
    expect(renderer.root.findByProps({testID: 'map-controls-dialog-modal'}).props.visible).toBe(false);
    expect(readText(renderer)).not.toContain('Уведомления включены');
  });

  it('opens settings after a stored notification denial without requesting again', async () => {
    jest.mocked(checkNotificationPermission).mockResolvedValue('denied');
    const onSettings = jest.mocked(openNotificationSettings);
    renderer = await renderControls();
    await press(renderer, 'Уведомления');
    await pressDialogAction(renderer, 'Настройки');
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(requestNotificationPermissionOnce).not.toHaveBeenCalled();
  });

  it('keeps notification preference controls app-owned and saves categories independently', async () => {
    await setNotificationPreferences({roadPushEnabled: true, newsPushEnabled: true});
    renderer = await renderControls();
    await press(renderer, 'Уведомления');
    await press(renderer, 'Новости и предложения: выключить');
    expect(await getNotificationPreferences()).toEqual({roadPushEnabled: true, newsPushEnabled: false});
  });

  it('keeps the owner test-device pairing flow and shows API success in an OnMap modal', async () => {
    renderer = await renderControls();
    await press(renderer, 'Уведомления');
    await press(renderer, 'Привязать для теста');
    await act(async () => renderer!.root.findByType(TextInput).props.onChangeText('ABCD-EF01-2345'));
    let submit: ReactTestInstance | null = renderer.root.findByProps({children: 'Привязать'});
    while (submit && typeof submit.props.onPress !== 'function') submit = submit.parent;
    expect(submit).toBeDefined();
    await act(async () => submit?.props.onPress());
    expect(bindOwnerTestDevice).toHaveBeenCalledWith('ABCD-EF01-2345');
    expect(readText(renderer)).toContain('Телефон привязан');
  });
});
