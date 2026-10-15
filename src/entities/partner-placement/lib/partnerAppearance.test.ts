import {colors} from '../../../shared/theme';
import {getColorContrastRatio, getPartnerAccentColor, getPartnerAccentTextColor, getPartnerAppearance} from './partnerAppearance';

describe('partner presentation accents', () => {
  it('keeps dark green and blue partner colours as their own accents', () => {
    expect(getPartnerAccentColor({backgroundColor: '#286348', textColor: '#F8F7F0'})).toBe('#286348');
    expect(getPartnerAccentColor({backgroundColor: '#285C78', textColor: '#FDFBF4'})).toBe('#285C78');
  });

  it('uses a separate forest accent for a cream-like brand without mutating stored appearance', () => {
    const lightAppearance = {backgroundColor: '#F7F4EA', textColor: '#14241E'};
    expect(getPartnerAppearance(lightAppearance)).toEqual(lightAppearance);
    expect(getPartnerAccentColor(lightAppearance)).toBe(colors.brandForest);
    expect(getPartnerAccentTextColor(lightAppearance)).toBe(colors.textInverse);
    expect(getColorContrastRatio(getPartnerAccentTextColor(lightAppearance), getPartnerAccentColor(lightAppearance))).toBeGreaterThanOrEqual(4.5);
  });

  it('does not accept invalid colors as a UI accent', () => {
    expect(getPartnerAccentColor({backgroundColor: 'transparent', textColor: '#123456'})).toBe(colors.brandForest);
    expect(getColorContrastRatio('transparent', '#FFFFFF')).toBe(1);
  });
});
