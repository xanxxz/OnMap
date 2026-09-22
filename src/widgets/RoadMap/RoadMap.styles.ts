import { StyleSheet } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../../shared/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: colors.surfaceMist,
  },

  map: {
    flex: 1,
  },

  mapAttribution: {
    position: 'absolute',

    left: spacing[12],

    right: spacing[12],

    alignItems: 'center',

    zIndex: 2,
  },

  mapAttributionText: {
    ...typography.caption,

    paddingHorizontal: spacing[6],

    paddingVertical: 2,

    borderRadius: radius.round,

    backgroundColor: colors.surfaceGlass,

    fontSize: 9,

    lineHeight: 12,

    color: colors.textSecondary,

    textAlign: 'center',
  },

  stateLayer: {
    position: 'absolute',

    top: 0,

    right: 0,

    bottom: 0,

    left: 0,

    alignItems: 'center',

    justifyContent: 'center',

    paddingHorizontal: spacing[24],
  },

  loadingCard: {
    flexDirection: 'row',

    alignItems: 'center',

    gap: spacing[10],

    paddingHorizontal: spacing[12],

    paddingVertical: spacing[10],

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radius.round,

    backgroundColor: colors.surfaceGlass,

    ...shadows.floating,
  },

  loadingText: {
    ...typography.caption,

    color: colors.textPrimary,
  },

  errorLayer: {
    backgroundColor: 'rgba(237,241,234,0.86)',
  },

  errorCard: {
    width: '100%',

    maxWidth: 320,

    alignItems: 'center',

    paddingHorizontal: spacing[24],

    paddingVertical: spacing[24],

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radius[18],

    backgroundColor: colors.surfaceGlass,

    ...shadows.floating,
  },

  errorTitle: {
    ...typography.heading,

    color: colors.textPrimary,

    textAlign: 'center',
  },

  errorMessage: {
    ...typography.body,

    marginTop: spacing[8],

    color: colors.textSecondary,

    textAlign: 'center',
  },

  retryButton: {
    minWidth: 132,

    minHeight: 44,

    alignItems: 'center',

    justifyContent: 'center',

    marginTop: spacing[20],

    paddingHorizontal: spacing[20],

    borderRadius: radius[14],

    backgroundColor: colors.primary,
  },

  retryButtonPressed: {
    opacity: 0.72,

    transform: [
      {
        scale: 0.98,
      },
    ],
  },

  retryButtonText: {
    ...typography.bodyMedium,

    color: colors.textInverse,
  },
});
