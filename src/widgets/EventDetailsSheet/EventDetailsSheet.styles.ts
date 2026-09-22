import { StyleSheet } from 'react-native';

import { colors, radius, shadows, typography } from '../../shared/theme';

export const styles = StyleSheet.create({
  container: {
    position: 'absolute',

    left: 12,

    right: 12,

    zIndex: 10,

    paddingTop: 8,

    paddingHorizontal: 16,

    paddingBottom: 20,

    borderRadius: radius[28],

    backgroundColor: colors.surface,

    ...shadows.sheet,
  },

  handle: {
    width: 38,

    height: 4,

    alignSelf: 'center',

    marginBottom: 14,

    borderRadius: 2,

    backgroundColor: colors.borderStrong,
  },

  header: {
    flexDirection: 'row',

    alignItems: 'flex-start',

    justifyContent: 'space-between',

    gap: 12,
  },

  headerContent: {
    flex: 1,
  },

  statusRow: {
    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

    marginBottom: 7,
  },

  statusDot: {
    width: 7,

    height: 7,

    borderRadius: 4,

    backgroundColor: '#E0A126',
  },

  statusDotActive: {
    backgroundColor: '#169B6B',
  },

  statusDotStale: {
    backgroundColor: '#9AA3AC',
  },

  statusDotResolved: {
    backgroundColor: '#697580',
  },

  statusText: {
    fontSize: 12,

    fontWeight: '600',

    color: colors.textSecondary,
  },

  sourceBadge: {
    alignSelf: 'flex-start',

    marginBottom: 8,

    paddingHorizontal: 9,

    paddingVertical: 4,

    borderRadius: 12,

    backgroundColor: 'rgba(125,106,166,0.12)',
  },

  sourceBadgeText: {
    fontSize: 11,

    lineHeight: 14,

    fontWeight: '600',

    color: colors.traffic,
  },

  title: {
    ...typography.title,

    flex: 1,

    color: colors.textPrimary,
  },

  titleRow: {
    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,
  },

  titleMarker: {
    width: 36,

    height: 36,

    alignItems: 'center',

    justifyContent: 'center',

    overflow: 'hidden',
  },

  dpsSubtitle: {
    alignSelf: 'flex-start',
    marginTop: 7,
    paddingLeft: 9,
    borderLeftWidth: 2,
    borderLeftColor: colors.success,
  },

  dpsSubtitleWarning: {
    borderLeftColor: colors.danger,
  },

  dpsSubtitleText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  dpsSubtitleTextWarning: {
    color: colors.danger,
  },

  closeButton: {
    width: 34,

    height: 34,

    alignItems: 'center',

    justifyContent: 'center',

    borderRadius: 17,

    backgroundColor: colors.surfaceMuted,
  },

  closeText: {
    marginTop: -2,

    fontSize: 24,

    fontWeight: '400',

    color: colors.textSecondary,
  },

  description: {
    marginTop: 10,

    fontSize: 14,

    lineHeight: 20,

    color: colors.textSecondary,
  },

  telegramLocation: {
    marginTop: 12,
    padding: 11,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },

  telegramLocationTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  telegramPrecision: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },

  telegramApproximationWarning: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: '#9A640D',
  },

  telegramSourceText: {
    marginTop: 12,
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#D9D0EE',
  },

  telegramSourceTextLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#7B6A99',
  },

  telegramSourceTextValue: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },

  externalRoute: {
    marginTop: 12,

    fontSize: 13,

    lineHeight: 19,

    fontWeight: '600',

    color: '#343B43',
  },

  externalMetrics: {
    flexDirection: 'row',

    gap: 9,

    marginTop: 16,
  },

  externalMetric: {
    flex: 1,

    alignItems: 'center',

    paddingHorizontal: 10,

    paddingVertical: 12,

    borderRadius: 14,

    backgroundColor: colors.surfaceMuted,
  },

  metrics: {
    flexDirection: 'row',

    alignItems: 'center',

    marginTop: 18,

    paddingVertical: 13,

    borderRadius: 16,

    backgroundColor: colors.surfaceMuted,
  },

  metric: {
    flex: 1,

    alignItems: 'center',
  },

  metricValue: {
    fontSize: 16,

    fontWeight: '700',

    color: colors.textPrimary,
  },

  metricLabel: {
    marginTop: 3,

    fontSize: 11,

    color: colors.textSecondary,
  },

  metricDivider: {
    width: 1,

    height: 26,

    backgroundColor: colors.border,
  },

  timestamps: {
    gap: 3,

    marginTop: 12,
  },

  timestamp: {
    fontSize: 11,

    lineHeight: 16,

    color: colors.textSecondary,
  },

  feedbackSection: {
    marginTop: 18,
  },

  feedbackTitle: {
    marginBottom: 10,

    fontSize: 14,

    fontWeight: '600',

    color: colors.textPrimary,
  },

  feedbackActions: {
    flexDirection: 'row',

    gap: 9,
  },

  feedbackError: {
    flexDirection: 'row',

    alignItems: 'flex-start',

    gap: 10,

    marginBottom: 11,

    padding: 12,

    borderWidth: 1,

    borderColor: '#F4D1D3',

    borderRadius: 14,

    backgroundColor: '#FFF6F6',
  },

  feedbackErrorRateLimit: {
    borderColor: '#F0D4AD',

    backgroundColor: '#FFF9F1',
  },

  feedbackErrorIcon: {
    width: 28,

    height: 28,

    alignItems: 'center',

    justifyContent: 'center',

    borderRadius: 14,

    backgroundColor: '#FCE3E4',
  },

  feedbackErrorIconRateLimit: {
    backgroundColor: '#FBEBCF',
  },

  feedbackErrorIconText: {
    fontSize: 15,

    lineHeight: 18,

    fontWeight: '700',

    color: '#C83339',
  },

  feedbackErrorIconTextRateLimit: {
    color: '#B5660D',
  },

  feedbackErrorContent: {
    flex: 1,

    minWidth: 0,
  },

  feedbackErrorTitle: {
    fontSize: 13,

    lineHeight: 18,

    fontWeight: '700',

    color: '#6E2024',
  },

  feedbackErrorTitleRateLimit: {
    color: '#70420D',
  },

  feedbackErrorDescription: {
    marginTop: 2,

    fontSize: 12,

    lineHeight: 17,

    color: '#8B4A4D',
  },

  feedbackErrorDescriptionRateLimit: {
    color: '#85602E',
  },

  confirmButton: {
    flex: 1,

    minHeight: 48,

    alignItems: 'center',

    justifyContent: 'center',

    borderRadius: 14,

    backgroundColor: colors.brandForest,
  },

  confirmButtonText: {
    fontSize: 14,

    fontWeight: '600',

    color: colors.textInverse,
  },

  rejectButton: {
    flex: 1,

    minHeight: 48,

    alignItems: 'center',

    justifyContent: 'center',

    borderWidth: 1,

    borderColor: colors.borderStrong,

    borderRadius: 14,

    backgroundColor: colors.surface,
  },

  rejectButtonText: {
    fontSize: 14,

    fontWeight: '600',

    color: colors.danger,
  },

  relationCard: {
    flexDirection: 'row',

    alignItems: 'flex-start',

    gap: 11,

    padding: 14,

    borderRadius: 16,

    backgroundColor: 'rgba(131,185,104,0.11)',
  },

  relationIcon: {
    width: 22,

    fontSize: 17,

    lineHeight: 22,

    fontWeight: '700',

    color: colors.success,

    textAlign: 'center',
  },

  relationContent: {
    flex: 1,
  },

  relationTitle: {
    fontSize: 14,

    lineHeight: 19,

    fontWeight: '600',

    color: colors.textPrimary,
  },

  relationDescription: {
    marginTop: 3,

    fontSize: 12,

    lineHeight: 17,

    color: colors.textSecondary,
  },

  buttonPressed: {
    opacity: 0.72,
  },

  buttonDisabled: {
    opacity: 0.5,
  },
});
