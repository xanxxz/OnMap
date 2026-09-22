import { StyleSheet } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../../shared/theme';

export const headerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing[10],
  },
  cityCard: {
    flex: 1,
    maxWidth: 260,
    flexShrink: 0,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: spacing[10],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius[18],
    backgroundColor: colors.surfaceGlass,
    ...shadows.floating,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  cityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLabel: {
    ...typography.micro,
    marginBottom: 1,
    color: colors.brandLeaf,
    letterSpacing: 0.8,
  },
  cityTitle: {
    ...typography.heading,
    flexShrink: 1,
    color: colors.textPrimary,
  },
  chevron: {
    marginLeft: spacing[6],
    marginTop: -3,
    fontSize: 17,
    color: colors.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[4],
  },
  statusDot: {
    width: 7,
    height: 7,
    marginRight: spacing[6],
    borderRadius: radius.round,
    backgroundColor: colors.success,
  },
  statusDotDelayed: {
    backgroundColor: colors.warning,
  },
  statusText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  dpsCard: {
    width: 104,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[8],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius[18],
    backgroundColor: colors.surfaceGlass,
    ...shadows.floating,
  },
  dpsLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    color: colors.textSecondary,
  },
  dpsTotal: {
    marginTop: 1,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  dpsBreakdown: {
    marginTop: 1,
    maxWidth: 92,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '500',
    textAlign: 'center',
    color: colors.textSecondary,
  },
  selectorContent: {
    paddingBottom: spacing[12],
  },
  selectorTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  selectorSubtitle: {
    ...typography.body,
    marginTop: spacing[4],
    marginBottom: spacing[16],
    color: colors.textSecondary,
  },
  cityOption: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[12],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius[16],
    backgroundColor: colors.surfaceMuted,
  },
  cityOptionSelected: {
    borderColor: 'rgba(79,138,88,0.34)',
    backgroundColor: 'rgba(131,185,104,0.14)',
  },
  cityOptionPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },
  cityOptionTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  cityOptionDescription: {
    ...typography.caption,
    marginTop: spacing[2],
    color: colors.textSecondary,
  },
  selectionMark: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
  },
  selectionMarkSelected: {
    borderWidth: 5,
    borderColor: colors.primary,
  },
});
