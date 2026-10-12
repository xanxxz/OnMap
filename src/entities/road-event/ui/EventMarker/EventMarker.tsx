import React, {useEffect} from 'react';

import {Image, Pressable, View} from 'react-native';

import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {RoadEventReadType, RoadEventStatus} from '../../model/roadEvent';

import {getEventMarkerVisualConfig} from './eventMarkerVisualConfig';

import {styles} from './EventMarker.styles';

interface EventMarkerProps {
  type: RoadEventReadType;
  status?: RoadEventStatus;
  selected?: boolean;
  doubtful?: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
  compact?: boolean;
  illustrationScale?: number;
}

export const EventMarker = ({
  type,
  status,
  selected = false,
  doubtful = false,
  accessibilityLabel,
  onPress,
  compact = false,
  illustrationScale = 1,
}: EventMarkerProps) => {
  const config = getEventMarkerVisualConfig(type);
  const baseScale = compact ? 0.84 : 1;
  const scale = useSharedValue(selected ? baseScale * 1.1 : baseScale);
  const lift = useSharedValue(selected ? -2 : 0);

  useEffect(() => {
    scale.set(
      withSpring(selected ? baseScale * 1.1 : baseScale, {
        duration: 400,
        dampingRatio: 1,
        reduceMotion: ReduceMotion.System,
      }),
    );
    lift.set(
      withSpring(selected ? -2 : 0, {
        duration: 400,
        dampingRatio: 1,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [baseScale, lift, scale, selected]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{translateY: lift.get()}, {scale: scale.get()}],
  }));

  const imageOpacity =
    status === 'STALE' ? 0.58 : status === 'UNCONFIRMED' ? 0.76 : 1;

  const content = (
    <Animated.View
      testID={`event-marker-${type}`}
      style={[
        styles.visual,
        config.anchor === 'bottom' ? styles.bottomAnchored : undefined,
        animatedStyle,
      ]}>
      <Image
        accessible={false}
        importantForAccessibility="no"
        resizeMode="contain"
        source={config.source}
        style={{
          width: config.width * illustrationScale,
          height: config.height * illustrationScale,
          opacity: imageOpacity,
        }}
      />
      {doubtful ? (
        <View testID="event-marker-doubtful" style={styles.doubtfulAccent} />
      ) : null}
    </Animated.View>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        style={styles.touchTarget}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      onPress={onPress}
      style={styles.touchTarget}>
      {content}
    </Pressable>
  );
};
