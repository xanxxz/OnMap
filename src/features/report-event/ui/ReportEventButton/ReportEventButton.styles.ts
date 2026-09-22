import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../../shared/theme';

export const styles = StyleSheet.create({
  button: {
    height: 50,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    paddingHorizontal: spacing[16],

    borderRadius: radius[16],

    backgroundColor: colors.brandForest,

    shadowColor: colors.brandDeepForest,

    shadowOpacity: 0.14,

    shadowRadius: 12,

    shadowOffset: {
      width: 0,

      height: 5,
    },

    elevation: 5,
  },

  buttonPressed: {
    opacity: 0.92,

    transform: [
      {
        scale: 0.97,
      },
    ],
  },

  plus: {
    width: 18,

    height: 18,

    alignItems: 'center',

    justifyContent: 'center',
  },

  plusHorizontal: {
    position: 'absolute',

    width: 16,

    height: 2,

    borderRadius: 1,

    backgroundColor: colors.textInverse,
  },

  plusVertical: {
    position: 'absolute',

    width: 2,

    height: 16,

    borderRadius: 1,

    backgroundColor: colors.textInverse,
  },

  label: {
    marginLeft: spacing[8],

    color: colors.textInverse,

    fontSize: 14,

    fontWeight: '700',
  },
});
