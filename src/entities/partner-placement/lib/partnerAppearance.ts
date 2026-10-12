import type {PartnerAppearance} from '../model/partnerPlacement';

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

export const isPartnerAppearance = (value: unknown): value is PartnerAppearance => {
  if (!value || typeof value !== 'object') return false;
  const appearance = value as Record<string, unknown>;
  return typeof appearance.backgroundColor === 'string' &&
    typeof appearance.textColor === 'string' &&
    HEX_COLOR.test(appearance.backgroundColor) &&
    HEX_COLOR.test(appearance.textColor);
};
