import { StyleSheet } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../../shared/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: colors.background,
  },

  header: {
    position: 'absolute',
    left: spacing[16],
    right: spacing[16],
    zIndex: 20,
  },

  mapControls: {
    position: 'absolute',

    right: spacing[16],

    zIndex: 7,
  },

  dataStatus: {
    position: 'absolute',

    left: spacing[16],

    right: 72,

    zIndex: 8,
  },

  filters: {
    position: 'absolute',

    left: 0,

    right: 0,
  },

  eventCount: {
    position: 'absolute',

    left: spacing[16],

    minHeight: 38,

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: spacing[12],

    paddingVertical: spacing[8],

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radius.round,

    backgroundColor: colors.surfaceGlass,

    ...shadows.floating,
  },

  liveDot: {
    width: 7,

    height: 7,

    marginRight: spacing[8],

    borderRadius: radius.round,

    backgroundColor: colors.success,
  },

  liveDotUpdating: {
    backgroundColor: colors.warning,
  },

  liveDotError: {
    backgroundColor: colors.danger,
  },

  eventCountText: {
    ...typography.caption,

    color: colors.textPrimary,

    fontWeight: '600',
  },

  fab: {
    position: 'absolute',

    right: spacing[16],
  },
});
