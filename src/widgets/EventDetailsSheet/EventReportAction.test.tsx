import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import type { UserRoadEvent } from '../../entities/road-event/model/roadEvent';

import { EventReportAction } from './EventReportAction';

const mockReportMutation = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  data: undefined as undefined | { duplicate: boolean },
};

jest.mock('../../features/road-event-feedback/model/useRoadEventReport', () => ({
  useRoadEventReport: () => mockReportMutation,
}));

jest.mock('@sbaiahmed1/react-native-blur', () => {
  const ReactNative = require('react-native');
  return {BlurView: ReactNative.View};
});

const event: UserRoadEvent = {
  id: 'event-123',
  source: 'USER',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП',
  coordinate: [47.8, 52.02],
  geometry: {type: 'Point', coordinates: [47.8, 52.02]},
  confirmationCount: 0,
  rejectionCount: 0,
  confidence: 0.4,
  createdAt: '2026-09-25T12:00:00.000Z',
  expiresAt: '2026-09-25T14:00:00.000Z',
};

describe('EventReportAction', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockReportMutation.isPending = false;
    mockReportMutation.isSuccess = false;
    mockReportMutation.isError = false;
    mockReportMutation.data = undefined;
  });

  const openDraft = () => {
    act(() => {
      renderer = create(<EventReportAction event={event} bottomInset={34} />);
    });
    act(() => {
      renderer.root.findByProps({accessibilityLabel: 'Пожаловаться на событие'}).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({accessibilityLabel: 'Точка указана неверно'}).props.onPress();
    });
  };

  it('submits a fixed reason to the backend without sending event text or identity', () => {
    openDraft();
    expect(mockReportMutation.mutate).toHaveBeenCalledWith({
      eventId: 'event-123',
      reason: 'WRONG_LOCATION',
    });
    expect(renderer.root.findAllByType(Text).some(node =>
      String(node.props.children).includes('Исходное сообщение'),
    )).toBe(false);
  });

  it('uses a light blurred backdrop instead of a dark scrim', () => {
    openDraft();

    const blur = renderer.root.findByProps({
      testID: 'event-report-backdrop-blur',
    });
    expect(blur.props.blurType).toBe('systemThinMaterialLight');
    expect(blur.props.blurAmount).toBe(18);
    expect(blur.props.overlayColor).toBe('rgba(237,241,234,0.18)');
  });

  it('shows confirmation after backend acceptance', () => {
    openDraft();
    mockReportMutation.isSuccess = true;
    mockReportMutation.data = { duplicate: false };
    act(() => renderer.update(<EventReportAction event={event} bottomInset={34} />));
    expect(renderer.root.findAllByType(Text).some(node =>
      String(node.props.children).includes('Жалоба передана на проверку'),
    )).toBe(true);
  });

  it('shows retry guidance when submission fails', () => {
    openDraft();
    mockReportMutation.isError = true;
    act(() => renderer.update(<EventReportAction event={event} bottomInset={34} />));
    expect(renderer.root.findAllByType(Text).some(node =>
      String(node.props.children).includes('Не удалось отправить жалобу'),
    )).toBe(true);
  });
});
