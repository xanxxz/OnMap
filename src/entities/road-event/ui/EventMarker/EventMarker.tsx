import React, {useEffect} from 'react';

import {Pressable, View} from 'react-native';

import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {RoadEventReadType, RoadEventStatus} from '../../model/roadEvent';

import {
  EventMarkerGlyph,
  getEventMarkerVisualConfig,
} from './eventMarkerVisualConfig';

import {styles} from './EventMarker.styles';

interface EventMarkerProps {
  type: RoadEventReadType;
  status?: RoadEventStatus;
  selected?: boolean;
  doubtful?: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
  compact?: boolean;
}

const MarkerGlyph = ({glyph}: {glyph: EventMarkerGlyph}) => {
  if (glyph === 'BEACON') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphLine, styles.beaconBase]} />
        <View style={[styles.glyphLine, styles.beaconCap]} />
        <View style={[styles.glyphDot, styles.beaconDot]} />
      </View>
    );
  }

  if (glyph === 'IMPACT') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphLine, styles.impactLine]} />
        <View style={[styles.glyphLine, styles.impactLineOpposite]} />
        <View style={styles.glyphDot} />
      </View>
    );
  }

  if (glyph === 'WORKS') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphLine, styles.worksHandle]} />
        <View style={[styles.glyphLine, styles.worksBase]} />
        <View style={[styles.glyphDot, styles.worksDot]} />
      </View>
    );
  }

  if (glyph === 'BLOCKED') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphLine, styles.blockedBase]} />
        <View style={[styles.glyphLine, styles.blockedSlash]} />
      </View>
    );
  }

  if (glyph === 'WARNING') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphLine, styles.warningStem]} />
        <View style={[styles.glyphDot, styles.warningDot]} />
      </View>
    );
  }

  if (glyph === 'TRAFFIC') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphLine, styles.trafficTop]} />
        <View style={[styles.glyphLine, styles.trafficBottom]} />
        <View style={[styles.glyphDot, styles.trafficTopDot]} />
        <View style={[styles.glyphDot, styles.trafficBottomDot]} />
      </View>
    );
  }

  if (glyph === 'SIGNAL') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphDot, styles.signalTop]} />
        <View style={styles.glyphDot} />
        <View style={[styles.glyphDot, styles.signalBottom]} />
      </View>
    );
  }

  if (glyph === 'SERVICE') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphLine, styles.serviceLine]} />
        <View style={[styles.glyphLine, styles.serviceLineVertical]} />
      </View>
    );
  }

  if (glyph === 'MORE') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphDot, styles.moreLeft]} />
        <View style={styles.glyphDot} />
        <View style={[styles.glyphDot, styles.moreRight]} />
      </View>
    );
  }

  return (
    <View style={styles.glyph}>
      <View style={[styles.glyphLine, styles.roadCenter]} />
      <View style={[styles.glyphLine, styles.roadLeft]} />
      <View style={[styles.glyphLine, styles.roadRight]} />
    </View>
  );
};

export const EventMarker = ({
  type,
  status,
  selected = false,
  doubtful = false,
  accessibilityLabel,
  onPress,
  compact = false,
}: EventMarkerProps) => {
  const config = getEventMarkerVisualConfig(type);
  const baseScale = (compact ? 0.84 : 1) * (type === 'ROAD_PATROL' ? 1.08 : 1);
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

  const glyph = <MarkerGlyph glyph={config.glyph} />;
  const bodyStateStyle =
    status === 'STALE'
      ? styles.stale
      : status === 'UNCONFIRMED'
        ? styles.unconfirmed
        : undefined;

  const renderShape = () => {
    const bodyBase = [styles.body, bodyStateStyle, {backgroundColor: config.color}];

    switch (config.shape) {
      case 'SHIELD':
        return (
          <>
            <View style={[styles.shieldTip, {backgroundColor: config.color}]} />
            <View style={[...bodyBase, styles.shield]}>{glyph}</View>
          </>
        );
      case 'DIAMOND':
        return <View style={[...bodyBase, styles.diamond]}><View style={styles.diamondGlyph}>{glyph}</View></View>;
      case 'WORK_SIGN':
        return <><View style={[styles.workBase, {backgroundColor: config.color}]} /><View style={[...bodyBase, styles.workSign]}>{glyph}</View></>;
      case 'BARRIER':
        return <View style={[...bodyBase, styles.barrier]}>{glyph}</View>;
      case 'SOFT_TRIANGLE':
        return <><View style={[styles.triangle, {borderBottomColor: config.color}]} /><View style={styles.triangleGlyph}>{glyph}</View></>;
      case 'STACKED_ROAD':
        return <><View style={[styles.stackedRoadBack, {backgroundColor: config.color}]} /><View style={[...bodyBase, styles.stackedRoadFront]}>{glyph}</View></>;
      case 'ROAD_TILE':
        return <View style={[...bodyBase, styles.roadTile]}>{glyph}</View>;
      case 'TRAFFIC_LIGHT':
        return <View style={[...bodyBase, styles.trafficLight]}>{glyph}</View>;
      case 'SERVICE_HEX':
        return <View style={[...bodyBase, styles.serviceHex]}><View style={styles.serviceGlyph}>{glyph}</View></View>;
      case 'PEBBLE':
      default:
        return <View style={[...bodyBase, styles.pebble]}><View style={styles.pebbleGlyph}>{glyph}</View></View>;
    }
  };

  const content = (
    <Animated.View
      testID={`event-marker-${type}`}
      style={[
        styles.visual,
        animatedStyle,
      ]}
    >
      {selected ? <View style={styles.selectedHalo} /> : null}
      {renderShape()}
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
        style={styles.touchTarget}
      >
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
      style={styles.touchTarget}
    >
      {content}
    </Pressable>
  );
};
