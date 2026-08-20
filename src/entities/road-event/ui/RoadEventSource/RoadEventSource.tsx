import React, {
  useMemo,
  useRef,
} from 'react';

import {
  NativeSyntheticEvent,
} from 'react-native';

import {
  FilterSpecification,
  GeoJSONSource,
  GeoJSONSourceRef,
  Images,
  Layer,
  PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';

import {
  ROAD_EVENT_MAP_IMAGES,
} from '../../lib/roadEventIcons';

import {
  roadEventsToGeoJson,
} from '../../lib/roadEventGeoJson';

import {
  RoadEvent,
} from '../../model/roadEvent';

import {
  clusterCirclePaint,
  clusterIconLayout,
  eventCirclePaint,
  eventIconLayout,
  selectedEventPaint,
} from './RoadEventSource.styles';

interface RoadEventSourceProps {
  events: RoadEvent[];

  selectedEventId?: string;

  onEventPress: (
    event: RoadEvent,
  ) => void;

  onClusterPress: (
    coordinate: [
      number,
      number,
    ],

    expansionZoom: number,
  ) => void;
}

const CLUSTER_FILTER:
  FilterSpecification = [
    'has',
    'point_count',
  ];

const EVENT_FILTER:
  FilterSpecification = [
    'all',

    [
      '!',
      [
        'has',
        'point_count',
      ],
    ],

    [
      'has',
      'eventId',
    ],
  ];

const getPointCoordinate = (
  feature:
    PressEventWithFeatures['features'][number],
):
  | [number, number]
  | null => {
  if (
    feature.geometry.type !==
    'Point'
  ) {
    return null;
  }

  const coordinates =
    feature.geometry.coordinates;

  if (
    !Array.isArray(coordinates) ||
    typeof coordinates[0] !==
      'number' ||
    typeof coordinates[1] !==
      'number'
  ) {
    return null;
  }

  return [
    coordinates[0],
    coordinates[1],
  ];
};

export const RoadEventSource = ({
  events,
  selectedEventId,
  onEventPress,
  onClusterPress,
}: RoadEventSourceProps) => {
  const sourceRef =
    useRef<GeoJSONSourceRef>(
      null,
    );

  const data = useMemo(
    () =>
      roadEventsToGeoJson(
        events,
      ),
    [events],
  );

  const selectedFilter =
    useMemo<FilterSpecification>(
      () => [
        '==',

        [
          'get',
          'eventId',
        ],

        selectedEventId ??
          '__none__',
      ],
      [selectedEventId],
    );

  const handlePress = async (
    event:
      NativeSyntheticEvent<PressEventWithFeatures>,
  ) => {
    event.stopPropagation();

    const feature =
      event.nativeEvent
        .features?.[0];

    if (!feature) {
      return;
    }

    const coordinate =
      getPointCoordinate(
        feature,
      );

    if (!coordinate) {
      return;
    }

    const properties =
      feature.properties ?? {};

    const rawClusterId =
      properties.cluster_id;

    const clusterId =
      typeof rawClusterId ===
      'number'
        ? rawClusterId
        : Number(rawClusterId);

    if (
      Number.isFinite(
        clusterId,
      )
    ) {
      try {
        const expansionZoom =
          await sourceRef.current?.getClusterExpansionZoom(
            clusterId,
          );

        if (
          typeof expansionZoom ===
          'number'
        ) {
          onClusterPress(
            coordinate,
            expansionZoom,
          );
        }
      } catch (error) {
        console.warn(
          '[RoadRadar] Failed to expand cluster',
          error,
        );
      }

      return;
    }

    const eventId =
      properties.eventId;

    if (
      typeof eventId !==
      'string'
    ) {
      return;
    }

    const roadEvent =
      events.find(
        item =>
          item.id === eventId,
      );

    if (!roadEvent) {
      return;
    }

    onEventPress(
      roadEvent,
    );
  };

  return (
    <>
      <Images
        images={
          ROAD_EVENT_MAP_IMAGES
        }
      />

      <GeoJSONSource
        ref={sourceRef}
        id="road-events-source"
        data={data}
        cluster
        clusterRadius={52}
        clusterMinPoints={2}
        clusterMaxZoom={15}
        hitbox={{
          top: 14,
          right: 14,
          bottom: 14,
          left: 14,
        }}
        onPress={event => {
          void handlePress(
            event,
          );
        }}>
        <Layer
          id="road-events-selected"
          type="circle"
          filter={
            selectedFilter
          }
          paint={
            selectedEventPaint
          }
        />

        <Layer
          id="road-events-clusters"
          type="circle"
          filter={
            CLUSTER_FILTER
          }
          paint={
            clusterCirclePaint
          }
        />

        <Layer
          id="road-events-cluster-icons"
          type="symbol"
          filter={
            CLUSTER_FILTER
          }
          layout={
            clusterIconLayout
          }
        />

        <Layer
          id="road-events-points"
          type="circle"
          filter={
            EVENT_FILTER
          }
          paint={
            eventCirclePaint
          }
        />

        <Layer
          id="road-events-icons"
          type="symbol"
          filter={
            EVENT_FILTER
          }
          layout={
            eventIconLayout
          }
        />
      </GeoJSONSource>
    </>
  );
};