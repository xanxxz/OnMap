import React from 'react';
import { Alert, Linking, Modal, Text, StyleSheet, View } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useDpsActivitySummary } from '../../entities/road-event/model/useDpsActivitySummary';
import {useRoadEvents} from '../../entities/road-event/model/useRoadEvents';
import {usePartnerPlacements} from '../../entities/partner-placement/model/usePartnerPlacements';
import {parsePartnerPlacements, partnerPlacementRepository} from '../../entities/partner-placement/api/partnerPlacementRepository';
import { MapScreen } from './MapScreen';
import { MapStatusCard } from './MapStatusCard';
import {useReportEventStore} from '../../features/report-event/model/useReportEventStore';
import {useUserLocation} from '../../features/user-location/useUserLocation';
import {pushNative} from '../../features/notifications/pushNative';
import {roadEventRepository} from '../../entities/road-event/api/httpRoadEventRepository';

jest.mock('../../shared/api/httpClient', () => ({
  ApiError: class extends Error {},
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));
jest.mock('../../entities/road-event/model/useRoadEvents', () => ({
  useRoadEvents: jest.fn(() => ({
    data: [],
    isFetching: false,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  })),
}));
jest.mock('../../entities/partner-placement/model/usePartnerPlacements', () => ({
  usePartnerPlacements: jest.fn(() => ({data: {cityId: 'balakovo', points: [], banner: null}})),
}));
jest.mock('../../entities/road-event/model/useRoadEventRealtime', () => ({
  useRoadEventRealtime: () => 'connected',
}));
jest.mock('../../entities/road-event/model/useRoadEventModerationNotices', () => ({
  useRoadEventModerationNotices: () => ({ data: [] }),
  useAcknowledgeRoadEventModerationNotice: () => ({ mutate: jest.fn() }),
}));
jest.mock('../../entities/road-event/model/useDpsActivitySummary', () => ({
  useDpsActivitySummary: jest.fn(() => ({
    data: { cityId: 'balakovo', onMap: 0, unlocated: 2, total: 2 },
    isPending: false,
  })),
}));
jest.mock('../../features/user-location/useUserLocation', () => ({
  useUserLocation: jest.fn(() => ({
    permission: 'denied',
    coordinate: null,
    accuracy: null,
    timestamp: null,
    stale: false,
    refreshPermission: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('../../features/map-controls/ui/MapControls/MapControls', () => ({
  MapControls: () => null,
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
jest.mock('../../widgets/PartnerPointSheet/PartnerPointSheet', () => ({
  PartnerPointSheet: ({point}: {point: unknown}) => {
    const NativeView = require('react-native').View;
    return <NativeView testID="partner-point-sheet" point={point} />;
  },
}));
jest.mock('../../widgets/ReportEventSheet/ReportEventSheet', () => ({
  ReportEventSheet: ({onClose, onSelect, visible}: {onClose: () => void; onSelect: (type: string) => void; visible: boolean}) => {
    const NativeView = require('react-native').View;
    return <NativeView testID="report-sheet" onClose={onClose} onSelect={onSelect} visible={visible} />;
  },
}));
jest.mock('../../shared/ui/BottomSheet/BottomSheet', () => ({
  BottomSheet: () => null,
}));

describe('MapScreen empty result and DPS header', () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(pushNative, 'consumeInitialUrl').mockResolvedValue(null);
    (usePartnerPlacements as jest.Mock).mockReturnValue({
      data: {cityId: 'balakovo', points: [], banner: null},
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    useReportEventStore.getState().close();
    jest.restoreAllMocks();
  });

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

  it('opens a partner point with promo code from a cold-start push deep link', async () => {
    const point = {
      id: 'c54d405d-d951-46f1-9ecb-52a90b3022f2', cityId: 'balakovo',
      title: 'Мастерская', category: 'Сервис', description: null,
      coordinates: {longitude: 47.8, latitude: 52.02}, displayAddress: null,
      startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z',
      imageUrl: null, promoCode: 'ONMAP10', contacts: [],
    };
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(
      `onmap://open/partner_point/${point.id}?cityId=balakovo`,
    );
    jest.spyOn(partnerPlacementRepository, 'getActivePoint').mockResolvedValue(point);
    await act(async () => { renderer = create(<MapScreen />); await Promise.resolve(); });
    expect(renderer.root.findByProps({testID: 'partner-point-sheet'}).props.point)
      .toMatchObject({id: point.id, promoCode: 'ONMAP10'});
    expect(renderer.root.findByProps({testID: 'map-screen-map'}).props.events).toEqual([]);
  });

  it('handles a warm push and unavailable partner point without leaving a stale card', async () => {
    let receive: ((url: string) => void) | undefined;
    jest.spyOn(pushNative, 'onOpen').mockImplementation(listener => {
      receive = listener;
      return () => undefined;
    });
    jest.spyOn(partnerPlacementRepository, 'getActivePoint').mockRejectedValue(new Error('not found'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await act(async () => { renderer = create(<MapScreen />); await Promise.resolve(); });
    await act(async () => {
      receive?.('onmap://open/partner_point/c54d405d-d951-46f1-9ecb-52a90b3022f2?cityId=balakovo');
      await Promise.resolve();
    });
    expect(alert).toHaveBeenCalledWith('Метка недоступна', expect.any(String));
    expect(renderer.root.findByProps({testID: 'partner-point-sheet'}).props.point).toBeNull();
  });

  it('selects a current road event from a warm push without mixing it into partner points', async () => {
    let receive: ((url: string) => void) | undefined;
    jest.spyOn(pushNative, 'onOpen').mockImplementation(listener => {
      receive = listener;
      return () => undefined;
    });
    const event = {
      id: 'e127e3be-f6d2-49d4-96c9-643d247933cb', cityId: 'balakovo',
      source: 'USER' as const, type: 'ACCIDENT' as const, status: 'ACTIVE' as const,
      title: 'ДТП', coordinate: [47.8, 52.02] as [number, number],
      geometry: {type: 'Point' as const, coordinates: [47.8, 52.02] as [number, number]},
      confirmationCount: 1, rejectionCount: 0, confidence: 0.4,
      createdAt: '2026-10-12T10:00:00Z', expiresAt: '2026-10-12T10:20:00Z',
    };
    jest.spyOn(roadEventRepository, 'getActiveById').mockResolvedValue(event);
    await act(async () => { renderer = create(<MapScreen />); await Promise.resolve(); });
    await act(async () => {
      receive?.(`onmap://open/road_event/${event.id}?cityId=balakovo`);
      await Promise.resolve();
    });
    const map = renderer.root.findByProps({testID: 'map-screen-map'});
    expect(map.props.events).toContainEqual(event);
    expect(map.props.partnerPoints).toEqual([]);
  });

  it('keeps event query bounds stable during a nearby map pan', () => {
    act(() => { renderer = create(<MapScreen />); });
    const map = renderer.root.findByProps({testID: 'map-screen-map'});
    act(() => map.props.onViewportChange([47.78, 52.01, 47.82, 52.05]));
    const firstBounds = (useRoadEvents as jest.Mock).mock.lastCall?.[1];
    act(() => map.props.onViewportChange([47.79, 52.02, 47.83, 52.06]));
    expect((useRoadEvents as jest.Mock).mock.lastCall?.[1]).toBe(firstBounds);
    expect((usePartnerPlacements as jest.Mock).mock.lastCall?.[0]).toBe('balakovo');
    expect((usePartnerPlacements as jest.Mock).mock.lastCall?.[1]).toEqual(
      [
        require('../../shared/config/cities').balakovoCity.coverageBounds.west,
        require('../../shared/config/cities').balakovoCity.coverageBounds.south,
        require('../../shared/config/cities').balakovoCity.coverageBounds.east,
        require('../../shared/config/cities').balakovoCity.coverageBounds.north,
      ],
    );
  });

  it('keeps partner points separate from RoadEvent and opens the selected partner card', () => {
    const record = jest.spyOn(partnerPlacementRepository, 'recordInteraction').mockResolvedValue(undefined);
    const point = {
      id: 'partner-1', cityId: 'balakovo', title: 'Мастерская', category: 'Сервис',
      description: null, displayAddress: null, coordinates: {longitude: 47.8, latitude: 52.02},
      startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z',
      imageUrl: null, promoCode: null, contacts: [{type: 'PHONE', label: 'Позвонить', value: '+79990000000', displayOrder: 0}],
    };
    const response = parsePartnerPlacements({
      cityId: 'balakovo', points: [point],
      banner: {
        id: 'banner-1', cityId: 'balakovo', title: 'Партнёр рядом',
        partnerPointId: point.id, text: 'Ремонт автомобилей',
        button: {label: 'Подробнее', url: 'https://example.com/'},
        startsAt: point.startsAt, endsAt: point.endsAt,
      },
    }, 'balakovo');
    (usePartnerPlacements as jest.Mock).mockReturnValue({
      data: response,
    });
    act(() => { renderer = create(<MapScreen />); });
    const map = renderer.root.findByProps({testID: 'map-screen-map'});
    expect(map.props.events).toEqual([]);
    expect(map.props.partnerPoints).toEqual(response.points);
    expect(renderer.root.findAllByType(View).some(node => node.props.testID === 'partner-banner')).toBe(true);
    act(() => map.props.onPartnerPointPress(response.points[0]));
    expect(renderer.root.findByProps({testID: 'partner-point-sheet'}).props.point).toEqual(response.points[0]);
    expect(record).toHaveBeenCalledWith('POINT_OPEN', point.id);
    act(() => renderer.update(<MapScreen />));
    expect(record).toHaveBeenCalledTimes(1);
    act(() => renderer.root.findByProps({testID: 'map-screen-map'}).props.onPartnerPointPress(response.points[0]));
    expect(record).toHaveBeenCalledTimes(1);
    record.mockRestore();
  });

  it('asks before discarding an unfinished event report', () => {
    useReportEventStore.setState({
      isOpen: true,
      step: 'CONFIRM',
      selectedType: 'ACCIDENT',
      coordinate: [47.8, 52.02],
    });
    act(() => {
      renderer = create(<MapScreen />);
    });

    act(() => {
      renderer.root.findByProps({testID: 'report-sheet'}).props.onClose();
    });
    expect(renderer.root.findByType(Modal).props.visible).toBe(true);
    expect(useReportEventStore.getState().isOpen).toBe(true);

    act(() => renderer.root.findByProps({testID: 'report-discard-exit'}).props.onPress());
    expect(useReportEventStore.getState().isOpen).toBe(false);
  });

  it('moves the unpublished point with map panning without moving live location', () => {
    useReportEventStore.setState({
      isOpen: true,
      step: 'CONFIRM',
      selectedType: 'ROAD_PATROL',
      coordinate: [47.8, 52.02],
      locationSource: 'CURRENT_LOCATION',
      locationStatus: 'READY',
    });
    act(() => { renderer = create(<MapScreen />); });
    const map = renderer.root.findByProps({testID: 'map-screen-map'});
    expect(map.props.placementType).toBe('ROAD_PATROL');
    expect(renderer.root.findByProps({testID: 'report-sheet'}).props.visible).toBe(false);
    act(() => map.props.onPlacementCenterChange([47.81, 52.03]));
    expect(useReportEventStore.getState().coordinate).toEqual([47.81, 52.03]);
    expect(useReportEventStore.getState().locationSource).toBe('MAP_LONG_PRESS');
  });

  it('keeps the draft event coordinate independent from live user movement', () => {
    useReportEventStore.setState({
      isOpen: true,
      step: 'CONFIRM',
      selectedType: 'ACCIDENT',
      coordinate: [47.8, 52.02],
      locationSource: 'MAP_LONG_PRESS',
      locationStatus: 'MANUAL',
      locationAccuracy: null,
    });
    (useUserLocation as jest.Mock).mockReturnValue({
      permission: 'granted',
      coordinate: [47.81, 52.03],
      accuracy: 12,
      timestamp: Date.now(),
      stale: false,
    });

    act(() => {
      renderer = create(<MapScreen />);
    });
    let map = renderer.root.findByProps({testID: 'map-screen-map'});
    expect(map.props.liveUserLocation.coordinate).toEqual([47.81, 52.03]);
    expect(map.props.draftCoordinate).toEqual([47.8, 52.02]);

    (useUserLocation as jest.Mock).mockReturnValue({
      permission: 'granted',
      coordinate: [47.82, 52.04],
      accuracy: 8,
      timestamp: Date.now() + 1_000,
      stale: false,
    });
    act(() => {
      renderer.update(<MapScreen />);
    });
    map = renderer.root.findByProps({testID: 'map-screen-map'});
    expect(map.props.liveUserLocation.coordinate).toEqual([47.82, 52.04]);
    expect(map.props.draftCoordinate).toEqual([47.8, 52.02]);
  });
});
