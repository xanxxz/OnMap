import React from 'react';

import {
  Pressable,
  Text,
  View,
} from 'react-native';

import {styles} from './ReportEventButton.styles';

interface ReportEventButtonProps {
  onPress: () => void;
}

export const ReportEventButton = ({
  onPress,
}: ReportEventButtonProps) => {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Сообщить о дорожном событии"
      onPress={onPress}
      style={({pressed}) => [
        styles.button,

        pressed &&
          styles.buttonPressed,
      ]}>
      <View style={styles.plus}>
        <View
          style={
            styles.plusHorizontal
          }
        />

        <View
          style={
            styles.plusVertical
          }
        />
      </View>

      <Text style={styles.label}>
        Событие
      </Text>
    </Pressable>
  );
};