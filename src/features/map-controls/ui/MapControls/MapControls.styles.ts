import { StyleSheet } from 'react-native';

import { colors, radius } from '../../../../shared/theme';

export const styles = StyleSheet.create({
  container: {
    alignItems: 'center',

    gap: 10,
  },

  zoomGroup: {
    overflow: 'hidden',

    width: 44,

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radius[14],

    backgroundColor: colors.surfaceGlass,

    shadowColor: colors.brandDeepForest,

    shadowOpacity: 0.07,

    shadowRadius: 12,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  control: {
    width: 44,

    height: 44,

    alignItems: 'center',

    justifyContent: 'center',
  },

  controlPressed: {
    opacity: 0.55,

    transform: [
      {
        scale: 0.96,
      },
    ],
  },

  zoomText: {
    color: colors.textPrimary,

    fontSize: 25,

    lineHeight: 28,

    fontWeight: '500',
  },

  divider: {
    height: StyleSheet.hairlineWidth,

    marginHorizontal: 8,

    backgroundColor: colors.border,
  },

  locationButton: {
    width: 44,

    height: 44,

    alignItems: 'center',

    justifyContent: 'center',

    borderWidth: 1,

    borderColor: colors.border,

    borderRadius: radius[14],

    backgroundColor: colors.surfaceGlass,

    shadowColor: colors.brandDeepForest,

    shadowOpacity: 0.07,

    shadowRadius: 12,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  locationButtonDisabled: {
    opacity: 0.38,
  },
  bellDome: {
    width: 18,
    height: 17,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.primary,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    marginTop: 2,
  },
  bellRim: {
    width: 23,
    height: 2,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
  },
  bellClapper: {
    width: 6,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: colors.primary,
  },

  locationHint: {
    width: 126,
    marginLeft: -82,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius[14],
    backgroundColor: colors.surfaceGlass,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },

  targetOuter: {
    width: 21,

    height: 21,

    alignItems: 'center',

    justifyContent: 'center',

    borderWidth: 2,

    borderColor: colors.primary,

    borderRadius: radius.round,
  },

  targetInner: {
    width: 7,

    height: 7,

    borderRadius: radius.round,

    backgroundColor: colors.primary,
  },
  pairingBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(12, 30, 24, 0.42)',
  },
  pairingCard: {
    padding: 22,
    borderRadius: radius[14],
    backgroundColor: colors.surfaceGlass,
    gap: 14,
  },
  pairingTitle: {
    color: colors.textPrimary,
    fontSize: 21,
    fontWeight: '700',
  },
  pairingHint: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  pairingInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius[14],
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 18,
    letterSpacing: 1,
  },
  pairingActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  pairingSecondary: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  pairingSecondaryText: { color: colors.textSecondary, fontSize: 15 },
  pairingPrimary: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: radius[14],
    backgroundColor: colors.primary,
  },
  pairingPrimaryText: { color: colors.surfaceGlass, fontSize: 15, fontWeight: '600' },
});
