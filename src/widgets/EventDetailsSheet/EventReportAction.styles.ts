import { StyleSheet } from 'react-native';

import { colors, radius, typography } from '../../shared/theme';

export const reportStyles = StyleSheet.create({
  trigger: {
    alignSelf: 'stretch',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  triggerText: {
    ...typography.caption,
    flex: 1,
    color: colors.textSecondary,
  },
  triggerArrow: {
    fontSize: 20,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  pressed: { opacity: 0.7 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  blurBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(21,61,50,0.07)',
  },
  sheet: {
    paddingTop: 24,
    paddingHorizontal: 20,
    borderTopLeftRadius: radius[28],
    borderTopRightRadius: radius[28],
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.heading,
    marginBottom: 14,
    color: colors.textPrimary,
  },
  hint: {
    ...typography.body,
    marginBottom: 14,
    color: colors.textSecondary,
  },
  reason: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: radius[14],
    backgroundColor: colors.surfaceMuted,
  },
  reasonText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  primaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius[14],
    backgroundColor: colors.brandForest,
  },
  primaryButtonText: {
    ...typography.bodyMedium,
    color: colors.textInverse,
  },
  secondaryHint: {
    ...typography.caption,
    marginTop: 14,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.caption,
    marginTop: 14,
    color: colors.danger,
  },
  copyText: {
    ...typography.caption,
    marginTop: 8,
    padding: 12,
    borderRadius: radius[14],
    color: colors.textPrimary,
    backgroundColor: colors.surfaceMuted,
  },
  supportLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  supportLinkText: {
    ...typography.caption,
    color: colors.brandForest,
    textDecorationLine: 'underline',
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  secondaryButtonText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
});
