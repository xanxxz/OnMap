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

  placementActions: {
    position: 'absolute',
    left: spacing[16],
    right: spacing[16],
    zIndex: 18,
    padding: spacing[16],
    borderRadius: radius[18],
    backgroundColor: colors.surfaceGlass,
    ...shadows.floating,
  },
  placementTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  placementHint: {
    ...typography.caption,
    marginTop: spacing[4],
    marginBottom: spacing[12],
    color: colors.textSecondary,
  },
  placementLocate: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    marginBottom: spacing[8],
    paddingHorizontal: spacing[10],
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
  },
  placementLocateText: {
    ...typography.caption,
    color: colors.brandForest,
  },
  placementError: {
    ...typography.caption,
    marginBottom: spacing[10],
    color: colors.danger,
  },
  placementButtons: {
    flexDirection: 'row',
    gap: spacing[10],
  },
  placementCancel: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius[14],
    backgroundColor: colors.surfaceMuted,
  },
  placementSubmit: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius[14],
    backgroundColor: colors.brandForest,
  },
  placementDisabled: {
    opacity: 0.48,
  },
  placementPressed: {
    transform: [{scale: 0.98}],
  },
  placementCancelText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  placementSubmitText: {
    ...typography.bodyMedium,
    color: colors.textInverse,
  },
  discardBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[20],
    backgroundColor: 'rgba(11,40,31,0.36)',
  },
  discardOutside: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  discardCard: {
    width: '100%',
    maxWidth: 340,
    padding: spacing[20],
    borderRadius: radius[22],
    backgroundColor: colors.surface,
    ...shadows.floating,
  },
  discardTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  discardDescription: {
    ...typography.body,
    marginTop: spacing[8],
    marginBottom: spacing[20],
    color: colors.textSecondary,
  },
});
