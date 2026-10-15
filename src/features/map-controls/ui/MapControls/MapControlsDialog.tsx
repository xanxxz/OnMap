import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, radius, shadows, spacing, typography} from '../../../../shared/theme';

export interface MapControlsDialogAction {
  label: string;
  onPress: () => void | Promise<void>;
  primary?: boolean;
  testID?: string;
}

interface Props {
  visible: boolean;
  title: string;
  message: string;
  actions: MapControlsDialogAction[];
  onRequestClose: () => void;
}

export const MapControlsDialog = ({visible, title, message, actions, onRequestClose}: Props) => (
  <Modal testID="map-controls-dialog-modal" transparent statusBarTranslucent visible={visible} animationType="fade" onRequestClose={onRequestClose}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={styles.card} testID="map-controls-dialog">
        <View style={styles.mark}><Text style={styles.markText}>O</Text></View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          {actions.map(action => (
            <Pressable
              key={action.testID ?? action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              testID={action.testID}
              onPress={action.onPress}
              style={({pressed}) => [styles.action, action.primary ? styles.primary : styles.secondary, pressed && styles.pressed]}
            >
              <Text style={[styles.actionText, action.primary ? styles.primaryText : styles.secondaryText]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'center', paddingHorizontal: spacing[20], backgroundColor: colors.overlay},
  card: {alignSelf: 'center', width: '100%', maxWidth: 420, padding: spacing[20], borderRadius: radius[22], backgroundColor: colors.surfaceCream, ...shadows.floating},
  mark: {width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[12], borderRadius: radius[12], backgroundColor: colors.brandForest},
  markText: {...typography.bodyMedium, color: colors.textInverse, fontWeight: '800'},
  title: {...typography.title, color: colors.textPrimary},
  message: {...typography.body, color: colors.textSecondary, marginTop: spacing[8]},
  actions: {gap: spacing[8], marginTop: spacing[16]},
  action: {minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[12], borderRadius: radius[14], borderWidth: StyleSheet.hairlineWidth},
  primary: {backgroundColor: colors.brandForest, borderColor: colors.brandForest},
  secondary: {backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong},
  actionText: {...typography.bodyMedium, textAlign: 'center', fontWeight: '700'},
  primaryText: {color: colors.textInverse},
  secondaryText: {color: colors.brandForest},
  pressed: {opacity: 0.74, transform: [{scale: 0.99}]},
});
