import React from 'react';

import {
  Pressable,
  Text,
  View,
} from 'react-native';

import {styles} from './MapControls.styles';

interface MapControlsProps {
  locationAvailable: boolean;

  onZoomIn: () => void;

  onZoomOut: () => void;

  onLocate: () => void;
}

export const MapControls = ({
  locationAvailable,
  onZoomIn,
  onZoomOut,
  onLocate,
}: MapControlsProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.zoomGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Приблизить карту"
          onPress={onZoomIn}
          style={({pressed}) => [
            styles.control,

            pressed &&
              styles.controlPressed,
          ]}>
          <Text style={styles.zoomText}>
            +
          </Text>
        </Pressable>

        <View
          style={styles.divider}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отдалить карту"
          onPress={onZoomOut}
          style={({pressed}) => [
            styles.control,

            pressed &&
              styles.controlPressed,
          ]}>
          <Text style={styles.zoomText}>
            −
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Показать моё местоположение"
        disabled={!locationAvailable}
        onPress={onLocate}
        style={({pressed}) => [
          styles.locationButton,

          !locationAvailable &&
            styles.locationButtonDisabled,

          pressed &&
            locationAvailable &&
            styles.controlPressed,
        ]}>
        <View style={styles.targetOuter}>
          <View
            style={styles.targetInner}
          />
        </View>
      </Pressable>
    </View>
  );
};