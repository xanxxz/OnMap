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
    content: {
      paddingBottom:
        spacing[12],
    },

    title: {
      ...typography.title,

      color:
        colors.textPrimary,
    },

    subtitle: {
      ...typography.body,

      marginTop:
        spacing[4],

      marginBottom:
        spacing[20],

      color:
        colors.textSecondary,
    },

    grid: {
      flexDirection: 'row',

      flexWrap: 'wrap',

      justifyContent:
        'space-between',

      gap: spacing[10],
    },

    item: {
      width: '48%',

      minHeight: 78,

      flexDirection: 'row',

      alignItems: 'center',

      paddingHorizontal:
        spacing[12],

      paddingVertical:
        spacing[12],

      borderWidth: 1,

      borderColor:
        colors.border,

      borderRadius:
        radius[16],

      backgroundColor:
        colors.surfaceMuted,
    },

    itemPressed: {
      opacity: 0.72,

      transform: [
        {
          scale: 0.98,
        },
      ],
    },

    label: {
      ...typography.caption,

      flex: 1,

      marginLeft:
        spacing[10],

      color:
        colors.textPrimary,
    },

    summaryCard: {
      flexDirection: 'row',

      alignItems: 'center',

      padding:
        spacing[16],

      borderWidth: 1,

      borderColor:
        colors.border,

      borderRadius:
        radius[16],

      backgroundColor:
        colors.surfaceMuted,
    },

    summaryText: {
      flex: 1,

      marginLeft:
        spacing[12],
    },

    summaryLabel: {
      ...typography.caption,

      color:
        colors.textSecondary,
    },

    summaryValue: {
      ...typography.bodyMedium,

      marginTop:
        spacing[2],

      color:
        colors.textPrimary,
    },

    locationCard: {
      flexDirection: 'row',

      alignItems:
        'flex-start',

      marginTop:
        spacing[12],

      padding:
        spacing[16],

      borderWidth: 1,

      borderColor:
        colors.border,

      borderRadius:
        radius[16],

      backgroundColor:
        colors.surface,
    },

    locationMarker: {
      width: 42,

      height: 42,

      alignItems: 'center',

      justifyContent:
        'center',

      borderRadius:
        radius.round,

      backgroundColor:
        colors.primary,
    },

    locationMarkerDot: {
      width: 10,

      height: 10,

      borderRadius:
        radius.round,

      backgroundColor:
        colors.surface,
    },

    locationText: {
      flex: 1,

      marginLeft:
        spacing[12],
    },

    locationReady: {
      ...typography.caption,

      marginTop:
        spacing[4],

      color:
        colors.success,
    },

    locationError: {
      ...typography.caption,

      marginTop:
        spacing[4],

      color:
        colors.danger,
    },

    actions: {
      flexDirection: 'row',

      marginTop:
        spacing[20],

      gap:
        spacing[10],
    },

    backButton: {
      height: 52,

      paddingHorizontal:
        spacing[20],

      alignItems: 'center',

      justifyContent:
        'center',

      borderWidth: 1,

      borderColor:
        colors.borderStrong,

      borderRadius:
        radius[16],

      backgroundColor:
        colors.surface,
    },

    backButtonText: {
      ...typography.bodyMedium,

      color:
        colors.textPrimary,
    },

    submitButton: {
      flex: 1,

      height: 52,

      alignItems: 'center',

      justifyContent:
        'center',

      borderRadius:
        radius[16],

      backgroundColor:
        colors.textPrimary,
    },

    submitButtonDisabled: {
      opacity: 0.35,
    },

    submitButtonText: {
      ...typography.bodyMedium,

      color:
        colors.textInverse,
    },

    actionPressed: {
      opacity: 0.8,

      transform: [
        {
          scale: 0.98,
        },
      ],
    },
  });