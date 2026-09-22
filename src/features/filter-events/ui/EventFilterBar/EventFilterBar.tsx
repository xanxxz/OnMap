import React from 'react';

import { Pressable, ScrollView, Text, View } from 'react-native';

import { RoadEventType } from '../../../../entities/road-event/model/roadEvent';

import { ROAD_EVENT_META } from '../../../../entities/road-event/model/roadEventMeta';

import { RoadEventIcon } from '../../../../entities/road-event/ui/RoadEventIcon/RoadEventIcon';

import { useRoadEventFilterStore } from '../../model/useRoadEventFilterStore';

import { styles } from './EventFilterBar.styles';

const FILTER_TYPES: RoadEventType[] = [
  'ACCIDENT',
  'ROAD_CLOSURE',
  'ROADWORKS',
  'TRAFFIC',
  'ROAD_HAZARD',
  'TRAFFIC_LIGHT',
  'ROAD_SERVICE',
  'ROAD_PATROL',
  'OTHER',
];

export const EventFilterBar = () => {
  const activeTypes = useRoadEventFilterStore(state => state.activeTypes);

  const toggleType = useRoadEventFilterStore(state => state.toggleType);

  const showAll = useRoadEventFilterStore(state => state.showAll);

  const allActive = activeTypes.length === 0;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.scroll}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Все события"
        accessibilityState={{ selected: allActive }}
        onPress={showAll}
        style={({ pressed }) => [
          styles.chip,

          allActive && styles.chipActive,

          pressed && styles.chipPressed,
        ]}
      >
        <View style={styles.allIcon}>
          <View style={styles.allIconDot} />
          <View style={styles.allIconDot} />
          <View style={styles.allIconDot} />
          <View style={styles.allIconDot} />
        </View>

        <Text style={[styles.label, allActive && styles.labelActive]}>Все</Text>
      </Pressable>

      {FILTER_TYPES.map(type => {
        const meta = ROAD_EVENT_META[type];

        const active = activeTypes.includes(type);

        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={meta.filterLabel}
            accessibilityState={{ selected: active }}
            onPress={() => toggleType(type)}
            style={({ pressed }) => [
              styles.chip,

              active && styles.chipActive,

              pressed && styles.chipPressed,
            ]}
          >
            <View style={styles.iconShell}>
              <View style={styles.iconPosition}>
                <RoadEventIcon type={type} />
              </View>
            </View>

            <Text style={[styles.label, active && styles.labelActive]}>
              {meta.filterLabel}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};
