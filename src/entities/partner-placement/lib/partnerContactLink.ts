import type {PartnerContact} from '../model/partnerPlacement';

export const getPartnerContactUrl = (contact: PartnerContact): string | null => {
  const value = contact.value.trim();
  if (contact.type === 'PHONE') {
    const phone = value.replace(/[\s()-]/gu, '');
    return /^\+?[0-9]{5,15}$/u.test(phone) ? `tel:${phone}` : null;
  }
  if (contact.type === 'EMAIL') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
      ? `mailto:${encodeURIComponent(value)}`
      : null;
  }
  if (contact.type === 'TELEGRAM' && /^@[A-Za-z0-9_]{5,32}$/u.test(value)) {
    return `https://t.me/${value.slice(1)}`;
  }
  if (contact.type === 'WEBSITE' || contact.type === 'TELEGRAM' || contact.type === 'OTHER') {
    try {
      const url = new URL(value);
      if (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        url.hostname !== 'localhost'
      ) return url.toString();
    } catch {
      return null;
    }
  }
  return null;
};
