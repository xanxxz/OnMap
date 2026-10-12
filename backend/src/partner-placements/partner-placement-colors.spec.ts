import {
  isReadablePartnerColors,
  parsePartnerColor,
  partnerColorContrast,
  safePartnerAppearance,
} from './partner-placement-colors';

describe('partner placement appearance', () => {
  it('normalizes strict opaque HEX colors', () => {
    expect(parsePartnerColor(' #285c78 ')).toBe('#285C78');
    expect(parsePartnerColor('#FFF')).toBeNull();
    expect(parsePartnerColor('red')).toBeNull();
    expect(parsePartnerColor('#11223380')).toBeNull();
  });

  it('requires readable small text and preserves the selected pair', () => {
    expect(partnerColorContrast('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(isReadablePartnerColors('#F7F4EA', '#FFFFFF')).toBe(false);
    expect(isReadablePartnerColors('#F7F4EA', '#14241E')).toBe(true);
    expect(safePartnerAppearance('#285c78', '#fdfbf4')).toEqual({
      backgroundColor: '#285C78',
      textColor: '#FDFBF4',
    });
  });

  it('falls back to the existing OnMap treatment for old or invalid records', () => {
    expect(safePartnerAppearance(undefined, undefined)).toEqual({
      backgroundColor: '#153D32',
      textColor: '#FDFBF4',
    });
    expect(safePartnerAppearance('#FFFFFF', '#FFFFFF')).toEqual({
      backgroundColor: '#153D32',
      textColor: '#FDFBF4',
    });
  });
});
