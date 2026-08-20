import {
  StyleSheet,
} from 'react-native';

import {
  colors,
  radius,
} from '../../../../shared/theme';

export const styles =
  StyleSheet.create({
    container: {
      alignItems: 'center',

      justifyContent: 'flex-end',
    },

    marker: {
      width: 42,

      height: 42,

      alignItems: 'center',

      justifyContent: 'center',

      borderRadius:
        radius.round,

      borderWidth: 4,

      borderColor:
        colors.surface,

      backgroundColor:
        colors.primary,

      shadowColor: '#000000',

      shadowOpacity: 0.2,

      shadowRadius: 10,

      shadowOffset: {
        width: 0,
        height: 5,
      },

      elevation: 7,
    },

    center: {
      width: 10,

      height: 10,

      borderRadius:
        radius.round,

      backgroundColor:
        colors.surface,
    },

    tail: {
      width: 10,

      height: 10,

      marginTop: -7,

      transform: [
        {
          rotate: '45deg',
        },
      ],

      backgroundColor:
        colors.primary,

      borderBottomRightRadius:
        2,
    },
  });