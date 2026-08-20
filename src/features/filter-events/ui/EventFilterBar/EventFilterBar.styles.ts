import {
  StyleSheet,
} from 'react-native';

import {
  colors,
  radius,
  spacing,
  typography,
} from '../../../../shared/theme';

export const styles =
  StyleSheet.create({
    scroll: {
      flexGrow: 0,
    },

    content: {
      paddingHorizontal:
        spacing[16],

      gap: spacing[8],
    },

    chip: {
      height: 38,

      flexDirection: 'row',

      alignItems: 'center',

      paddingHorizontal:
        spacing[12],

      borderWidth: 1,

      borderColor:
        colors.border,

      borderRadius:
        radius.round,

      backgroundColor:
        'rgba(255,255,255,0.96)',
    },

    chipActive: {
      borderColor:
        colors.textPrimary,

      backgroundColor:
        colors.textPrimary,
    },

    chipPressed: {
      opacity: 0.76,
    },

    dot: {
      width: 7,

      height: 7,

      marginRight:
        spacing[6],

      borderRadius:
        radius.round,
    },

    label: {
      ...typography.caption,

      color:
        colors.textPrimary,
    },

    labelActive: {
      color:
        colors.textInverse,
    },
  });