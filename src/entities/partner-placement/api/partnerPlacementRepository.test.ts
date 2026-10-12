import {httpRequest} from '../../../shared/api/httpClient';
import {partnerPlacementRepository, parsePartnerPlacements} from './partnerPlacementRepository';

jest.mock('../../../shared/api/httpClient', () => ({httpRequest: jest.fn()}));

const point = {
  id: 'point-1', cityId: 'balakovo', title: 'Мастерская', category: 'Сервис',
  description: 'Ремонт', coordinates: {longitude: 47.8, latitude: 52.02},
  displayAddress: 'Балаково', startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-11-01T00:00:00.000Z', imageUrl: null, promoCode: null,
  contacts: [{type: 'PHONE', label: 'Позвонить', value: '+79990000000', displayOrder: 0}],
};

describe('partner placements public repository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the backend response for city and viewport without local activity filtering', async () => {
    (httpRequest as jest.Mock).mockResolvedValue({cityId: 'balakovo', points: [point], banner: null});
    const result = await partnerPlacementRepository.list('balakovo', [47.7, 51.9, 47.9, 52.1]);
    expect(httpRequest).toHaveBeenCalledWith(
      '/partner-placements?cityId=balakovo&west=47.7&south=51.9&east=47.9&north=52.1',
    );
    expect(result.points).toEqual([point]);
    expect(result.banner).toBeNull();
  });

  it('rejects a response for another city or malformed point', () => {
    expect(() => parsePartnerPlacements({cityId: 'saratov', points: [point], banner: null}, 'balakovo')).toThrow();
    expect(() => parsePartnerPlacements({cityId: 'balakovo', points: [{...point, coordinates: null}], banner: null}, 'balakovo')).toThrow();
    expect(() => parsePartnerPlacements({cityId: 'balakovo', points: [{...point, appearance: {backgroundColor: 'red', textColor: '#FFFFFF'}}], banner: null}, 'balakovo')).toThrow();
    expect(() => parsePartnerPlacements({cityId: 'balakovo', points: [{...point, imageUrl: '/partner-placements/images/../../secret'}], banner: null}, 'balakovo')).toThrow();
  });

  it('keeps the backend-selected appearance for points and their banner', () => {
    const appearance = {backgroundColor: '#285C78', textColor: '#FDFBF4'};
    const banner = {id: 'banner-1', cityId: 'balakovo', title: 'Партнёр', text: 'Описание',
      partnerPointId: 'point-1', button: {label: 'Подробнее', url: 'https://example.com'}, appearance};
    const result = parsePartnerPlacements({cityId: 'balakovo', points: [{...point, appearance}], banner}, 'balakovo');
    expect(result.points[0].appearance).toEqual(appearance);
    expect(result.banner?.appearance).toEqual(appearance);
  });

  it('accepts a nullable promo and rejects a malformed promo payload', () => {
    const result = parsePartnerPlacements({cityId: 'balakovo', points: [{...point, promoCode: 'onMap-25'}], banner: null}, 'balakovo');
    expect(result.points[0].promoCode).toBe('onMap-25');
    expect(() => parsePartnerPlacements({cityId: 'balakovo', points: [{...point, promoCode: 25}], banner: null}, 'balakovo')).toThrow();
    const legacyPoint = {...point, promoCode: undefined};
    expect(parsePartnerPlacements({cityId: 'balakovo', points: [legacyPoint], banner: null}, 'balakovo').points[0].promoCode).toBeNull();
  });

  it('sends only action and opaque IDs, never coordinates or contact values', async () => {
    (httpRequest as jest.Mock).mockResolvedValue({counted: true});
    await partnerPlacementRepository.recordInteraction('CONTACT_CLICK', 'point-1', 'contact-1');
    expect(httpRequest).toHaveBeenCalledWith('/partner-placements/interaction', {
      method: 'POST',
      body: JSON.stringify({action: 'CONTACT_CLICK', targetId: 'point-1', contactId: 'contact-1'}),
    });
    expect(JSON.stringify((httpRequest as jest.Mock).mock.calls)).not.toContain('+79990000000');
  });
});
