import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useDpsActivitySummary } from '../../entities/road-event/model/useDpsActivitySummary';
import { MapScreen } from './MapScreen';
import { MapStatusCard } from './MapStatusCard';

jest.mock('../../shared/api/httpClient', () => ({
  ApiError: class extends Error {},
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../../entities/road-event/model/useRoadEvents', () => ({
  useRoadEvents: () => ({
    data: [],
    isFetching: false,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('../../entities/road-event/model/useRoadEventRealtime', () => ({
  useRoadEventRealtime: () => 'connected',
}));
jest.mock('../../entities/road-event/model/useDpsActivitySummary', () => ({
  useDpsActivitySummary: jest.fn(() => ({
    data: { cityId: 'balakovo', onMap: 0, unlocated: 2, total: 2 },
    isPending: false,
  })),
}));
jest.mock('../../features/user-location/useUserLocation', () => ({
  useUserLocation: () => ({ permission: 'denied', coordinate: null }),
}));
jest.mock('../../features/user-location/requestFreshUserLocation', () => ({
  requestFreshUserLocation: jest.fn(),
}));
jest.mock(
  '../../features/road-event-feedback/model/useRoadEventFeedback',
  () => ({
    useRoadEventFeedback: () => ({
      isPending: false,
      isError: false,
      reset: jest.fn(),
    }),
  }),
);
jest.mock(
  '../../features/road-event-feedback/model/useRoadEventFeedbackStore',
  () => ({
    useRoadEventFeedbackStore: (select: (state: unknown) => unknown) =>
      select({ feedbackByEventId: {} }),
  }),
);
jest.mock('../../features/report-event/model/useCreateRoadEvent', () => ({
  useCreateRoadEvent: () => ({
    isPending: false,
    isError: false,
    reset: jest.fn(),
  }),
}));
jest.mock('../../widgets/RoadMap/RoadMap', () => {
  const R = require('react');
  const { View: NativeView } = require('react-native');
  return {
    RoadMap: R.forwardRef((props: object, _ref: unknown) => (
      <NativeView {...props} testID="map-screen-map" />
    )),
  };
});
jest.mock('../../widgets/EventDetailsSheet/EventDetailsSheet', () => ({
  EventDetailsSheet: () => null,
}));
jest.mock('../../widgets/ReportEventSheet/ReportEventSheet', () => ({
  ReportEventSheet: () => null,
}));
jest.mock('../../shared/ui/BottomSheet/BottomSheet', () => ({
  BottomSheet: () => null,
}));

describe('MapScreen empty result and DPS header', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => act(() => renderer?.unmount()));

  it('keeps the empty map free of a duplicate status card and shows DPS total', () => {
      (useDpsActivitySummary as jest.Mock).mockReturnValue({
        data: { cityId: 'balakovo', onMap: 0, unlocated: 2, total: 2 },
        isPending: false,
      });
      act(() => {
        renderer = create(<MapScreen />);
      });
      act(() =>
        renderer.root
          .findByProps({ testID: 'map-screen-map' })
          .props.onViewportChange([47.75, 52, 47.85, 52.05]),
      );
      const text = renderer.root
        .findAllByType(Text)
        .map(node => node.props.children)
        .join(' ');
      expect(
        renderer.root.findByProps({ testID: 'map-screen-map' }).props.events,
      ).toEqual([]);
      expect(text).toContain('Дорожная обстановка спокойная');
      expect(text).not.toContain('Пока всё спокойно');
      expect(text).not.toContain('Свежих событий рядом нет');
      expect(renderer.root.findAllByType(MapStatusCard)).toHaveLength(0);
      expect(useDpsActivitySummary).toHaveBeenCalledWith('balakovo');
      const city = renderer.root.findByProps({ testID: 'city-header-button' });
      const style = StyleSheet.flatten(city.props.style({ pressed: false }));
      expect(style.flex).toBe(1);
      expect(style.maxWidth).toBeLessThanOrEqual(260);
      const cards = renderer.root
        .findAllByType(View)
        .filter(node => node.props.testID === 'dps-activity-card');
      expect(cards).toHaveLength(1);
      expect(text).toContain('0 на карте\n2 без точки');
  });
});
