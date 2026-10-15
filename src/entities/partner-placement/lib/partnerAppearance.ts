import type {PartnerAppearance} from '../model/partnerPlacement';
import {colors} from '../../../shared/theme';

const DEFAULT_APPEARANCE: PartnerAppearance = {
  backgroundColor: '#153D32',
  textColor: '#FDFBF4',
};

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/u;

export const getPartnerAppearance = (
  appearance: PartnerAppearance | undefined,
): PartnerAppearance =>
  appearance &&
  HEX_COLOR.test(appearance.backgroundColor) &&
  HEX_COLOR.test(appearance.textColor)
    ? appearance
    : DEFAULT_APPEARANCE;

const channel = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const relativeLuminance = (hex: string): number => {
  const normalized = hex.slice(1);
  const red = channel(parseInt(normalized.slice(0, 2), 16) / 255);
  const green = channel(parseInt(normalized.slice(2, 4), 16) / 255);
  const blue = channel(parseInt(normalized.slice(4, 6), 16) / 255);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

export const getColorContrastRatio = (first: string, second: string): number => {
  if (!HEX_COLOR.test(first) || !HEX_COLOR.test(second)) return 1;
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

/**
 * The saved partner colour remains the primary brand colour. For tiny accents
 * on OnMap's cream surfaces use forest when the saved colour would disappear.
 */
export const getPartnerAccentColor = (
  appearance: PartnerAppearance | undefined,
  surfaceColor: string = colors.surfaceCream,
): string => {
  const partnerColor = getPartnerAppearance(appearance).backgroundColor;
  return getColorContrastRatio(partnerColor, surfaceColor) >= 3
    ? partnerColor
    : colors.brandForest;
};

/** Keep the foreground readable if the UI-only accent had to be substituted. */
export const getPartnerAccentTextColor = (
  appearance: PartnerAppearance | undefined,
  accentColor: string = getPartnerAccentColor(appearance),
): string => {
  const storedTextColor = getPartnerAppearance(appearance).textColor;
  if (getColorContrastRatio(storedTextColor, accentColor) >= 4.5) return storedTextColor;
  return getColorContrastRatio(colors.textInverse, accentColor) >=
    getColorContrastRatio(colors.textPrimary, accentColor)
    ? colors.textInverse
    : colors.textPrimary;
};

export const isPartnerAppearance = (value: unknown): value is PartnerAppearance => {
  if (!value || typeof value !== 'object') return false;
  const appearance = value as Record<string, unknown>;
  return typeof appearance.backgroundColor === 'string' &&
    typeof appearance.textColor === 'string' &&
    HEX_COLOR.test(appearance.backgroundColor) &&
    HEX_COLOR.test(appearance.textColor);
};
