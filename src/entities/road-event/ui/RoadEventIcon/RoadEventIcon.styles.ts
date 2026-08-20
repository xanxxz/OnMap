import {
  StyleSheet,
} from 'react-native';

import {
  radius,
} from '../../../../shared/theme';

export const styles =
  StyleSheet.create({
    container: {
      width: 46,

      height: 46,

      alignItems: 'center',

      justifyContent:
        'center',

      borderRadius:
        radius[14],
    },

    icon: {
      width: 24,

      height: 24,
    },
  });