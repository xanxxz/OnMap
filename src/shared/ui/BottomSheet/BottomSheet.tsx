import React, {
  PropsWithChildren,
  useEffect,
} from 'react';

import {
  Pressable,
  View,
} from 'react-native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {styles} from './BottomSheet.styles';

interface BottomSheetProps
  extends PropsWithChildren {
  visible: boolean;

  onClose: () => void;

  offset?: number;
}

export const BottomSheet = ({
  visible,
  onClose,
  offset = 520,
  children,
}: BottomSheetProps) => {
  const insets =
    useSafeAreaInsets();

  const progress =
    useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value =
        withSpring(1, {
          damping: 24,

          stiffness: 240,

          mass: 0.9,
        });

      return;
    }

    progress.value =
      withTiming(0, {
        duration: 180,
      });
  }, [progress, visible]);

  const backdropStyle =
    useAnimatedStyle(() => ({
      opacity: interpolate(
        progress.value,
        [0, 1],
        [0, 1],
      ),
    }));

  const sheetStyle =
    useAnimatedStyle(() => ({
      transform: [
        {
          translateY:
            interpolate(
              progress.value,
              [0, 1],
              [offset, 0],
            ),
        },
      ],
    }));

  return (
    <View
      pointerEvents={
        visible
          ? 'box-none'
          : 'none'
      }
      style={styles.root}>
      <Animated.View
        style={[
          styles.backdrop,
          backdropStyle,
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          style={
            styles.backdropPressable
          }
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,

          sheetStyle,

          {
            paddingBottom:
              Math.max(
                insets.bottom,
                16,
              ),
          },
        ]}>
        <View
          style={styles.handle}
        />

        {children}
      </Animated.View>
    </View>
  );
};