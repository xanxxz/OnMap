import {getPartnerContactUrl} from './partnerContactLink';
import type {PartnerContact} from '../model/partnerPlacement';

const contact = (type: PartnerContact['type'], value: string): PartnerContact => ({
  type, value, label: 'Контакт', displayOrder: 0,
});

it('opens contacts by their type and rejects unsafe links', () => {
  expect(getPartnerContactUrl(contact('PHONE', '+7 (999) 000-00-00'))).toBe('tel:+79990000000');
  expect(getPartnerContactUrl(contact('EMAIL', 'hello@example.com'))).toBe('mailto:hello%40example.com');
  expect(getPartnerContactUrl(contact('TELEGRAM', '@InMapSupport'))).toBe('https://t.me/InMapSupport');
  expect(getPartnerContactUrl(contact('WEBSITE', 'https://example.com'))).toBe('https://example.com/');
  expect(getPartnerContactUrl(contact('OTHER', 'вход со двора'))).toBeNull();
  expect(getPartnerContactUrl(contact('WEBSITE', 'data:text/html,unsafe'))).toBeNull();
});
