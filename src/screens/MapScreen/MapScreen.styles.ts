import {
  StyleSheet,
} from 'react-native';

import {
  colors,
  radius,
  spacing,
  typography,
} from '../../shared/theme';

export const styles =
  StyleSheet.create({
    container: {
      flex: 1,

      backgroundColor:
        colors.background,
    },

    header: {
      position: 'absolute',

      left:
        spacing[16],

      minWidth: 170,

      paddingHorizontal:
        spacing[16],

      paddingVertical:
        spacing[12],

      borderWidth: 1,

      borderColor:
        'rgba(255,255,255,0.68)',

      borderRadius:
        radius[18],

      backgroundColor:
        'rgba(255,255,255,0.95)',

      shadowColor:
        '#000000',

      shadowOpacity: 0.08,

      shadowRadius: 16,

      shadowOffset: {
        width: 0,
        height: 5,
      },

      elevation: 4,
    },

    city: {
      ...typography.heading,

      color:
        colors.textPrimary,
    },

    headerSubtitle: {
      ...typography.caption,

      marginTop:
        spacing[2],

      color:
        colors.textSecondary,
    },

    demoNotice: {
      position:
        'absolute',

      left:
        spacing[16],

      paddingHorizontal:
        spacing[12],

      paddingVertical:
        spacing[8],

      borderRadius:
        radius[12],

      backgroundColor:
        'rgba(255,255,255,0.95)',
    },

    demoNoticeText: {
      ...typography.caption,

      color:
        colors.textSecondary,
    },

    mapControls: {
      position:
        'absolute',

      right:
        spacing[16],
    },

    filters: {
      position:
        'absolute',

      left: 0,

      right: 0,
    },

    eventCount: {
      position:
        'absolute',

      left:
        spacing[16],

      minHeight: 38,

      flexDirection:
        'row',

      alignItems:
        'center',

      paddingHorizontal:
        spacing[12],

      paddingVertical:
        spacing[8],

      borderWidth: 1,

      borderColor:
        'rgba(255,255,255,0.65)',

      borderRadius:
        radius.round,

      backgroundColor:
        'rgba(255,255,255,0.97)',
    },

    liveDot: {
      width: 7,

      height: 7,

      marginRight:
        spacing[8],

      borderRadius:
        radius.round,

      backgroundColor:
        colors.success,
    },

    liveDotUpdating: {
      backgroundColor:
        colors.warning,
    },

    eventCountText: {
      ...typography.caption,

      color:
        colors.textPrimary,
    },

    fab: {
      position:
        'absolute',

      right:
        spacing[16],
    },
  });