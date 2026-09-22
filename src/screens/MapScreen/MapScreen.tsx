import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Linking, Text, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  cityBoundsToMapBounds,
  getAvailableCities,
} from '../../shared/config/cities';

import {
  resolveSelectedCity,
  useSelectedCityStore,
} from '../../shared/config/cities/useSelectedCityStore';

import { RoadEventFeedbackAction } from '../../entities/road-event/lib/roadEventFreshness';

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

import { useDpsActivitySummary } from '../../entities/road-event/model/useDpsActivitySummary';

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

import { requestFreshUserLocation } from '../../features/user-location/requestFreshUserLocation';

import {
  areMapBoundsEqual,
  isCoordinateWithinBounds,
  normalizeMapBounds,
} from '../../shared/lib/map/mapBounds';

import { MapBounds } from '../../shared/types/map';

import { EventDetailsSheet } from '../../widgets/EventDetailsSheet/EventDetailsSheet';

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

export const MapScreen = () => {
  const insets = useSafeAreaInsets();

  const roadMapRef = useRef<RoadMapRef>(null);

  const createSubmissionInFlight = useRef(false);

  const feedbackSubmissionInFlight = useRef(false);

  const locationRequestId = useRef(0);

  const [viewportBounds, setViewportBounds] = useState<MapBounds | null>(null);

  const selectedCityId = useSelectedCityStore(state => state.selectedCityId);

  const setSelectedCityId = useSelectedCityStore(
    state => state.setSelectedCityId,
  );

  const city = useMemo(
    () => resolveSelectedCity(selectedCityId),
    [selectedCityId],
  );

  useEffect(() => {
    setViewportBounds(null);
  }, [city.id]);

  const {
    data: events = [],

    isFetching: eventsFetching,

    isPending: eventsPending,

    isError: eventsError,

    refetch: refetchEvents,
  } = useRoadEvents(
    city.id,

    viewportBounds,
  );

  const realtimeStatus = useRoadEventRealtime(city.id);

  const {
    data: dpsActivity,
    isPending: dpsActivityLoading,
  } = useDpsActivitySummary(city.id);

  const availableCities = useMemo(() => getAvailableCities(), []);

  const activeTypes = useRoadEventFilterStore(state => state.activeTypes);

  const visibleEvents = useMemo(() => {
    if (activeTypes.length === 0) {
      return events;
    }

    return events.filter(event =>
      activeTypes.includes(getRoadEventFilterType(event)),
    );
  }, [activeTypes, events]);

  const {
    permission: locationPermission,

    coordinate: userCoordinate,
  } = useUserLocation();

  const selectedEventId = useMapUiStore(state => state.selectedEventId);

  const selectEvent = useMapUiStore(state => state.selectEvent);

  const clearSelectedEvent = useMapUiStore(state => state.clearSelectedEvent);

  const selectedEvent = useMemo(
    () => events.find(event => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
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

    const exists = events.some(event => event.id === selectedEventId);

    if (!exists) {
      clearSelectedEvent();
    }
  }, [clearSelectedEvent, events, eventsFetching, selectedEventId]);

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

  const reportCoordinate = useReportEventStore(state => state.coordinate);

  const reportLocationSource = useReportEventStore(
    state => state.locationSource,
  );

  const reportLocationStatus = useReportEventStore(
    state => state.locationStatus,
  );

  const reportLocationAccuracy = useReportEventStore(
    state => state.locationAccuracy,
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

    setViewportBounds(current => {
      if (areMapBoundsEqual(current, normalized)) {
        return current;
      }

      return normalized;
    });
  }, []);

  const reportLocationValid = reportCoordinate
    ? isCoordinateWithinBounds(
        reportCoordinate,

        cityBoundsToMapBounds(city.coverageBounds),
      )
    : false;

  const handleOpenReport = async () => {
    createRoadEvent.reset();

    clearSelectedEvent();

    openForLocationLookup();

    const requestId = locationRequestId.current + 1;
    locationRequestId.current = requestId;

    const result = await requestFreshUserLocation(locationPermission);

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

  const handleLongPress = (coordinate: [number, number]) => {
    createRoadEvent.reset();

    clearSelectedEvent();

    openFromMap(coordinate);
  };

  const handleEventPress = (event: RoadEvent) => {
    selectEvent(event.id);
  };

  const handleLocate = () => {
    if (!userCoordinate) {
      return;
    }

    roadMapRef.current?.focusCoordinate(userCoordinate);
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
      !reportCoordinate ||
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

      const event = await createRoadEvent.mutateAsync({
        cityId: city.id,

        type: reportType,

        title: meta.label,

        description: 'Добавлено пользователем.',

        coordinate: reportCoordinate,
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

  const handleCloseReport = () => {
    locationRequestId.current += 1;

    createRoadEvent.reset();

    closeReport();
  };

  const handleBackToType = () => {
    createRoadEvent.reset();

    backToType();
  };

  const handleSelectReportType = (type: RoadEventType) => {
    createRoadEvent.reset();

    selectReportType(type);
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
        selectedEventId={selectedEventId ?? undefined}
        draftCoordinate={reportOpen ? reportCoordinate : null}
        draftLocationStatus={reportLocationStatus}
        locationPermission={locationPermission}
        onEventPress={handleEventPress}
        onLongPressCoordinate={handleLongPress}
        onViewportChange={handleViewportChange}
      />

      <View
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
          dpsActivityLoading={dpsActivityLoading}
          eventCount={events.length}
          realtimeStatus={realtimeStatus}
          onSelectCity={setSelectedCityId}
        />
      </View>

      {creationNoticeVisible && mapDataStatus !== 'error' ? (
        <View
          pointerEvents="none"
          style={[
            styles.dataStatus,

            {
              top: insets.top + 106,
            },
          ]}
        >
          <MapSuccessNotice />
        </View>
      ) : mapDataStatus === 'loading' || mapDataStatus === 'error' ? (
        <View
          pointerEvents={mapDataStatus === 'error' ? 'box-none' : 'none'}
          style={[
            styles.dataStatus,

            {
              top: insets.top + 106,
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

      <View
        style={[
          styles.mapControls,

          {
            top: insets.top + 104,
          },
        ]}
      >
        <MapControls
          locationAvailable={userCoordinate !== null}
          onZoomIn={() => {
            roadMapRef.current?.zoomIn();
          }}
          onZoomOut={() => {
            roadMapRef.current?.zoomOut();
          }}
          onLocate={handleLocate}
        />
      </View>

      <View
        style={[
          styles.filters,

          {
            bottom: insets.bottom + 110,
          },
        ]}
      >
        <EventFilterBar />
      </View>

      <View
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
      </View>

      <View
        style={[
          styles.fab,

          {
            bottom: insets.bottom + 42,
          },
        ]}
      >
        <ReportEventButton onPress={handleOpenReport} />
      </View>

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

      <ReportEventSheet
        visible={reportOpen}
        step={reportStep}
        selectedType={reportType}
        coordinate={reportCoordinate}
        locationSource={reportLocationSource}
        locationStatus={reportLocationStatus}
        locationAccuracy={reportLocationAccuracy}
        locationValid={reportLocationValid}
        isSubmitting={createRoadEvent.isPending}
        submissionError={createErrorState}
        onClose={handleCloseReport}
        onBack={handleBackToType}
        onSelect={handleSelectReportType}
        onSubmit={handleSubmit}
        onOpenSettings={() => {
          Linking.openSettings().catch(() => undefined);
        }}
      />
    </View>
  );
};
