import React from 'react';

import { act, create, ReactTestRenderer } from 'react-test-renderer';

import {
  MapStatusCard,
  RealtimeStatusBadge,
  formatRoadEventCount,
  resolveMapDataStatus,
} from './MapStatusCard';

describe('Map status UX', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it('distinguishes API error from a successful empty result', () => {
    expect(
      resolveMapDataStatus({
        boundsReady: true,
        isPending: false,
        isError: true,
        eventCount: 0,
      }),
    ).toBe('error');

    expect(
      resolveMapDataStatus({
        boundsReady: true,
        isPending: false,
        isError: false,
        eventCount: 0,
      }),
    ).toBe('empty');

    expect(
      resolveMapDataStatus({
        boundsReady: true,
        isPending: false,
        isError: false,
        eventCount: 1,
      }),
    ).toBe('ready');
  });

  it('uses natural Russian event count labels', () => {
    expect(formatRoadEventCount(1)).toBe('1 событие');
    expect(formatRoadEventCount(2)).toBe('2 события');
    expect(formatRoadEventCount(5)).toBe('5 событий');
    expect(formatRoadEventCount(11)).toBe('11 событий');
    expect(formatRoadEventCount(21)).toBe('21 событие');
  });

  it('calls retry from the API error card', () => {
    const onRetry = jest.fn();

    act(() => {
      renderer = create(<MapStatusCard status="error" onRetry={onRetry} />);
    });

    const retry = renderer.root.findByProps({
      accessibilityLabel: 'Повторить загрузку событий',
    });

    act(() => {
      retry.props.onPress();
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a compact positive state when realtime is connected', () => {
    act(() => {
      renderer = create(<RealtimeStatusBadge status="connected" />);
    });

    expect(
      renderer.root.findByProps({
        accessibilityLabel: 'Realtime подключён',
      }),
    ).toBeTruthy();
  });

  it('does not render realtime disabled as a connection error', () => {
    act(() => {
      renderer = create(<RealtimeStatusBadge status="disabled" />);
    });

    expect(renderer.toJSON()).toBeNull();
  });
});
