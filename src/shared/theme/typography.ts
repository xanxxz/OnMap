import { Platform } from 'react-native';

export const fontFamilies = {
  display: Platform.select({
    ios: 'Avenir Next',
    android: 'sans-serif',
    default: 'System',
  }),
  body: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'System',
  }),
} as const;

export const typography = {
  display: {
    fontFamily: fontFamilies.display,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800' as const,
    letterSpacing: -0.7,
  },

  title: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
  },

  heading: {
    fontFamily: fontFamilies.display,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700' as const,
  },

  body: {
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400' as const,
  },

  bodyMedium: {
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600' as const,
  },

  caption: {
    fontFamily: fontFamilies.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
  },

  micro: {
    fontFamily: fontFamilies.body,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.35,
  },
} as const;
