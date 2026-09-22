import { StyleSheet } from 'react-native';

import { colors, radius, spacing, typography } from '../../../../shared/theme';

export const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },

  content: {
    paddingHorizontal: spacing[16],

    gap: spacing[8],
  },

  chip: {
    minHeight: 36,

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: spacing[10],

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radius.round,

    backgroundColor: colors.surfaceGlass,
  },

  chipActive: {
    borderColor: 'rgba(79,138,88,0.34)',

    backgroundColor: 'rgba(131,185,104,0.18)',
  },

  chipPressed: {
    opacity: 0.78,

    transform: [{ scale: 0.97 }],
  },

  iconShell: {
    width: 27,

    height: 27,

    alignItems: 'center',

    justifyContent: 'center',

    marginRight: spacing[6],

    overflow: 'hidden',
  },

  iconPosition: {
    position: 'absolute',

    left: -11,

    top: -11,
  },

  allIcon: {
    width: 15,

    height: 15,

    flexDirection: 'row',

    flexWrap: 'wrap',

    gap: 3,

    marginRight: spacing[6],
  },

  allIconDot: {
    width: 5,

    height: 5,

    borderRadius: 2,

    backgroundColor: colors.textSecondary,
  },

  label: {
    ...typography.caption,

    color: colors.textPrimary,
  },

  labelActive: {
    color: colors.brandDeepForest,
  },
});
