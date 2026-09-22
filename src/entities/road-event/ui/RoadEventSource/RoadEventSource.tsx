import React, {useMemo} from 'react';

import {NativeSyntheticEvent} from 'react-native';

import {
  FilterSpecification,
  GeoJSONSource,
  Layer,
  Marker,
  PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';

import {formatEventTime} from '../../lib/formatEventTime';
import {
  clusteredRoadEventsToGeoJson,
  telegramLineEventsToGeoJson,
  tomTomLineEventsToGeoJson,
} from '../../lib/roadEventGeoJson';
import {RoadEvent} from '../../model/roadEvent';
import {EventMarker} from '../EventMarker/EventMarker';

import {
  approximateAreaHaloPaint,
  selectedTomTomLinePaint,
  selectedTelegramApproximateLinePaint,
  telegramApproximateLinePaint,
  telegramApproximateOuterLinePaint,
  tomTomLinePaint,
} from './RoadEventSource.styles';

interface RoadEventSourceProps {
  events: RoadEvent[];
  selectedEventId?: string;
  onEventPress: (event: RoadEvent) => void;
}

const EVENT_FILTER: FilterSpecification = ['has', 'eventId'];

const getEventCoordinate = (event: RoadEvent): [number, number] | null => {
  if (event.source === 'USER' || event.source === 'TELEGRAM') {
    return event.coordinate;
  }

  if (event.geometry.type === 'Point') {
    return event.geometry.coordinates;
  }

  return null;
};

const getEventTimestamp = (event: RoadEvent): string => {
  if (event.source === 'TOMTOM') {
    return event.updatedAt ?? event.startTime ?? event.fetchedAt;
  }

  return event.createdAt;
};

const isEventDoubtful = (event: RoadEvent): boolean => {
  if (event.source === 'TOMTOM') {
    return false;
  }

  const confirmations = event.confirmationCount ?? 0;
  const rejections = event.rejectionCount ?? 0;

  return rejections >= 2 && rejections > confirmations;
};

export const buildEventMarkerAccessibilityLabel = (
  event: RoadEvent,
): string => {
  const time = formatEventTime(getEventTimestamp(event));
  const location =
    event.source === 'TELEGRAM' && event.locationLabel
      ? event.locationLabel
      : null;

  return [event.title, location, time]
    .filter((value): value is string => Boolean(value))
    .join(', ');
};

export const RoadEventSource = ({
  events,
  selectedEventId,
  onEventPress,
}: RoadEventSourceProps) => {
  const pointData = useMemo(() => clusteredRoadEventsToGeoJson(events), [events]);
  const tomTomLineData = useMemo(
    () => tomTomLineEventsToGeoJson(events),
    [events],
  );
  const telegramLineData = useMemo(
    () => telegramLineEventsToGeoJson(events),
    [events],
  );

  const selectedFilter = useMemo<FilterSpecification>(
    () => ['==', ['get', 'eventId'], selectedEventId ?? '__none__'],
    [selectedEventId],
  );

  const handleLinePress = (
    event: NativeSyntheticEvent<PressEventWithFeatures>,
  ) => {
    event.stopPropagation();
    const eventId = event.nativeEvent.features?.[0]?.properties?.eventId;

    if (typeof eventId !== 'string') {
      return;
    }

    const roadEvent = events.find(item => item.id === eventId);
    if (roadEvent) {
      onEventPress(roadEvent);
    }
  };

  return (
    <>
      <GeoJSONSource
        id="telegram-road-event-lines-source"
        data={telegramLineData}
        hitbox={{top: 18, right: 18, bottom: 18, left: 18}}
        onPress={handleLinePress}
      >
        <Layer
          id="telegram-road-event-lines-outer"
          type="line"
          paint={telegramApproximateOuterLinePaint}
        />
        <Layer
          id="telegram-road-event-lines"
          type="line"
          paint={telegramApproximateLinePaint}
        />
        <Layer
          id="telegram-road-event-lines-selected"
          type="line"
          filter={selectedFilter}
          paint={selectedTelegramApproximateLinePaint}
        />
      </GeoJSONSource>

      <GeoJSONSource
        id="tomtom-road-event-lines-source"
        data={tomTomLineData}
        hitbox={{top: 14, right: 14, bottom: 14, left: 14}}
        onPress={handleLinePress}
      >
        <Layer
          id="tomtom-road-event-lines"
          type="line"
          paint={tomTomLinePaint}
        />
        <Layer
          id="tomtom-road-event-lines-selected"
          type="line"
          filter={selectedFilter}
          paint={selectedTomTomLinePaint}
        />
      </GeoJSONSource>

      <GeoJSONSource id="road-events-area-halo-source" data={pointData}>
        <Layer
          id="road-events-approximate-area-halo"
          type="circle"
          filter={[
            'all',
            EVENT_FILTER,
            ['==', ['get', 'source'], 'TELEGRAM'],
            ['==', ['get', 'locationPrecision'], 'AREA'],
          ]}
          paint={approximateAreaHaloPaint}
        />
      </GeoJSONSource>

      {events.map(event => {
        const coordinate = getEventCoordinate(event);
        if (!coordinate) {
          return null;
        }

        return (
          <Marker
            key={event.id}
            id={`road-event-marker-${event.id}`}
            lngLat={coordinate}
            anchor="center"
          >
            <EventMarker
              type={event.type}
              status={event.source === 'TOMTOM' ? undefined : event.status}
              selected={event.id === selectedEventId}
              doubtful={isEventDoubtful(event)}
              accessibilityLabel={buildEventMarkerAccessibilityLabel(event)}
              onPress={() => onEventPress(event)}
            />
          </Marker>
        );
      })}
    </>
  );
};
