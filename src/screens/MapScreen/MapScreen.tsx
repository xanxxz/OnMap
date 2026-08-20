import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Text,
  View,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  ACTIVE_CITY,
} from '../../shared/config/cities';

import {
  RoadEventFeedbackAction,
} from '../../entities/road-event/lib/roadEventFreshness';

import {
  RoadEvent,
} from '../../entities/road-event/model/roadEvent';

import {
  ROAD_EVENT_META,
} from '../../entities/road-event/model/roadEventMeta';

import {
  useRoadEventRealtime,
} from '../../entities/road-event/model/useRoadEventRealtime';

import {
  useRoadEvents,
} from '../../entities/road-event/model/useRoadEvents';

import {
  useRoadEventFilterStore,
} from '../../features/filter-events/model/useRoadEventFilterStore';

import {
  EventFilterBar,
} from '../../features/filter-events/ui/EventFilterBar/EventFilterBar';

import {
  MapControls,
} from '../../features/map-controls/ui/MapControls/MapControls';

import {
  useMapUiStore,
} from '../../features/map-interactions/model/useMapUiStore';

import {
  useRoadEventFeedback,
} from '../../features/road-event-feedback/model/useRoadEventFeedback';

import {
  useRoadEventFeedbackStore,
} from '../../features/road-event-feedback/model/useRoadEventFeedbackStore';

import {
  useCreateRoadEvent,
} from '../../features/report-event/model/useCreateRoadEvent';

import {
  useReportEventStore,
} from '../../features/report-event/model/useReportEventStore';

import {
  ReportEventButton,
} from '../../features/report-event/ui/ReportEventButton/ReportEventButton';

import {
  useUserLocation,
} from '../../features/user-location/useUserLocation';

import {
  env,
} from '../../shared/config/env';

import {
  areMapBoundsEqual,
  isCoordinateWithinBounds,
  normalizeMapBounds,
} from '../../shared/lib/map/mapBounds';

import {
  MapBounds,
} from '../../shared/types/map';

import {
  EventDetailsSheet,
} from '../../widgets/EventDetailsSheet/EventDetailsSheet';

import {
  ReportEventSheet,
} from '../../widgets/ReportEventSheet/ReportEventSheet';

import {
  RoadMap,
  RoadMapRef,
} from '../../widgets/RoadMap/RoadMap';

import {
  styles,
} from './MapScreen.styles';

export const MapScreen = () => {
  const insets =
    useSafeAreaInsets();

  const roadMapRef =
    useRef<RoadMapRef>(
      null,
    );

  const [
    viewportBounds,
    setViewportBounds,
  ] =
    useState<MapBounds | null>(
      null,
    );

  const {
    data: events = [],

    isFetching:
      eventsFetching,
  } = useRoadEvents(
    ACTIVE_CITY.id,

    viewportBounds,
  );

  useRoadEventRealtime(
    ACTIVE_CITY.id,
  );

  const activeTypes =
    useRoadEventFilterStore(
      state =>
        state.activeTypes,
    );

  const visibleEvents =
    useMemo(() => {
      if (
        activeTypes.length ===
        0
      ) {
        return events;
      }

      return events.filter(
        event =>
          activeTypes.includes(
            event.type,
          ),
      );
    }, [
      activeTypes,
      events,
    ]);

  const {
    permission:
      locationPermission,

    coordinate:
      userCoordinate,
  } = useUserLocation();

  const selectedEventId =
    useMapUiStore(
      state =>
        state.selectedEventId,
    );

  const selectEvent =
    useMapUiStore(
      state =>
        state.selectEvent,
    );

  const clearSelectedEvent =
    useMapUiStore(
      state =>
        state.clearSelectedEvent,
    );

  const selectedEvent =
    useMemo(
      () =>
        events.find(
          event =>
            event.id ===
            selectedEventId,
        ) ?? null,
      [
        events,
        selectedEventId,
      ],
    );

  const feedbackByEventId =
    useRoadEventFeedbackStore(
      state =>
        state.feedbackByEventId,
    );

  const selectedFeedback =
    selectedEventId
      ? feedbackByEventId[
          selectedEventId
        ] ?? null
      : null;

  const roadEventFeedback =
    useRoadEventFeedback();

  useEffect(() => {
    if (
      !selectedEventId ||
      eventsFetching
    ) {
      return;
    }

    const exists =
      events.some(
        event =>
          event.id ===
          selectedEventId,
      );

    if (!exists) {
      clearSelectedEvent();
    }
  }, [
    clearSelectedEvent,
    events,
    eventsFetching,
    selectedEventId,
  ]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    if (
      activeTypes.length ===
      0
    ) {
      return;
    }

    if (
      !activeTypes.includes(
        selectedEvent.type,
      )
    ) {
      clearSelectedEvent();
    }
  }, [
    activeTypes,
    clearSelectedEvent,
    selectedEvent,
  ]);

  const reportOpen =
    useReportEventStore(
      state =>
        state.isOpen,
    );

  const reportStep =
    useReportEventStore(
      state =>
        state.step,
    );

  const reportType =
    useReportEventStore(
      state =>
        state.selectedType,
    );

  const reportCoordinate =
    useReportEventStore(
      state =>
        state.coordinate,
    );

  const reportLocationSource =
    useReportEventStore(
      state =>
        state.locationSource,
    );

  const openFromCurrentLocation =
    useReportEventStore(
      state =>
        state.openFromCurrentLocation,
    );

  const openFromMap =
    useReportEventStore(
      state =>
        state.openFromMap,
    );

  const selectReportType =
    useReportEventStore(
      state =>
        state.selectType,
    );

  const backToType =
    useReportEventStore(
      state =>
        state.backToType,
    );

  const closeReport =
    useReportEventStore(
      state =>
        state.close,
    );

  const completeReport =
    useReportEventStore(
      state =>
        state.complete,
    );

  const createRoadEvent =
    useCreateRoadEvent();

  const handleViewportChange =
    useCallback(
      (
        bounds:
          MapBounds,
      ) => {
        const normalized =
          normalizeMapBounds(
            bounds,
          );

        setViewportBounds(
          current => {
            if (
              areMapBoundsEqual(
                current,
                normalized,
              )
            ) {
              return current;
            }

            return normalized;
          },
        );
      },
      [],
    );

  const reportLocationValid =
    reportCoordinate
      ? isCoordinateWithinBounds(
          reportCoordinate,

          ACTIVE_CITY.navigationBounds,
        )
      : false;

  const handleOpenReport =
    () => {
      clearSelectedEvent();

      openFromCurrentLocation(
        userCoordinate,
      );
    };

  const handleLongPress = (
    coordinate: [
      number,
      number,
    ],
  ) => {
    clearSelectedEvent();

    openFromMap(
      coordinate,
    );
  };

  const handleEventPress = (
    event:
      RoadEvent,
  ) => {
    selectEvent(
      event.id,
    );
  };

  const handleLocate =
    () => {
      if (!userCoordinate) {
        return;
      }

      void roadMapRef.current
        ?.focusCoordinate(
          userCoordinate,
        );
    };

  const handleFeedback =
    (
      action:
        RoadEventFeedbackAction,
    ) => {
      if (
        !selectedEvent ||
        roadEventFeedback.isPending
      ) {
        return;
      }

      if (
        selectedEvent.viewerRelation ===
        'CREATOR'
      ) {
        return;
      }

      if (
        selectedEvent.viewerRelation ===
          'CONFIRM' ||
        selectedEvent.viewerRelation ===
          'REJECT'
      ) {
        return;
      }

      if (
        selectedFeedback !==
        null
      ) {
        return;
      }

      roadEventFeedback.mutate({
        cityId:
          selectedEvent.cityId,

        eventId:
          selectedEvent.id,

        action,
      });
    };

  const handleSubmit =
    async () => {
      if (
        !reportType ||
        !reportCoordinate ||
        !reportLocationValid ||
        createRoadEvent.isPending
      ) {
        return;
      }

      const meta =
        ROAD_EVENT_META[
          reportType
        ];

      try {
        const event =
          await createRoadEvent
            .mutateAsync({
              cityId:
                ACTIVE_CITY.id,

              type:
                reportType,

              title:
                meta.label,

              description:
                'Добавлено пользователем.',

              coordinate:
                reportCoordinate,
            });

        completeReport();

        selectEvent(
          event.id,
        );
      } catch (error) {
        console.warn(
          '[RoadRadar] Failed to create road event',
          error,
        );
      }
    };

  const eventCountLabel =
    viewportBounds === null
      ? 'Определяем область'
      : eventsFetching
        ? `${visibleEvents.length} · обновление`
        : activeTypes.length > 0
          ? `${visibleEvents.length} из ${events.length}`
          : `${events.length} событий`;

  return (
    <View
      style={
        styles.container
      }>
      <RoadMap
        ref={
          roadMapRef
        }
        city={
          ACTIVE_CITY
        }
        events={
          visibleEvents
        }
        selectedEventId={
          selectedEventId ??
          undefined
        }
        draftCoordinate={
          reportOpen
            ? reportCoordinate
            : null
        }
        locationPermission={
          locationPermission
        }
        onEventPress={
          handleEventPress
        }
        onLongPressCoordinate={
          handleLongPress
        }
        onViewportChange={
          handleViewportChange
        }
      />

      <View
        pointerEvents="none"
        style={[
          styles.header,

          {
            top:
              insets.top +
              12,
          },
        ]}>
        <Text
          style={
            styles.city
          }>
          {
            ACTIVE_CITY.name
          }
        </Text>

        <Text
          style={
            styles.headerSubtitle
          }>
          Дорожная обстановка
        </Text>
      </View>

      {!env.hasMapTilerApiKey ? (
        <View
          pointerEvents="none"
          style={[
            styles.demoNotice,

            {
              top:
                insets.top +
                88,
            },
          ]}>
          <Text
            style={
              styles.demoNoticeText
            }>
            OpenFreeMap · dev
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.mapControls,

          {
            top:
              insets.top +
              118,
          },
        ]}>
        <MapControls
          locationAvailable={
            userCoordinate !==
            null
          }
          onZoomIn={() => {
            void roadMapRef.current
              ?.zoomIn();
          }}
          onZoomOut={() => {
            void roadMapRef.current
              ?.zoomOut();
          }}
          onLocate={
            handleLocate
          }
        />
      </View>

      <View
        style={[
          styles.filters,

          {
            bottom:
              insets.bottom +
              88,
          },
        ]}>
        <EventFilterBar />
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.eventCount,

          {
            bottom:
              insets.bottom +
              28,
          },
        ]}>
        <View
          style={[
            styles.liveDot,

            eventsFetching &&
              styles.liveDotUpdating,
          ]}
        />

        <Text
          style={
            styles.eventCountText
          }>
          {
            eventCountLabel
          }
        </Text>
      </View>

      <View
        style={[
          styles.fab,

          {
            bottom:
              insets.bottom +
              20,
          },
        ]}>
        <ReportEventButton
          onPress={
            handleOpenReport
          }
        />
      </View>

      <EventDetailsSheet
        event={
          selectedEvent
        }
        feedbackAction={
          selectedFeedback
        }
        isSubmitting={
          roadEventFeedback.isPending
        }
        onFeedback={
          handleFeedback
        }
        onClose={
          clearSelectedEvent
        }
      />

      <ReportEventSheet
        visible={
          reportOpen
        }
        step={
          reportStep
        }
        selectedType={
          reportType
        }
        coordinate={
          reportCoordinate
        }
        locationSource={
          reportLocationSource
        }
        locationValid={
          reportLocationValid
        }
        isSubmitting={
          createRoadEvent.isPending
        }
        onClose={
          closeReport
        }
        onBack={
          backToType
        }
        onSelect={
          selectReportType
        }
        onSubmit={
          handleSubmit
        }
      />
    </View>
  );
};