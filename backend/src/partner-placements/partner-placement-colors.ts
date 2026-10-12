export const DEFAULT_PARTNER_BACKGROUND_COLOR = '#153D32';
export const DEFAULT_PARTNER_TEXT_COLOR = '#FDFBF4';

const HEX_COLOR = /^#[0-9A-F]{6}$/u;

export const parsePartnerColor = (value: string): string | null => {
  const normalized = value.trim().toUpperCase();
  return HEX_COLOR.test(normalized) ? normalized : null;
};

const linearChannel = (value: number): number => {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
};

const luminance = (color: string): number => {
  const red = linearChannel(Number.parseInt(color.slice(1, 3), 16));
  const green = linearChannel(Number.parseInt(color.slice(3, 5), 16));
  const blue = linearChannel(Number.parseInt(color.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

export const partnerColorContrast = (
  backgroundColor: string,
  textColor: string,
): number => {
  const background = parsePartnerColor(backgroundColor);
  const text = parsePartnerColor(textColor);
  if (!background || !text) return 0;
  const [lighter, darker] = [luminance(background), luminance(text)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
};

export const isReadablePartnerColors = (
  backgroundColor: string,
  textColor: string,
): boolean => partnerColorContrast(backgroundColor, textColor) >= 4.5;

export const safePartnerAppearance = (
  backgroundColor: string | null | undefined,
  textColor: string | null | undefined,
) => {
  const background = parsePartnerColor(
    backgroundColor ?? DEFAULT_PARTNER_BACKGROUND_COLOR,
  );
  const text = parsePartnerColor(textColor ?? DEFAULT_PARTNER_TEXT_COLOR);
  return background && text && isReadablePartnerColors(background, text)
    ? { backgroundColor: background, textColor: text }
    : {
        backgroundColor: DEFAULT_PARTNER_BACKGROUND_COLOR,
        textColor: DEFAULT_PARTNER_TEXT_COLOR,
      };
};
