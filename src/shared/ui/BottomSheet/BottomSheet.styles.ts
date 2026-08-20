import {
  StyleSheet,
} from 'react-native';

import {
  colors,
  radius,
  spacing,
} from '../../theme';

export const styles =
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,

      zIndex: 100,
    },

    backdrop: {
      ...StyleSheet.absoluteFill,

      backgroundColor:
        colors.overlay,
    },

    backdropPressable: {
      flex: 1,
    },

    sheet: {
      position: 'absolute',

      left: 0,

      right: 0,

      bottom: 0,

      paddingTop: spacing[8],

      paddingHorizontal:
        spacing[20],

      backgroundColor:
        colors.surface,

      borderTopLeftRadius:
        radius[22],

      borderTopRightRadius:
        radius[22],

      shadowColor: '#000000',

      shadowOpacity: 0.13,

      shadowRadius: 22,

      shadowOffset: {
        width: 0,

        height: -5,
      },

      elevation: 20,
    },

    handle: {
      alignSelf: 'center',

      width: 38,

      height: 4,

      marginBottom:
        spacing[16],

      borderRadius: 2,

      backgroundColor:
        colors.borderStrong,
    },
  });