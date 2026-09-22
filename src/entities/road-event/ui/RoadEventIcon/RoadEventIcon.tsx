import React from 'react';

import {
  RoadEventType,
} from '../../model/roadEvent';

import {
  ROAD_EVENT_META,
} from '../../model/roadEventMeta';

import {EventMarker} from '../EventMarker/EventMarker';

interface RoadEventIconProps {
  type: RoadEventType;
}

export const RoadEventIcon = ({
  type,
}: RoadEventIconProps) => {
  const meta =
    ROAD_EVENT_META[type];

  return <EventMarker type={type} compact accessibilityLabel={meta.label} />;
};
