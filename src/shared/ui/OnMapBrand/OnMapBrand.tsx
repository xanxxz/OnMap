import React from 'react';

import {
  Image,
  ImageStyle,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import {styles} from './OnMapBrand.styles';

interface OnMapBrandProps {
  compact?: boolean;
  markStyle?: StyleProp<ImageStyle>;
  style?: StyleProp<ViewStyle>;
  showTagline?: boolean;
}

export const OnMapBrand = ({
  compact = false,
  markStyle,
  style,
  showTagline = false,
}: OnMapBrandProps) => (
  <View style={[styles.container, compact && styles.containerCompact, style]}>
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel="Логотип OnMap"
      resizeMode="contain"
      source={require('../../assets/brand/onmap-app-icon.png')}
      style={[styles.mark, compact && styles.markCompact, markStyle]}
    />
    <View style={styles.copy}>
      <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>
        OnMap
      </Text>
      {showTagline ? (
        <Text style={styles.tagline}>ДОРОГИ ОБЪЕДИНЯЮТ</Text>
      ) : null}
    </View>
  </View>
);
