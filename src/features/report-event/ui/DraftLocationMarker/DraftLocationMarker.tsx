import React from 'react';

import {
  View,
} from 'react-native';

import {
  Marker,
} from '@maplibre/maplibre-react-native';

import {styles} from './DraftLocationMarker.styles';

interface DraftLocationMarkerProps {
  coordinate: [
    number,
    number,
  ];
}

export const DraftLocationMarker = ({
  coordinate,
}: DraftLocationMarkerProps) => {
  return (
    <Marker
      id="report-draft-location"
      lngLat={coordinate}
      anchor="bottom">
      <View
        pointerEvents="none"
        collapsable={false}
        style={styles.container}>
        <View
          style={styles.marker}>
          <View
            style={styles.center}
          />
        </View>

        <View
          style={styles.tail}
        />
      </View>
    </Marker>
  );
};