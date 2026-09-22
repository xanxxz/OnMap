import {StyleSheet} from 'react-native';

import {colors, spacing, typography} from '../../theme';

export const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  containerCompact: {
    flexDirection: 'row',
  },
  mark: {
    width: 152,
    height: 152,
    borderRadius: 38,
  },
  markCompact: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  copy: {
    alignItems: 'center',
  },
  wordmark: {
    ...typography.display,
    marginTop: spacing[16],
    color: colors.brandDeepForest,
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: -1.6,
  },
  wordmarkCompact: {
    marginTop: 0,
    marginLeft: spacing[8],
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.7,
  },
  tagline: {
    ...typography.micro,
    marginTop: spacing[6],
    color: colors.textSecondary,
    letterSpacing: 2.6,
  },
});
