import {
  StyleSheet,
} from 'react-native';

export const styles =
  StyleSheet.create({
    container: {
      position:
        'absolute',

      left: 12,

      right: 12,

      bottom: 12,

      paddingTop: 8,

      paddingHorizontal: 18,

      paddingBottom: 20,

      borderRadius: 24,

      backgroundColor:
        '#FFFFFF',

      shadowColor:
        '#000000',

      shadowOpacity: 0.12,

      shadowRadius: 18,

      shadowOffset: {
        width: 0,

        height: 8,
      },

      elevation: 8,
    },

    handle: {
      width: 38,

      height: 4,

      alignSelf:
        'center',

      marginBottom: 14,

      borderRadius: 2,

      backgroundColor:
        '#D7DCE1',
    },

    header: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',

      justifyContent:
        'space-between',

      gap: 12,
    },

    headerContent: {
      flex: 1,
    },

    statusRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 6,

      marginBottom: 7,
    },

    statusDot: {
      width: 7,

      height: 7,

      borderRadius: 4,

      backgroundColor:
        '#E0A126',
    },

    statusDotActive: {
      backgroundColor:
        '#169B6B',
    },

    statusDotStale: {
      backgroundColor:
        '#9AA3AC',
    },

    statusDotResolved: {
      backgroundColor:
        '#697580',
    },

    statusText: {
      fontSize: 12,

      fontWeight:
        '600',

      color:
        '#6B747E',
    },

    title: {
      fontSize: 22,

      lineHeight: 27,

      fontWeight:
        '700',

      color:
        '#11151A',
    },

    closeButton: {
      width: 34,

      height: 34,

      alignItems:
        'center',

      justifyContent:
        'center',

      borderRadius: 17,

      backgroundColor:
        '#F3F5F7',
    },

    closeText: {
      marginTop: -2,

      fontSize: 24,

      fontWeight:
        '400',

      color:
        '#697580',
    },

    description: {
      marginTop: 10,

      fontSize: 14,

      lineHeight: 20,

      color:
        '#5F6973',
    },

    metrics: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginTop: 18,

      paddingVertical: 13,

      borderRadius: 16,

      backgroundColor:
        '#F6F7F9',
    },

    metric: {
      flex: 1,

      alignItems:
        'center',
    },

    metricValue: {
      fontSize: 16,

      fontWeight:
        '700',

      color:
        '#11151A',
    },

    metricLabel: {
      marginTop: 3,

      fontSize: 11,

      color:
        '#7B848D',
    },

    metricDivider: {
      width: 1,

      height: 26,

      backgroundColor:
        '#E2E6EA',
    },

    timestamps: {
      gap: 3,

      marginTop: 12,
    },

    timestamp: {
      fontSize: 11,

      lineHeight: 16,

      color:
        '#8A929A',
    },

    feedbackSection: {
      marginTop: 18,
    },

    feedbackTitle: {
      marginBottom: 10,

      fontSize: 14,

      fontWeight:
        '600',

      color:
        '#252A30',
    },

    feedbackActions: {
      flexDirection:
        'row',

      gap: 9,
    },

    confirmButton: {
      flex: 1,

      minHeight: 48,

      alignItems:
        'center',

      justifyContent:
        'center',

      borderRadius: 14,

      backgroundColor:
        '#15191E',
    },

    confirmButtonText: {
      fontSize: 14,

      fontWeight:
        '600',

      color:
        '#FFFFFF',
    },

    rejectButton: {
      flex: 1,

      minHeight: 48,

      alignItems:
        'center',

      justifyContent:
        'center',

      borderWidth: 1,

      borderColor:
        '#E3E7EB',

      borderRadius: 14,

      backgroundColor:
        '#FFFFFF',
    },

    rejectButtonText: {
      fontSize: 14,

      fontWeight:
        '600',

      color:
        '#D94348',
    },

    relationCard: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',

      gap: 11,

      padding: 14,

      borderRadius: 16,

      backgroundColor:
        '#F3F7F4',
    },

    relationIcon: {
      width: 22,

      fontSize: 17,

      lineHeight: 22,

      fontWeight:
        '700',

      color:
        '#169B6B',

      textAlign:
        'center',
    },

    relationContent: {
      flex: 1,
    },

    relationTitle: {
      fontSize: 14,

      lineHeight: 19,

      fontWeight:
        '600',

      color:
        '#1E2722',
    },

    relationDescription: {
      marginTop: 3,

      fontSize: 12,

      lineHeight: 17,

      color:
        '#6F7872',
    },

    buttonPressed: {
      opacity: 0.72,
    },

    buttonDisabled: {
      opacity: 0.5,
    },
  });