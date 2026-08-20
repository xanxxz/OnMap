import React from 'react';

import {
  Image,
  View,
} from 'react-native';

import {
  ROAD_EVENT_ICON_SOURCE_BY_TYPE,
} from '../../lib/roadEventIcons';

import {
  RoadEventType,
} from '../../model/roadEvent';

import {
  ROAD_EVENT_META,
} from '../../model/roadEventMeta';

import {styles} from './RoadEventIcon.styles';

interface RoadEventIconProps {
  type: RoadEventType;
}

export const RoadEventIcon = ({
  type,
}: RoadEventIconProps) => {
  const meta =
    ROAD_EVENT_META[type];

  return (
    <View
      style={[
        styles.container,

        {
          backgroundColor:
            meta.color,
        },
      ]}>
      <Image
        source={
          ROAD_EVENT_ICON_SOURCE_BY_TYPE[
            type
          ]
        }
        resizeMode="contain"
        style={styles.icon}
      />
    </View>
  );
};