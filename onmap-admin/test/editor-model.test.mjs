import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DraftSession,
  newPoint,
  pointFormData,
  pointPayload,
  bannerPayload,
  moveContact,
  validateDraft,
  contactUrl,
} from '../src/editor-model.js';
import { appearance, contrast } from '../src/preview.js';
const city = {
  id: 'balakovo',
  timeZone: 'Europe/Saratov',
  center: { latitude: 52.02, longitude: 47.8 },
  bounds: { north: 52.2, south: 51.8, east: 48.1, west: 47.4 },
};
const valid = () =>
  pointFormData(
    { ...newPoint(city), title: 'Точка', category: 'Сервис' },
    city,
  );
test('new point and payload contain only editable fields, not status or finance', () => {
  const draft = valid();
  draft.agreedPriceKopecks = 100;
  const payload = pointPayload(draft, city);
  assert.equal(
    payload.startsAt.slice(11, 16),
    new Date(draft.startsAt + '+04:00').toISOString().slice(11, 16),
  );
  for (const key of [
    'id',
    'status',
    'agreedPriceKopecks',
    'imageAssetKey',
    'ownerTelegramId',
  ])
    assert(!(key in payload));
  assert.deepEqual(validateDraft(draft, city), {});
});
test('contact reorder and label edits preserve IDs; type/destination changes still reach backend with original IDs', () => {
  const contacts = [
    { id: 'one', type: 'PHONE', label: 'Первый', value: '+79000000000' },
    { id: 'two', type: 'PHONE', label: 'Второй', value: '+79000000001' },
  ];
  const draft = valid();
  draft.contacts = moveContact(contacts, 1, -1);
  draft.contacts[0].label = 'Новая подпись';
  assert.deepEqual(
    pointPayload(draft, city).contacts.map(c => c.id),
    ['two', 'one'],
  );
  draft.contacts[0].value = '+79000000002';
  assert.equal(pointPayload(draft, city).contacts[0].id, 'two');
  assert.deepEqual(moveContact(contacts, 0, -1), contacts);
});
test('dirty state ignores initial reads and keeps a mutation key for retries; edits invalidate it', () => {
  const state = new DraftSession(valid());
  assert.equal(state.dirty, false);
  const first = state.mutationKey;
  assert.equal(state.mutationKey, first);
  state.value.title = 'Изменено';
  state.changed();
  assert.equal(state.dirty, true);
  assert.notEqual(state.mutationKey, first);
  const reference = state.value;
  state.accept(state.value);
  assert.equal(state.value, reference);
  assert.equal(state.dirty, false);
});
test('null optional fields reopen as empty editable values without changing contact IDs', () => {
  const p = {
    ...newPoint(city),
    description: null,
    promoCode: null,
    promoTerms: null,
    displayAddress: null,
  };
  const draft = pointFormData(p, city);
  assert.equal(draft.description, '');
  assert.equal(pointPayload(draft, city).description, null);
  assert.equal(pointPayload(draft, city).promoCode, null);
});
test('validates required fields, contacts, coverage, impossible dates and promo format used by backend', () => {
  const draft = valid();
  draft.title = '';
  draft.latitude = 80;
  draft.startsAt = '2027-02-30T12:00';
  draft.contacts = [
    { type: 'WEBSITE', label: '', value: 'javascript:alert(1)' },
  ];
  draft.promoCode = 'A.B';
  const errors = validateDraft(draft, city);
  for (const key of [
    'title',
    'latitude',
    'startsAt',
    'contact-0-label',
    'contact-0-value',
    'promoCode',
  ])
    assert(key in errors);
  for (const promo of ['AB', 'A.B', 'WITH SPACE']) {
    draft.promoCode = promo;
    assert(validateDraft(draft, city).promoCode);
  }
  draft.promoCode = 'My_Code-64';
  assert(!validateDraft(draft, city).promoCode);
});
test('banner payload never includes enabled or inherited colours and uses selected point ID', () => {
  const draft = {
    ...valid(),
    text: 'Предложение',
    buttonLabel: 'Подробнее',
    buttonUrl: 'https://example.invalid',
    partnerPointId: 'saved-id',
    enabled: true,
  };
  const payload = bannerPayload(draft, city);
  assert.equal(payload.partnerPointId, 'saved-id');
  assert(!('enabled' in payload));
  assert(!('backgroundColor' in payload));
  assert.deepEqual(validateDraft(draft, city, 'banner'), {});
  draft.partnerPointId = '';
  assert(validateDraft(draft, city, 'banner').partnerPointId);
});
test('web preview uses the mobile contrast rule without mutating saved appearance', () => {
  for (const backgroundColor of ['#ED1C24', '#286348', '#285C78'])
    assert.equal(
      appearance({ backgroundColor, textColor: '#FFFFFF' }).accent,
      backgroundColor,
    );
  const light = { backgroundColor: '#F7F4EA', textColor: '#153D32' };
  assert.equal(appearance(light).accent, '#153D32');
  assert.equal(light.backgroundColor, '#F7F4EA');
  assert(
    contrast(appearance(light).accent, appearance(light).accentText) >= 4.5,
  );
  assert.equal(
    appearance({ backgroundColor: 'transparent', textColor: '#FFFFFF' })
      .backgroundColor,
    '#153D32',
  );
});
test('contact URL availability follows mobile rules while unsafe values stay inert', () => {
  assert.equal(
    contactUrl({ type: 'PHONE', value: '+7 (900) 000-00-00' }),
    'tel:+79000000000',
  );
  assert.equal(
    contactUrl({ type: 'TELEGRAM', value: '@test_owner' }),
    'https://t.me/test_owner',
  );
  assert.equal(
    contactUrl({ type: 'WEBSITE', value: 'javascript:alert(1)' }),
    null,
  );
  assert.equal(contactUrl({ type: 'EMAIL', value: 'invalid' }), null);
});
