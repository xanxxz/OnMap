import {
  advancePartnerDraft,
  parsePartnerCoordinates,
  parsePlacementDate,
  parsePartnerPromoCode,
  partnerDraftPrompt,
  PartnerDraftState,
} from './partner-bot.flow';

const now = new Date('2026-10-09T12:00:00.000Z');

describe('partner bot point wizard', () => {
  const start = (): PartnerDraftState => ({
    kind: 'POINT',
    step: 'TITLE',
    revision: 0,
    payload: { cityId: 'balakovo', contacts: [] },
  });
  const enter = (state: PartnerDraftState, text: string) =>
    advancePartnerDraft(state, { text }, now);

  it('collects point details, repeated contacts, dates and waits at preview', () => {
    let state = start();
    for (const value of [
      'Автосервис',
      'SERVICE',
      '/skip',
      '52.0, 47.8',
      'ул. Ленина, 1',
    ]) {
      const result = enter(state, value);
      expect(result.error).toBeUndefined();
      state = result.state;
    }
    expect(state.step).toBe('CONTACT_CHOICE');
    state = advancePartnerDraft(state, { action: 'ADD_CONTACT' }, now).state;
    for (const value of ['PHONE', 'Позвонить', '+79990000000'])
      state = enter(state, value).state;
    expect(state.step).toBe('CONTACT_CHOICE');
    state = advancePartnerDraft(state, { action: 'ADD_CONTACT' }, now).state;
    for (const value of ['WEBSITE', 'Сайт', 'https://example.com'])
      state = enter(state, value).state;
    state = advancePartnerDraft(state, { action: 'DONE_CONTACTS' }, now).state;
    state = enter(state, '2026-10-10T12:00+04:00').state;
    state = enter(state, '2026-10-20T12:00+04:00').state;
    expect(state.step).toBe('BACKGROUND_COLOR');
    state = enter(state, '#285c78').state;
    expect(state.step).toBe('TEXT_COLOR');
    state = enter(state, '#fdfbf4').state;
    expect(state.step).toBe('IMAGE');
    state = enter(state, '/skip').state;
    expect(state.step).toBe('PROMO_CODE');
    state = enter(state, '/skip').state;
    expect(state.step).toBe('PREVIEW');
    expect(state.payload).toMatchObject({
      backgroundColor: '#285C78',
      textColor: '#FDFBF4',
    });
    expect((state.payload as { contacts: unknown[] }).contacts).toHaveLength(2);
    expect(partnerDraftPrompt(state)).toContain('не станет активной');
  });

  it('accepts Telegram location, rejects coordinates outside coverage and invalid dates', () => {
    expect(
      parsePartnerCoordinates(
        { location: { latitude: 52, longitude: 47.8 } },
        'balakovo',
      ),
    ).toEqual({ latitude: 52, longitude: 47.8 });
    expect(
      parsePartnerCoordinates({ text: '55.7, 37.6' }, 'balakovo'),
    ).toBeNull();
    expect(parsePlacementDate('2026-10-10T12:00')).toBeNull();
    expect(parsePlacementDate('2026-10-10T12:00+04:00')).toBe(
      '2026-10-10T08:00:00.000Z',
    );
    const state: PartnerDraftState = {
      kind: 'POINT',
      step: 'ENDS_AT',
      revision: 0,
      payload: {
        cityId: 'balakovo',
        contacts: [],
        startsAt: '2026-10-20T00:00:00.000Z',
      },
    };
    expect(enter(state, '2026-10-19T23:00:00Z').error).toContain(
      'позже начала',
    );
  });

  it('keeps existing fields during edit and can clear contacts explicitly', () => {
    const state: PartnerDraftState = {
      kind: 'POINT',
      step: 'TITLE',
      revision: 3,
      payload: {
        cityId: 'balakovo',
        editingId: 'id',
        title: 'Старое название',
        contacts: [
          { type: 'PHONE', label: 'Телефон', value: '123', displayOrder: 0 },
        ],
      },
    };
    const kept = enter(state, '/keep').state;
    expect((kept.payload as { title: string }).title).toBe('Старое название');
    expect(state.step).toBe('TITLE');
    const choice = { ...kept, step: 'CONTACT_CHOICE' };
    const cleared = enter(choice, '/clear_contacts').state;
    expect((cleared.payload as { contacts: unknown[] }).contacts).toEqual([]);
  });

  it('keeps case, skips or clears a promo code, and rejects hard-to-copy input', () => {
    const state: PartnerDraftState = {
      kind: 'POINT',
      step: 'PROMO_CODE',
      revision: 2,
      payload: { cityId: 'balakovo', contacts: [], promoCode: 'oldCode-5' },
    };
    expect(parsePartnerPromoCode('  onMap-25  ')).toBe('onMap-25');
    expect(parsePartnerPromoCode('абв_20')).toBe('абв_20');
    expect(parsePartnerPromoCode('AB')).toBeNull();
    expect(parsePartnerPromoCode('A'.repeat(33))).toBeNull();
    expect(parsePartnerPromoCode('two words')).toBeNull();
    expect(parsePartnerPromoCode('bad/link')).toBeNull();
    expect(enter(state, 'bad code').error).toContain('без пробелов');
    expect(enter(state, '/skip').state.payload).toMatchObject({
      promoCode: 'oldCode-5',
    });
    expect(enter(state, 'New-7').state.payload).toMatchObject({
      promoCode: 'New-7',
    });
    expect(enter(state, '/clear_promo').state.payload).toMatchObject({
      promoCode: null,
    });
    expect(enter(state, '/clear_promo').state.step).toBe('PREVIEW');
  });

  it('rejects malformed colors and unreadable pairs without advancing the draft', () => {
    const state: PartnerDraftState = {
      kind: 'POINT',
      step: 'BACKGROUND_COLOR',
      revision: 4,
      payload: { cityId: 'balakovo', contacts: [] },
    };
    expect(enter(state, 'red').error).toContain('#RRGGBB');
    const background = enter(state, '#F7F4EA').state;
    expect(enter(background, '#FFFFFF').error).toContain('контрастную');
    expect(enter(background, '#14241E').state).toMatchObject({
      step: 'IMAGE',
      payload: { backgroundColor: '#F7F4EA', textColor: '#14241E' },
    });
    expect(enter(state, '/keep').state).toMatchObject({
      step: 'TEXT_COLOR',
      payload: { backgroundColor: '#153D32' },
    });
  });
});

describe('partner bot banner wizard', () => {
  it('requires a separate banner preview and confirmation', () => {
    let state: PartnerDraftState = {
      kind: 'BANNER',
      step: 'TITLE',
      revision: 0,
      payload: { cityId: 'balakovo' },
    };
    const values = [
      'Выгодное предложение',
      'Скидка сегодня',
      'Подробнее',
      'https://example.com',
      '00000000-0000-4000-8000-000000000001',
      '2026-10-10T12:00+04:00',
      '2026-10-20T12:00+04:00',
    ];
    for (const text of values) {
      const result = advancePartnerDraft(state, { text }, now);
      expect(result.error).toBeUndefined();
      state = result.state;
    }
    expect(state.step).toBe('PREVIEW');
    expect(partnerDraftPrompt(state)).toContain(
      'не продлевает и не включает точку',
    );
    expect(
      advancePartnerDraft(state, { text: 'ещё текст' }, now).error,
    ).toContain('кнопку');
  });
});
