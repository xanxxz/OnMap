import {
  StyleSheet,
} from 'react-native';

import {
  colors,
  radius,
  spacing,
} from '../../../../shared/theme';

export const styles =
  StyleSheet.create({
    button: {
      height: 56,

      flexDirection: 'row',

      alignItems: 'center',

      justifyContent: 'center',

      paddingHorizontal:
        spacing[20],

      borderRadius: radius[18],

      backgroundColor:
        colors.textPrimary,

      shadowColor: '#000000',

      shadowOpacity: 0.18,

      shadowRadius: 14,

      shadowOffset: {
        width: 0,

        height: 6,
      },

      elevation: 7,
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

      backgroundColor:
        colors.textInverse,
    },

    plusVertical: {
      position: 'absolute',

      width: 2,

      height: 16,

      borderRadius: 1,

      backgroundColor:
        colors.textInverse,
    },

    label: {
      marginLeft: spacing[8],

      color: colors.textInverse,

      fontSize: 14,

      fontWeight: '700',
    },
  });