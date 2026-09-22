import {StyleSheet} from 'react-native';

import {
  colors,
  radius,
  shadows,
  spacing,
  typography,
} from '../../shared/theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing[20],
    paddingBottom: spacing[16],
    backgroundColor: colors.surfaceCream,
  },
  topBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progress: {
    width: 106,
    flexDirection: 'row',
    gap: spacing[4],
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: radius.round,
    backgroundColor: colors.borderStrong,
  },
  progressSegmentActive: {
    backgroundColor: colors.brandLeaf,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing[12],
  },
  visual: {
    height: '44%',
    minHeight: 220,
    maxHeight: 360,
    overflow: 'hidden',
    borderRadius: radius[28],
    backgroundColor: colors.surfaceMist,
    ...shadows.floating,
  },
  visualImage: {
    width: '100%',
    height: '100%',
  },
  copy: {
    marginTop: spacing[24],
  },
  eyebrow: {
    ...typography.micro,
    color: colors.brandLeaf,
    letterSpacing: 1.8,
  },
  title: {
    ...typography.display,
    marginTop: spacing[8],
    color: colors.brandDeepForest,
  },
  body: {
    ...typography.body,
    maxWidth: 520,
    marginTop: spacing[12],
    color: colors.textSecondary,
  },
  button: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[20],
    borderRadius: radius[18],
    backgroundColor: colors.brandForest,
    ...shadows.floating,
  },
  buttonDisabled: {
    opacity: 0.42,
  },
  buttonPressed: {
    transform: [{scale: 0.985}],
  },
  buttonText: {
    ...typography.bodyMedium,
    color: colors.textInverse,
  },
  buttonArrow: {
    color: colors.textInverse,
    fontSize: 22,
  },
});
