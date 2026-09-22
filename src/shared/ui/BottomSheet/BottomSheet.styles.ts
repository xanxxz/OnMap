import {
  StyleSheet,
} from 'react-native';

import {
  colors,
  radius,
  shadows,
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
        radius[28],

      borderTopRightRadius:
        radius[28],

      ...shadows.sheet,
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
