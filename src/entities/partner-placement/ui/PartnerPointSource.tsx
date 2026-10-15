import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Marker} from '@maplibre/maplibre-react-native';
import type {PartnerPoint} from '../model/partnerPlacement';
import {colors, shadows} from '../../../shared/theme';
import {PartnerArtwork} from './PartnerArtwork';
import {getPartnerAccentColor} from '../lib/partnerAppearance';

interface Props {
  points: PartnerPoint[];
  selectedPointId?: string;
  onPointPress: (point: PartnerPoint) => void;
}

export const PartnerPointSource = ({points, selectedPointId, onPointPress}: Props) => (
  <>
    {points.map(point => (
      <Marker
        key={point.id}
        id={`partner-point-marker-${point.id}`}
        lngLat={[point.coordinates.longitude, point.coordinates.latitude]}
        anchor="bottom"
      >
        <Pressable
          testID={`partner-point-${point.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Партнёрская точка: ${point.title}`}
          onPress={() => onPointPress(point)}
          style={styles.touchTarget}
        >
          <View style={styles.marker}>
            <PartnerArtwork imageUrl={point.imageUrl} size={36} selected={selectedPointId === point.id} accentColor={getPartnerAccentColor(point.appearance)} />
          </View>
          <View testID={`partner-point-tip-${point.id}`} style={[styles.tip, {borderColor: getPartnerAccentColor(point.appearance)}]} />
        </Pressable>
      </Marker>
    ))}
  </>
);

const styles = StyleSheet.create({
  touchTarget: {width: 48, height: 52, alignItems: 'center', justifyContent: 'flex-start'},
  marker: {
    ...shadows.floating,
  },
  tip: {
    width: 7,
    height: 7,
    marginTop: -4,
    transform: [{rotate: '45deg'}],
    backgroundColor: colors.surfaceCream,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.brandForest,
  },
});
