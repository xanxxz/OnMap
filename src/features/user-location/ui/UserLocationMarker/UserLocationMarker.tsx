import React from 'react';

import {Text, View} from 'react-native';

import {Marker} from '@maplibre/maplibre-react-native';

import {styles} from './UserLocationMarker.styles';

interface UserLocationMarkerProps {
  coordinate: [number, number];
  accuracy: number | null;
  stale: boolean;
}

export const UserLocationMarker = ({
  coordinate,
  accuracy,
  stale,
}: UserLocationMarkerProps) => {
  const approximate = accuracy !== null && accuracy > 40;

  return (
    <Marker
      id="onmap-live-user-location"
      lngLat={coordinate}
      anchor="center"
      offset={[0, -11]}
    >
      <View
        accessible
        accessibilityLabel={
          stale
            ? 'Последнее известное местоположение, данные устарели'
            : approximate
            ? 'Моё местоположение определено приблизительно'
            : 'Моё текущее местоположение'
        }
        pointerEvents="none"
        collapsable={false}
        style={styles.container}
      >
        <View style={styles.label}>
          <Text style={styles.labelText}>
            {stale ? 'Последняя позиция' : 'Вы здесь'}
          </Text>
        </View>
        <View
          style={[
            styles.accuracyHalo,
            (approximate || stale) && styles.accuracyHaloUncertain,
            stale && styles.stale,
          ]}
        >
          <View style={[styles.dot, stale && styles.dotStale]}>
            <View style={styles.dotCenter} />
          </View>
        </View>
      </View>
    </Marker>
  );
};
