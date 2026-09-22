import React from 'react';

import {Text, View} from 'react-native';

import {Marker} from '@maplibre/maplibre-react-native';

import {ReportLocationStatus} from '../../model/reportEventDraft';

import {styles} from './DraftLocationMarker.styles';

interface DraftLocationMarkerProps {
  coordinate: [number, number];
  locationStatus: ReportLocationStatus;
}

export const DraftLocationMarker = ({
  coordinate,
  locationStatus,
}: DraftLocationMarkerProps) => {
  const approximate = locationStatus === 'APPROXIMATE';

  return (
    <Marker id="report-draft-location" lngLat={coordinate} anchor="bottom">
      <View
        accessible
        accessibilityLabel={
          approximate
            ? 'Точка события определена приблизительно'
            : 'Предварительная точка события'
        }
        pointerEvents="none"
        collapsable={false}
        style={styles.container}
      >
        <View style={styles.label}>
          <Text style={styles.labelText}>
            {approximate ? 'Проверьте точку' : 'Точка события'}
          </Text>
        </View>

        <View style={[styles.accuracyRing, approximate && styles.accuracyRingApproximate]}>
          <View style={styles.marker}>
            <View style={styles.crossHorizontal} />
            <View style={styles.crossVertical} />
            <View style={styles.center} />
          </View>
        </View>

        <View style={styles.anchorStem} />
      </View>
    </Marker>
  );
};
