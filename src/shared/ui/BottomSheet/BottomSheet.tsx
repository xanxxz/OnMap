import React, {
  PropsWithChildren,
  useEffect,
} from 'react';

import {GestureDetector, usePanGesture} from 'react-native-gesture-handler';
import {scheduleOnRN} from 'react-native-worklets';

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
  useReducedMotion,
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
  onClosed?: () => void;
}

export const BottomSheet = ({
  visible,
  onClose,
  offset = 520,
  onClosed,
  children,
}: BottomSheetProps) => {
  const insets =
    useSafeAreaInsets();

  const progress =
    useSharedValue(0);
  const drag = useSharedValue(0);
  const sheetHeight = useSharedValue(offset);
  const reducedMotion = useReducedMotion();
  const pan = usePanGesture({
    activeOffsetY: 12,
    failOffsetX: [-24, 24],
    onUpdate: event => {
      drag.set(Math.max(0, event.translationY));
    },
    onDeactivate: event => {
      if (event.translationY >= 110 || (event.translationY >= 60 && event.velocityY >= 1200)) {
        scheduleOnRN(onClose);
        drag.set(withTiming(0, {duration: reducedMotion ? 0 : 220}));
        return;
      }
      drag.set(withSpring(0, {duration: 300, dampingRatio: 0.8}));
    },
  });

  useEffect(() => {
    if (visible) {
      progress.set(
        withSpring(1, {
          duration: reducedMotion ? 0 : 300,
          dampingRatio: 1,
        }),
      );

      return;
    }

    progress.set(withTiming(0, {duration: reducedMotion ? 0 : 220}, finished => {
      if (finished && onClosed) {
        scheduleOnRN(onClosed);
      }
    }));
  }, [onClosed, progress, reducedMotion, visible]);

  const backdropStyle =
    useAnimatedStyle(() => ({
      opacity: interpolate(
        progress.get(),
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
              progress.get(),
              [0, 1],
              [reducedMotion ? 0 : sheetHeight.get(), 0],
            ) + drag.get(),
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

      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={event => sheetHeight.set(event.nativeEvent.layout.height)}
          style={[
            styles.sheet,
            sheetStyle,
            {paddingBottom: Math.max(insets.bottom, 16)},
          ]}>
          <View style={styles.handleTouchArea}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};
