import React, {useEffect, useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {env} from '../../../shared/config/env';
import {colors, radius} from '../../../shared/theme';
import {isPartnerImagePath} from '../api/partnerPlacementRepository';

interface Props { imageUrl: string | null; size: number; selected?: boolean; accentColor?: string }

export const PartnerArtwork = ({imageUrl, size, selected = false, accentColor = colors.brandForest}: Props) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  const uri = isPartnerImagePath(imageUrl) && env.apiBaseUrl ? `${env.apiBaseUrl}${imageUrl}` : null;
  return (
    <View testID="partner-artwork" style={[styles.frame, {width: size, height: size, borderRadius: Math.min(radius[14], size / 3), borderColor: accentColor}, selected && styles.selected]}>
      {uri && !failed ? (
        <Image testID="partner-artwork-image" source={{uri}} resizeMode="contain" onError={() => setFailed(true)} style={{width: size, height: size}} />
      ) : (
        <Text testID="partner-artwork-fallback" style={[styles.letter, {fontSize: size * 0.48, lineHeight: size * 0.68, color: accentColor}]}>П</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surfaceCream, borderWidth: 1.5, borderColor: colors.brandForest},
  selected: {borderWidth: 2.5, borderColor: colors.brandLeaf},
  letter: {fontWeight: '800', color: colors.brandLeaf},
});
