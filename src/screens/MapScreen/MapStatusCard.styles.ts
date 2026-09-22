import { StyleSheet } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../../shared/theme';

export const statusStyles = StyleSheet.create({
  card: {
    width: '100%',

    maxWidth: 292,

    flexDirection: 'row',

    alignItems: 'flex-start',

    padding: spacing[10],

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radius[18],

    backgroundColor: colors.surfaceGlass,

    ...shadows.floating,
  },

  cardError: {
    borderColor: 'rgba(229,72,77,0.18)',
  },

  icon: {
    width: 32,

    height: 32,

    alignItems: 'center',

    justifyContent: 'center',

    borderRadius: radius[12],

    backgroundColor: 'rgba(85,184,222,0.14)',
  },

  iconError: {
    backgroundColor: 'rgba(229,72,77,0.10)',
  },

  iconSuccess: {
    backgroundColor: 'rgba(22,155,107,0.10)',
  },

  iconText: {
    fontSize: 17,

    lineHeight: 20,

    fontWeight: '700',

    color: colors.primary,
  },

  iconTextError: {
    color: colors.danger,
  },

  iconTextSuccess: {
    color: colors.success,
  },

  content: {
    flex: 1,

    minWidth: 0,

    marginLeft: spacing[10],
  },

  title: {
    ...typography.bodyMedium,

    color: colors.textPrimary,
  },

  description: {
    ...typography.caption,

    marginTop: spacing[2],

    color: colors.textSecondary,
  },

  retryButton: {
    minWidth: 104,

    minHeight: 42,

    alignSelf: 'flex-start',

    alignItems: 'center',

    justifyContent: 'center',

    marginTop: spacing[10],

    paddingHorizontal: spacing[16],

    borderRadius: radius[12],

    backgroundColor: colors.brandForest,
  },

  retryButtonPressed: {
    opacity: 0.78,

    transform: [
      {
        scale: 0.98,
      },
    ],
  },

  retryButtonDisabled: {
    opacity: 0.48,
  },

  retryText: {
    ...typography.caption,

    color: colors.textInverse,
  },

  realtime: {
    minHeight: 24,

    flexDirection: 'row',

    alignItems: 'center',

    alignSelf: 'flex-start',

    marginTop: spacing[8],

    paddingHorizontal: spacing[8],

    borderRadius: radius.round,

    backgroundColor: colors.surfaceMuted,
  },

  realtimeDot: {
    width: 7,

    height: 7,

    marginRight: spacing[6],

    borderRadius: radius.round,
  },

  realtimeDotConnected: {
    backgroundColor: colors.success,
  },

  realtimeDotDisconnected: {
    backgroundColor: colors.warning,
  },

  realtimeText: {
    fontSize: 11,

    lineHeight: 14,

    fontWeight: '600',

    color: colors.textSecondary,
  },

  successNotice: {
    width: '100%',

    maxWidth: 300,

    minHeight: 58,

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: spacing[12],

    paddingVertical: spacing[10],

    borderWidth: 1,

    borderColor: 'rgba(22,155,107,0.18)',

    borderRadius: radius[16],

    backgroundColor: colors.surfaceGlass,

    shadowColor: '#000000',

    shadowOpacity: 0.08,

    shadowRadius: 14,

    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 4,
  },

  successDot: {
    width: 10,

    height: 10,

    marginRight: spacing[10],

    borderRadius: radius.round,

    backgroundColor: colors.success,
  },

  successContent: {
    flex: 1,

    minWidth: 0,
  },

  successTitle: {
    ...typography.caption,

    color: colors.textPrimary,
  },

  successDescription: {
    fontSize: 11,

    lineHeight: 14,

    marginTop: spacing[2],

    color: colors.textSecondary,
  },
});
