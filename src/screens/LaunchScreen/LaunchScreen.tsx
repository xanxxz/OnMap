import React from 'react';

import {ImageBackground, View} from 'react-native';

import Animated, {
  Easing,
  FadeIn,
  useReducedMotion,
} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';

import {OnMapBrand} from '../../shared/ui/OnMapBrand';
import {motion} from '../../shared/theme';

import {styles} from './LaunchScreen.styles';

export const LaunchScreen = () => {
  const reducedMotion = useReducedMotion();

  return (
    <ImageBackground
      resizeMode="cover"
      source={require('../../shared/assets/brand/editorial/onmap-splash-hero.webp')}
      style={styles.screen}
    >
      <View style={styles.atmosphere} />
      <SafeAreaView style={styles.safeArea}>
        <Animated.View
          entering={FadeIn.duration(
            reducedMotion ? 0 : motion.launchDurationMs,
          ).easing(Easing.out(Easing.cubic))}
          style={styles.brand}
        >
          <OnMapBrand showTagline />
        </Animated.View>
      </SafeAreaView>
    </ImageBackground>
  );
};
