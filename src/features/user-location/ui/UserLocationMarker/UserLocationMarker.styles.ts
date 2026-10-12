import {StyleSheet} from 'react-native';

import {colors, radius, shadows, spacing, typography} from '../../../../shared/theme';

export const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginBottom: spacing[4],
    paddingHorizontal: spacing[8],
    paddingVertical: 3,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.floating,
  },
  labelText: {
    ...typography.caption,
    color: colors.brandDeepForest,
    fontSize: 10,
    lineHeight: 13,
  },
  accuracyHalo: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(80,145,111,0.38)',
    backgroundColor: 'rgba(142,190,158,0.18)',
  },
  accuracyHaloUncertain: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderStyle: 'dashed',
    borderColor: 'rgba(110,132,94,0.54)',
    backgroundColor: 'rgba(185,193,150,0.13)',
  },
  stale: {
    opacity: 0.85,
  },
  dot: {
    width: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.brandForest,
    shadowColor: colors.brandDeepForest,
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 1},
    elevation: 3,
  },
  dotStale: {
    backgroundColor: colors.textSecondary,
  },
  dotCenter: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.brandSky,
  },
});
