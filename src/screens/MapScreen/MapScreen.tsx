import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Alert, AppState, Linking, Modal, Pressable, Text, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsFocused } from '@react-navigation/native';

import {
  cityBoundsToMapBounds,
  getAvailableCities,
} from '../../shared/config/cities';

import {
  resolveSelectedCity,
  useSelectedCityStore,
} from '../../shared/config/cities/useSelectedCityStore';

import { RoadEventFeedbackAction } from '../../entities/road-event/model/roadEvent';

import {
  RoadEvent,
  RoadEventType,
} from '../../entities/road-event/model/roadEvent';

import {
  getCreateRoadEventErrorState,
  getFeedbackErrorState,
} from '../../entities/road-event/model/roadEventActionError';

import {
  getRoadEventFilterType,
  ROAD_EVENT_META,
} from '../../entities/road-event/model/roadEventMeta';

import { useRoadEventRealtime } from '../../entities/road-event/model/useRoadEventRealtime';

import { useRoadEvents } from '../../entities/road-event/model/useRoadEvents';
import { usePartnerPlacements } from '../../entities/partner-placement/model/usePartnerPlacements';
import { partnerPlacementRepository } from '../../entities/partner-placement/api/partnerPlacementRepository';
import {roadEventRepository} from '../../entities/road-event/api/httpRoadEventRepository';
import type {PartnerPoint} from '../../entities/partner-placement/model/partnerPlacement';
import {parsePushDeepLink, type PushTarget} from '../../features/notifications/pushDeepLink';
import {pushNative} from '../../features/notifications/pushNative';

import { useDpsActivitySummary } from '../../entities/road-event/model/useDpsActivitySummary';
import {
  useAcknowledgeRoadEventModerationNotice,
  useRoadEventModerationNotices,
} from '../../entities/road-event/model/useRoadEventModerationNotices';

import { useRoadEventFilterStore } from '../../features/filter-events/model/useRoadEventFilterStore';

import { EventFilterBar } from '../../features/filter-events/ui/EventFilterBar/EventFilterBar';

import { MapControls } from '../../features/map-controls/ui/MapControls/MapControls';

import { useMapUiStore } from '../../features/map-interactions/model/useMapUiStore';

import { useRoadEventFeedback } from '../../features/road-event-feedback/model/useRoadEventFeedback';

import { useRoadEventFeedbackStore } from '../../features/road-event-feedback/model/useRoadEventFeedbackStore';

import { useCreateRoadEvent } from '../../features/report-event/model/useCreateRoadEvent';

import { useReportEventStore } from '../../features/report-event/model/useReportEventStore';

import { ReportEventButton } from '../../features/report-event/ui/ReportEventButton/ReportEventButton';

import { useUserLocation } from '../../features/user-location/useUserLocation';
import {requestLocationPermission} from '../../features/user-location/useLocationPermission';

import { requestFreshUserLocation } from '../../features/user-location/requestFreshUserLocation';

import {
  expandMapBounds,
  isCoordinateWithinBounds,
  isViewportInsidePrefetch,
  normalizeMapBounds,
} from '../../shared/lib/map/mapBounds';

import { MapBounds } from '../../shared/types/map';

import { EventDetailsSheet } from '../../widgets/EventDetailsSheet/EventDetailsSheet';
import { PartnerPointSheet } from '../../widgets/PartnerPointSheet/PartnerPointSheet';

import { ReportEventSheet } from '../../widgets/ReportEventSheet/ReportEventSheet';

import { RoadMap, RoadMapRef } from '../../widgets/RoadMap/RoadMap';

import {
  formatRoadEventCount,
  MapStatusCard,
  MapSuccessNotice,
  resolveMapDataStatus,
} from './MapStatusCard';

import { MapHeader } from './MapHeader';

import { styles } from './MapScreen.styles';
import { SUPPORT_URL } from '../../shared/config/support';

export const MapScreen = () => {
  const insets = useSafeAreaInsets();

  const screenIsFocused = useIsFocused();

  const roadMapRef = useRef<RoadMapRef>(null);

  const createSubmissionInFlight = useRef(false);

  const feedbackSubmissionInFlight = useRef(false);

  const locationRequestId = useRef(0);

  const locationRequestAbortController = useRef<AbortController | null>(null);

  const locationSettingsRefreshPending = useRef(false);

  const [viewportBounds, setViewportBounds] = useState<MapBounds | null>(null);

  const [eventQueryBounds, setEventQueryBounds] = useState<MapBounds | null>(null);
  const [selectedPartnerPointId, setSelectedPartnerPointId] = useState<string | null>(null);
  const [deepLinkedEvent, setDeepLinkedEvent] = useState<RoadEvent | null>(null);
  const [deepLinkedPartnerPoint, setDeepLinkedPartnerPoint] = useState<PartnerPoint | null>(null);
  const [pendingPushTarget, setPendingPushTarget] = useState<PushTarget | null>(null);
  const pushRequestId = useRef(0);
  const lastPushUrl = useRef<{url: string; at: number} | null>(null);
  const selectEvent = useMapUiStore(state => state.selectEvent);
  const clearSelectedEvent = useMapUiStore(state => state.clearSelectedEvent);
  const showAllEventTypes = useRoadEventFilterStore(state => state.showAll);

  const selectedCityId = useSelectedCityStore(state => state.selectedCityId);

  const setSelectedCityId = useSelectedCityStore(
    state => state.setSelectedCityId,
  );

  const city = useMemo(
    () => resolveSelectedCity(selectedCityId),
    [selectedCityId],
  );

  const partnerCityBounds = useMemo(
    () => cityBoundsToMapBounds(city.coverageBounds),
    [city],
  );

  useEffect(() => {
    setViewportBounds(null);
    setEventQueryBounds(null);
    setSelectedPartnerPointId(null);
    setDeepLinkedEvent(null);
    setDeepLinkedPartnerPoint(null);
  }, [city.id]);

  useEffect(() => {
    const receive = (url: string | null) => {
      if (!url) return;
      if (lastPushUrl.current?.url === url && Date.now() - lastPushUrl.current.at < 2_000)
        return;
      const target = parsePushDeepLink(url);
      if (target) {
        lastPushUrl.current = {url, at: Date.now()};
        setPendingPushTarget(target);
      }
    };
    Linking.getInitialURL().then(receive).catch(() => undefined);
    pushNative.consumeInitialUrl().then(receive).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({url}) => receive(url));
    const offPush = pushNative.onOpen(receive);
    return () => { subscription.remove(); offPush(); };
  }, []);

  useEffect(() => {
    if (!pendingPushTarget) return;
    if (!getAvailableCities().some(item => item.id === pendingPushTarget.cityId)) {
      setPendingPushTarget(null);
      return;
    }
    if (city.id !== pendingPushTarget.cityId) {
      setSelectedCityId(pendingPushTarget.cityId);
      return;
    }
    const target = pendingPushTarget;
    const requestId = ++pushRequestId.current;
    setPendingPushTarget(null);
    const open = async () => {
      try {
        if (target.kind === 'ROAD_EVENT') {
          const event = await roadEventRepository.getActiveById(target.targetId, target.cityId);
          if (requestId !== pushRequestId.current) return;
          setDeepLinkedEvent(event);
          setSelectedPartnerPointId(null);
          showAllEventTypes();
          selectEvent(event.id);
          await roadMapRef.current?.focusCoordinate(event.coordinate);
        } else {
          const point = await partnerPlacementRepository.getActivePoint(target.targetId, target.cityId);
          if (requestId !== pushRequestId.current) return;
          setDeepLinkedPartnerPoint(point);
          clearSelectedEvent();
          setSelectedPartnerPointId(point.id);
          await roadMapRef.current?.focusCoordinate([point.coordinates.longitude, point.coordinates.latitude]);
        }
      } catch {
        if (requestId === pushRequestId.current) {
          Alert.alert('Метка недоступна', 'Событие завершилось или партнёрская точка больше не показывается.');
        }
      }
    };
    open().catch(() => undefined);
  }, [pendingPushTarget, city.id, setSelectedCityId, selectEvent, clearSelectedEvent, showAllEventTypes]);

  const {
    data: events = [],

    isFetching: eventsFetching,

    isPending: eventsPending,

    isPlaceholderData: eventsPlaceholderData,

    isError: eventsError,

    refetch: refetchEvents,
  } = useRoadEvents(
    city.id,

    eventQueryBounds,
  );

  const realtimeStatus = useRoadEventRealtime(city.id);

  const {data: partnerPlacements} = usePartnerPlacements(city.id, partnerCityBounds);
  const partnerPoints = useMemo(() => {
    const fetched = partnerPlacements?.points ?? [];
    return deepLinkedPartnerPoint && !fetched.some(point => point.id === deepLinkedPartnerPoint.id)
      ? [...fetched, deepLinkedPartnerPoint]
      : fetched;
  }, [partnerPlacements?.points, deepLinkedPartnerPoint]);
  const selectedPartnerPoint = partnerPoints.find(point => point.id === selectedPartnerPointId) ?? null;

  useEffect(() => {
    if (selectedPartnerPointId && partnerPlacements && !selectedPartnerPoint) {
      setSelectedPartnerPointId(null);
    }
  }, [partnerPlacements, selectedPartnerPoint, selectedPartnerPointId]);

  const { data: moderationNotices = [] } = useRoadEventModerationNotices();
  const acknowledgeModerationNotice = useAcknowledgeRoadEventModerationNotice();
  const shownModerationNoticeIds = useRef(new Set<string>());

  useEffect(() => {
    const notice = moderationNotices.find(
      item => !shownModerationNoticeIds.current.has(item.id),
    );
    if (!notice) return;

    shownModerationNoticeIds.current.add(notice.id);
    const acknowledge = () => acknowledgeModerationNotice.mutate(notice.id);
    const supportDraft = `Обращение по скрытой метке OnMap. ID события: ${notice.eventId}`;
    const supportUrl = `${SUPPORT_URL}?text=${encodeURIComponent(supportDraft)}`;
    const noticeCopy =
      notice.moderationState === 'RESTORED'
        ? 'Метка проверена и восстановлена.'
        : notice.moderationState === 'EXPIRED' || notice.eventStatus === 'RESOLVED'
          ? 'Метка была отправлена на проверку, но срок события истёк.'
          : 'Метка временно скрыта и отправлена на проверку. Если считаете, что это ошибка, свяжитесь с поддержкой.';

    Alert.alert(
      'Обновление по вашей метке',
      noticeCopy,
      [
        {
          text: 'Связаться с поддержкой',
          onPress: () => {
            acknowledge();
            Linking.openURL(supportUrl).catch(() =>
              Alert.alert('Поддержка OnMap', supportUrl),
            );
          },
        },
        { text: 'Понятно', onPress: acknowledge },
      ],
      { cancelable: false },
    );
  }, [acknowledgeModerationNotice, moderationNotices]);

  const {
    data: dpsActivity,
    isPending: dpsActivityLoading,
    isFetching: dpsActivityFetching,
    isError: dpsActivityError,
    refetch: refetchDpsActivity,
  } = useDpsActivitySummary(city.id);

  const availableCities = useMemo(() => getAvailableCities(), []);

  const activeTypes = useRoadEventFilterStore(state => state.activeTypes);

  const allEvents = useMemo(() =>
    deepLinkedEvent && !events.some(event => event.id === deepLinkedEvent.id)
      ? [...events, deepLinkedEvent]
      : events,
    [events, deepLinkedEvent],
  );
  const visibleEvents = useMemo(() => {
    if (activeTypes.length === 0) {
      return allEvents;
    }

    return allEvents.filter(event =>
      activeTypes.includes(getRoadEventFilterType(event)),
    );
  }, [activeTypes, allEvents]);

  const {
    permission: locationPermission,

    coordinate: userCoordinate,

    accuracy: userLocationAccuracy,

    stale: userLocationStale,
    unavailable: userLocationUnavailable,

    refreshPermission: refreshLocationPermission,
  } = useUserLocation(screenIsFocused);

  const selectedEventId = useMapUiStore(state => state.selectedEventId);

  const selectedEvent = useMemo(
    () => allEvents.find(event => event.id === selectedEventId) ?? null,
    [allEvents, selectedEventId],
  );

  const feedbackByEventId = useRoadEventFeedbackStore(
    state => state.feedbackByEventId,
  );

  const selectedFeedback = selectedEventId
    ? feedbackByEventId[selectedEventId] ?? null
    : null;

  const roadEventFeedback = useRoadEventFeedback();

  useEffect(() => {
    if (!selectedEventId || eventsFetching) {
      return;
    }

    const exists = allEvents.some(event => event.id === selectedEventId);

    if (!exists) {
      clearSelectedEvent();
    }
  }, [clearSelectedEvent, allEvents, eventsFetching, selectedEventId]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    if (activeTypes.length === 0) {
      return;
    }

    if (!activeTypes.includes(getRoadEventFilterType(selectedEvent))) {
      clearSelectedEvent();
    }
  }, [activeTypes, clearSelectedEvent, selectedEvent]);

  const reportOpen = useReportEventStore(state => state.isOpen);

  const reportStep = useReportEventStore(state => state.step);

  const reportType = useReportEventStore(state => state.selectedType);

  const placementActive = reportOpen && reportStep === 'CONFIRM' && reportType !== null;

  const reportCoordinate = useReportEventStore(state => state.coordinate);

  const reportLocationSource = useReportEventStore(
    state => state.locationSource,
  );

  const reportLocationStatus = useReportEventStore(
    state => state.locationStatus,
  );

  const openForLocationLookup = useReportEventStore(
    state => state.openForLocationLookup,
  );

  const setCurrentLocation = useReportEventStore(
    state => state.setCurrentLocation,
  );

  const setLocationFailure = useReportEventStore(
    state => state.setLocationFailure,
  );

  const setManualLocation = useReportEventStore(state => state.setManualLocation);

  const beginLocationLookup = useReportEventStore(state => state.beginLocationLookup);

  const [discardDialogVisible, setDiscardDialogVisible] = useState(false);

  const cancelPendingLocationRequest = useCallback(() => {
    if (!locationRequestAbortController.current) {
      return;
    }

    locationRequestId.current += 1;
    locationRequestAbortController.current.abort();
    locationRequestAbortController.current = null;

    if (useReportEventStore.getState().locationStatus === 'LOCATING') {
      setLocationFailure('UNAVAILABLE');
    }
  }, [setLocationFailure]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        cancelPendingLocationRequest();
      } else if (locationSettingsRefreshPending.current) {
        locationSettingsRefreshPending.current = false;
        refreshLocationPermission().catch(() => undefined);
      }
    });

    return () => {
      subscription.remove();
      cancelPendingLocationRequest();
    };
  }, [cancelPendingLocationRequest, refreshLocationPermission]);

  useEffect(() => {
    if (!screenIsFocused) {
      cancelPendingLocationRequest();
    }
  }, [cancelPendingLocationRequest, screenIsFocused]);

  const openFromMap = useReportEventStore(state => state.openFromMap);

  const selectReportType = useReportEventStore(state => state.selectType);

  const backToType = useReportEventStore(state => state.backToType);

  const closeReport = useReportEventStore(state => state.close);

  const completeReport = useReportEventStore(state => state.complete);

  const createRoadEvent = useCreateRoadEvent();

  const [creationNoticeVisible, setCreationNoticeVisible] = useState(false);

  useEffect(() => {
    if (!creationNoticeVisible) {
      return;
    }

    const timeout = setTimeout(() => {
      setCreationNoticeVisible(false);
    }, 3_200);

    return () => {
      clearTimeout(timeout);
    };
  }, [creationNoticeVisible]);

  const createErrorState = createRoadEvent.isError
    ? getCreateRoadEventErrorState(createRoadEvent.error)
    : null;

  const feedbackErrorState =
    roadEventFeedback.isError &&
    roadEventFeedback.variables?.eventId === selectedEventId
      ? getFeedbackErrorState(roadEventFeedback.error)
      : null;

  const feedbackPendingAction =
    roadEventFeedback.isPending &&
    roadEventFeedback.variables?.eventId === selectedEventId
      ? roadEventFeedback.variables.action
      : null;

  const mapDataStatus = resolveMapDataStatus({
    boundsReady: viewportBounds !== null,

    isPending: eventsPending,

    isError: eventsError,

    eventCount: events.length,
  });

  const handleViewportChange = useCallback((bounds: MapBounds) => {
    const normalized = normalizeMapBounds(bounds);

    setViewportBounds(current => current ?? normalized);
    setEventQueryBounds(current =>
      current && isViewportInsidePrefetch(normalized, current)
        ? current
        : expandMapBounds(normalized),
    );
  }, []);

  const reportLocationValid = reportCoordinate
    ? isCoordinateWithinBounds(
        reportCoordinate,

        cityBoundsToMapBounds(city.coverageBounds),
      )
    : false;

  const requestLocationForDraft = async () => {
    locationRequestAbortController.current?.abort();
    const abortController = new AbortController();
    locationRequestAbortController.current = abortController;

    const requestId = locationRequestId.current + 1;
    locationRequestId.current = requestId;

    const result = await requestFreshUserLocation(
      locationPermission,
      undefined,
      Date.now,
      undefined,
      abortController.signal,
    );

    if (locationRequestAbortController.current === abortController) {
      locationRequestAbortController.current = null;
    }

    if (requestId !== locationRequestId.current) {
      return;
    }

    if (result.status === 'READY' || result.status === 'APPROXIMATE') {
      setCurrentLocation(result.coordinate, result.accuracy, result.status);
      await roadMapRef.current?.focusCoordinate(result.coordinate);
      return;
    }

    setLocationFailure(result.status);
  };

  const handleOpenReport = async () => {
    createRoadEvent.reset();
    clearSelectedEvent();
    setSelectedPartnerPointId(null);
    openForLocationLookup();
    await requestLocationForDraft();
  };

  const handleUseMyLocation = async () => {
    beginLocationLookup();
    await requestLocationForDraft();
  };

  const handleLongPress = (coordinate: [number, number]) => {
    if (placementActive) {
      return;
    }

    createRoadEvent.reset();

    clearSelectedEvent();

    openFromMap(coordinate);
    roadMapRef.current?.focusCoordinate(coordinate);
  };

  const handleEventPress = (event: RoadEvent) => {
    setSelectedPartnerPointId(null);
    selectEvent(event.id);
  };

  const handleLocate = () => {
    if (!userCoordinate) {
      return;
    }

    roadMapRef.current?.focusCoordinate(userCoordinate);
  };

  const handleRetryLocate = async () => {
    const result = await requestFreshUserLocation('granted');
    if (result.status !== 'READY' && result.status !== 'APPROXIMATE') return false;
    roadMapRef.current?.focusCoordinate(result.coordinate);
    return true;
  };

  const handleContinueWithoutGps = () => {
    createRoadEvent.reset();
    clearSelectedEvent();
    setSelectedPartnerPointId(null);
    openForLocationLookup();
    setLocationFailure('UNAVAILABLE');
  };

  const handleOpenLocationSettings = async () => {
    locationSettingsRefreshPending.current = true;
    try {
      await Linking.openSettings();
    } catch (error) {
      locationSettingsRefreshPending.current = false;
      throw error;
    }
  };

  const handleFeedback = (action: RoadEventFeedbackAction) => {
    if (
      !selectedEvent ||
      (selectedEvent.source !== 'USER' &&
        !(
          selectedEvent.source === 'TELEGRAM' &&
          selectedEvent.type === 'ROAD_PATROL'
        )) ||
      feedbackSubmissionInFlight.current ||
      roadEventFeedback.isPending
    ) {
      return;
    }

    if (selectedEvent.viewerRelation === 'CREATOR') {
      return;
    }

    if (
      selectedEvent.viewerRelation === 'CONFIRM' ||
      selectedEvent.viewerRelation === 'REJECT'
    ) {
      return;
    }

    if (selectedFeedback !== null) {
      return;
    }

    roadEventFeedback.reset();

    feedbackSubmissionInFlight.current = true;

    roadEventFeedback.mutate(
      {
        cityId: selectedEvent.cityId,

        eventId: selectedEvent.id,

        action,
      },
      {
        onSettled: () => {
          feedbackSubmissionInFlight.current = false;
        },
      },
    );
  };

  const handleSubmit = async () => {
    if (
      !reportType ||
      !reportLocationValid ||
      createSubmissionInFlight.current ||
      createRoadEvent.isPending
    ) {
      return;
    }

    createSubmissionInFlight.current = true;

    const meta = ROAD_EVENT_META[reportType];

    try {
      setCreationNoticeVisible(false);

      let coordinate = reportCoordinate;
      if (reportLocationSource === 'MAP_LONG_PRESS') {
        try {
          coordinate = (await roadMapRef.current?.getCenter()) ?? reportCoordinate;
        } catch {
          // Preserve the last user-selected point while the map is reloading.
        }
      }
      if (!coordinate || !isCoordinateWithinBounds(coordinate, cityBoundsToMapBounds(city.coverageBounds))) {
        if (coordinate) {
          setManualLocation(coordinate);
        }
        return;
      }

      const event = await createRoadEvent.mutateAsync({
        cityId: city.id,

        type: reportType,

        title: meta.label,

        description: 'Добавлено пользователем.',

        coordinate,
      });

      completeReport();

      selectEvent(event.id);
      setCreationNoticeVisible(true);
    } catch {
      return;
    } finally {
      createSubmissionInFlight.current = false;
    }
  };

  const discardReport = () => {
    setDiscardDialogVisible(false);
    locationRequestId.current += 1;
    locationRequestAbortController.current?.abort();
    locationRequestAbortController.current = null;

    createRoadEvent.reset();

    closeReport();
  };

  const handleCloseReport = () => {
    if (reportType !== null) {
      setDiscardDialogVisible(true);
      return;
    }

    discardReport();
  };

  const handleBackToType = () => {
    createRoadEvent.reset();

    backToType();
  };

  const handleSelectReportType = (type: RoadEventType) => {
    createRoadEvent.reset();

    selectReportType(type);
  };

  const handlePlacementCenterChange = (coordinate: [number, number]) => {
    cancelPendingLocationRequest();
    setManualLocation(coordinate);
  };

  const eventCountLabel = eventsError
    ? 'События недоступны'
    : viewportBounds === null
    ? 'Определяем область'
    : eventsPending
    ? 'Загружаем события'
    : eventsFetching
    ? `${visibleEvents.length} · обновление`
    : activeTypes.length > 0
    ? `${visibleEvents.length} из ${events.length}`
    : formatRoadEventCount(events.length);

  return (
    <View style={styles.container}>
      <RoadMap
        key={city.id}
        ref={roadMapRef}
        city={city}
        events={visibleEvents}
        partnerPoints={partnerPoints}
        selectedPartnerPointId={selectedPartnerPointId ?? undefined}
        onPartnerPointPress={point => {
          clearSelectedEvent();
          if (selectedPartnerPointId !== point.id) {
            partnerPlacementRepository.recordInteraction('POINT_OPEN', point.id).catch(() => {});
          }
          setSelectedPartnerPointId(point.id);
        }}
        selectedEventId={selectedEventId ?? undefined}
        draftCoordinate={reportOpen ? reportCoordinate : null}
        draftLocationStatus={reportLocationStatus}
        placementType={placementActive ? reportType : null}
        onPlacementCenterChange={handlePlacementCenterChange}
        liveUserLocation={
          userCoordinate
            ? {
                coordinate: userCoordinate,
                accuracy: userLocationAccuracy,
                stale: userLocationStale,
              }
            : null
        }
        onEventPress={handleEventPress}
        onLongPressCoordinate={handleLongPress}
        onViewportChange={handleViewportChange}
      />

      {!placementActive ? <View
        style={[
          styles.header,

          {
            top: insets.top + 12,
          },
        ]}
      >
        <MapHeader
          city={city}
          cities={availableCities}
          dpsActivity={dpsActivity}
          dpsActivityLoading={dpsActivityFetching || dpsActivityLoading}
          dpsActivityError={dpsActivityError}
          onRetryDpsActivity={() => { refetchDpsActivity(); }}
          eventCount={events.length}
          eventsStatus={
            mapDataStatus === 'error'
              ? 'error'
              : mapDataStatus === 'loading' || eventsPlaceholderData
                ? 'loading'
                : 'success'
          }
          realtimeStatus={realtimeStatus}
          partnerBanner={partnerPlacements?.banner ?? null}
          partnerBannerVisible={screenIsFocused && !selectedPartnerPointId && !selectedEventId && !reportOpen}
          onPartnerBannerImpression={bannerId => {
            partnerPlacementRepository.recordInteraction('BANNER_IMPRESSION', bannerId).catch(() => {});
          }}
          onPartnerBannerPress={bannerId => {
            partnerPlacementRepository.recordInteraction('BANNER_CLICK', bannerId).catch(() => {});
          }}
          onSelectCity={setSelectedCityId}
        />
      </View> : null}

      {!placementActive && creationNoticeVisible && mapDataStatus !== 'error' ? (
        <View
          pointerEvents="none"
          style={[
            styles.dataStatus,

          {
            top: insets.top + (partnerPlacements?.banner ? 218 : 106),
            },
          ]}
        >
          <MapSuccessNotice />
        </View>
      ) : !placementActive && (mapDataStatus === 'loading' || mapDataStatus === 'error') ? (
        <View
          pointerEvents={mapDataStatus === 'error' ? 'box-none' : 'none'}
          style={[
            styles.dataStatus,

          {
            top: insets.top + (partnerPlacements?.banner ? 218 : 106),
            },
          ]}
        >
          <MapStatusCard
            status={mapDataStatus}
            isRetrying={eventsFetching}
            onRetry={
              mapDataStatus === 'error'
                ? () => {
                    refetchEvents();
                  }
                : undefined
            }
          />
        </View>
      ) : null}

      {!placementActive ? <View
        style={[
          styles.mapControls,

          {
            top: insets.top + 104,
          },
        ]}
      >
        <MapControls
          locationAvailable={userCoordinate !== null}
          locationPermission={locationPermission}
          onOpenLocationSettings={handleOpenLocationSettings}
          onRequestLocation={async () => {
            const granted = await requestLocationPermission();
            await refreshLocationPermission();
            return granted;
          }}
          onRetryLocation={handleRetryLocate}
          onContinueManually={handleContinueWithoutGps}
          locationUnavailable={userLocationUnavailable}
          locationMessage={
            locationPermission === 'denied' || locationPermission === 'blocked'
              ? 'Доступ к геопозиции выключен. Точку события можно поставить вручную.'
              : locationPermission === 'unavailable'
              ? 'Служба геолокации недоступна. Точку события можно поставить вручную.'
              : userLocationUnavailable
              ? 'Не удалось определить место. Проверьте точную геопозицию в настройках или поставьте точку вручную.'
              : null
          }
          onZoomIn={() => {
            roadMapRef.current?.zoomIn();
          }}
          onZoomOut={() => {
            roadMapRef.current?.zoomOut();
          }}
          onLocate={handleLocate}
        />
      </View> : null}

      {placementActive ? (
        <View
          testID="report-placement-actions"
          style={[styles.placementActions, {bottom: insets.bottom + 16}]}
        >
          <Text style={styles.placementTitle}>{ROAD_EVENT_META[reportType].label}</Text>
          <Text style={styles.placementHint}>
            {reportLocationStatus === 'LOCATING' && !reportCoordinate
              ? 'Определяем вашу позицию. Можно сдвинуть карту вручную.'
              : reportLocationStatus === 'APPROXIMATE'
              ? 'Точка приблизительная. Сдвиньте карту для уточнения.'
              : reportLocationStatus === 'PERMISSION_DENIED' || reportLocationStatus === 'UNAVAILABLE'
              ? 'Геопозиция недоступна. Сдвиньте карту, чтобы выбрать точку.'
              : 'Сдвигайте карту: метка в центре покажет место события.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Установить точку в моём текущем месте"
            onPress={handleUseMyLocation}
            style={styles.placementLocate}
          >
            <Text style={styles.placementLocateText}>Моё место</Text>
          </Pressable>
          {!reportLocationValid && reportCoordinate ? (
            <Text style={styles.placementError}>Выберите точку внутри рабочей зоны города.</Text>
          ) : null}
          {createErrorState ? (
            <Text style={styles.placementError}>
              {createErrorState.title}. {createErrorState.description}
            </Text>
          ) : null}
          <View style={styles.placementButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={handleCloseReport}
              style={({pressed}) => [styles.placementCancel, pressed && styles.placementPressed]}
            >
              <Text style={styles.placementCancelText}>Отмена</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{disabled: !reportLocationValid || createRoadEvent.isPending}}
              disabled={!reportLocationValid || createRoadEvent.isPending}
              onPress={handleSubmit}
              style={({pressed}) => [
                styles.placementSubmit,
                (!reportLocationValid || createRoadEvent.isPending) && styles.placementDisabled,
                pressed && styles.placementPressed,
              ]}
            >
              <Text style={styles.placementSubmitText}>
                {createRoadEvent.isPending ? 'Отправляем…' : 'Сообщить'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!placementActive ? <View
        style={[
          styles.filters,

          {
            bottom: insets.bottom + 110,
          },
        ]}
      >
        <EventFilterBar />
      </View> : null}

      {!placementActive ? <View
        pointerEvents="none"
        style={[
          styles.eventCount,

          {
            bottom: insets.bottom + 50,
          },
        ]}
      >
        <View
          style={[
            styles.liveDot,

            eventsFetching && styles.liveDotUpdating,

            eventsError && styles.liveDotError,
          ]}
        />

        <Text style={styles.eventCountText}>{eventCountLabel}</Text>
      </View> : null}

      {!placementActive ? <View
        style={[
          styles.fab,

          {
            bottom: insets.bottom + 42,
          },
        ]}
      >
        <ReportEventButton onPress={handleOpenReport} />
      </View> : null}

      <EventDetailsSheet
        event={selectedEvent}
        bottomInset={insets.bottom}
        feedbackAction={selectedFeedback}
        isSubmitting={roadEventFeedback.isPending}
        pendingAction={feedbackPendingAction}
        feedbackError={feedbackErrorState}
        onFeedback={handleFeedback}
        onClose={clearSelectedEvent}
      />

      <PartnerPointSheet
        point={selectedPartnerPoint}
        onContactPress={(pointId, contactId) => {
          partnerPlacementRepository.recordInteraction('CONTACT_CLICK', pointId, contactId).catch(() => {});
        }}
        onClose={() => setSelectedPartnerPointId(null)}
      />

      <ReportEventSheet
        visible={reportOpen && reportStep === 'TYPE'}
        step="TYPE"
        selectedType={reportType}
        coordinate={reportCoordinate}
        locationSource={reportLocationSource}
        locationStatus={reportLocationStatus}
        locationValid={reportLocationValid}
        isSubmitting={createRoadEvent.isPending}
        submissionError={createErrorState}
        onClose={handleCloseReport}
        onBack={handleBackToType}
        onSelect={handleSelectReportType}
        onSubmit={handleSubmit}
        onOpenSettings={handleOpenLocationSettings}
      />

      <Modal
        transparent
        animationType="fade"
        visible={discardDialogVisible}
        onRequestClose={() => setDiscardDialogVisible(false)}
      >
        <View style={styles.discardBackdrop}>
          <Pressable
            accessibilityLabel="Продолжить создание события"
            onPress={() => setDiscardDialogVisible(false)}
            style={styles.discardOutside}
          />
          <View style={styles.discardCard}>
            <Text style={styles.discardTitle}>Выйти без сообщения?</Text>
            <Text style={styles.discardDescription}>Выбранный тип и точка не сохранятся.</Text>
            <View style={styles.placementButtons}>
              <Pressable accessibilityRole="button" onPress={() => setDiscardDialogVisible(false)} style={styles.placementCancel}>
                <Text style={styles.placementCancelText}>Продолжить</Text>
              </Pressable>
              <Pressable testID="report-discard-exit" accessibilityRole="button" onPress={discardReport} style={styles.placementSubmit}>
                <Text style={styles.placementSubmitText}>Выйти</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
