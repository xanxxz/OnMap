import {StyleSheet} from 'react-native';

import {colors} from '../../shared/theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceCream,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: '22%',
  },
  brand: {
    zIndex: 2,
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.68)',
    borderRadius: 32,
    backgroundColor: 'rgba(247,244,234,0.88)',
    shadowColor: colors.brandDeepForest,
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: {width: 0, height: 12},
  },
  atmosphere: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(247,244,234,0.08)',
  },
});
