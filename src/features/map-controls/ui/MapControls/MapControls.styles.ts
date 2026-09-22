import { StyleSheet } from 'react-native';

import { colors, radius } from '../../../../shared/theme';

export const styles = StyleSheet.create({
  container: {
    alignItems: 'center',

    gap: 10,
  },

  zoomGroup: {
    overflow: 'hidden',

    width: 44,

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radius[14],

    backgroundColor: colors.surfaceGlass,

    shadowColor: colors.brandDeepForest,

    shadowOpacity: 0.07,

    shadowRadius: 12,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  control: {
    width: 44,

    height: 44,

    alignItems: 'center',

    justifyContent: 'center',
  },

  controlPressed: {
    opacity: 0.55,

    transform: [
      {
        scale: 0.96,
      },
    ],
  },

  zoomText: {
    color: colors.textPrimary,

    fontSize: 25,

    lineHeight: 28,

    fontWeight: '500',
  },

  divider: {
    height: StyleSheet.hairlineWidth,

    marginHorizontal: 8,

    backgroundColor: colors.border,
  },

  locationButton: {
    width: 44,

    height: 44,

    alignItems: 'center',

    justifyContent: 'center',

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radius[14],

    backgroundColor: colors.surfaceGlass,

    shadowColor: colors.brandDeepForest,

    shadowOpacity: 0.07,

    shadowRadius: 12,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  locationButtonDisabled: {
    opacity: 0.38,
  },

  targetOuter: {
    width: 21,

    height: 21,

    alignItems: 'center',

    justifyContent: 'center',

    borderWidth: 2,

    borderColor: colors.primary,

    borderRadius: radius.round,
  },

  targetInner: {
    width: 7,

    height: 7,

    borderRadius: radius.round,

    backgroundColor: colors.primary,
  },
});
