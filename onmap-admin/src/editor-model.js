import { cityDateToIso, localDateTime } from './api.js';
export const statusLabels = {
  DRAFT: 'Черновик',
  ACTIVE: 'Активна',
  PAUSED: 'На паузе',
  ENDED: 'Завершена',
};
export const contactLabels = {
  PHONE: 'Телефон',
  EMAIL: 'Электронная почта',
  WEBSITE: 'Сайт',
  TELEGRAM: 'Telegram',
  OTHER: 'Другая ссылка',
};
export const groupLabels = [
  ['main', 'Основное', 'settings'],
  ['address', 'Адрес и карта', 'pin'],
  ['contacts', 'Контакты', 'phone'],
  ['promo', 'Промокод', 'tag'],
  ['appearance', 'Оформление', 'image'],
  ['period', 'Срок размещения', 'calendar'],
];
export const clone = value => structuredClone(value);
export function newPoint(city, now = new Date()) {
  return {
    cityId: city.id,
    title: '',
    category: '',
    description: '',
    displayAddress: '',
    latitude: city.center.latitude,
    longitude: city.center.longitude,
    backgroundColor: '#153D32',
    textColor: '#FDFBF4',
    promoCode: '',
    promoTerms: '',
    startsAt: now.toISOString(),
    endsAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
    contacts: [],
    status: 'DRAFT',
    imageAssetKey: null,
  };
}
export function contactUrl(contact) {
  const value = String(contact.value ?? '').trim();
  if (contact.type === 'PHONE') {
    const p = value.replace(/[\s()-]/gu, '');
    return /^\+?[0-9]{5,15}$/u.test(p) ? `tel:${p}` : null;
  }
  if (contact.type === 'EMAIL')
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
      ? `mailto:${encodeURIComponent(value)}`
      : null;
  if (contact.type === 'TELEGRAM' && /^@[A-Za-z0-9_]{5,32}$/u.test(value))
    return `https://t.me/${value.slice(1)}`;
  if (!['WEBSITE', 'TELEGRAM', 'OTHER'].includes(contact.type)) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      u.hostname !== 'localhost'
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function contactPayload(contacts) {
  return contacts.map((c, index) => ({
    ...(c.id ? { id: c.id } : {}),
    type: c.type,
    label: c.label.trim(),
    value: c.value.trim(),
    displayOrder: index,
  }));
}
export function moveContact(contacts, index, direction) {
  const to = index + direction;
  if (to < 0 || to >= contacts.length) return contacts;
  const result = [...contacts];
  [result[index], result[to]] = [result[to], result[index]];
  return result;
}
export function pointFormData(point, city) {
  return {
    ...clone(point),
    description: point.description ?? '',
    displayAddress: point.displayAddress ?? '',
    promoCode: point.promoCode ?? '',
    promoTerms: point.promoTerms ?? '',
    startsAt: localDateTime(point.startsAt, city.timeZone),
    endsAt: localDateTime(point.endsAt, city.timeZone),
  };
}
export function pointPayload(draft, city) {
  return {
    cityId: draft.cityId,
    title: draft.title.trim(),
    category: draft.category.trim(),
    description: draft.description.trim() || null,
    displayAddress: draft.displayAddress.trim() || null,
    latitude: Number(draft.latitude),
    longitude: Number(draft.longitude),
    backgroundColor: draft.backgroundColor.toUpperCase(),
    textColor: draft.textColor.toUpperCase(),
    promoCode: draft.promoCode.trim() || null,
    promoTerms: draft.promoTerms.trim() || null,
    startsAt: cityDateToIso(draft.startsAt, city.timeZone),
    endsAt: cityDateToIso(draft.endsAt, city.timeZone),
    contacts: contactPayload(draft.contacts),
    ...(draft.id ? { expectedUpdatedAt: draft.updatedAt } : {}),
  };
}
export function bannerPayload(draft, city) {
  return {
    title: draft.title.trim(),
    text: draft.text.trim(),
    buttonLabel: draft.buttonLabel.trim(),
    buttonUrl: draft.buttonUrl.trim(),
    partnerPointId: draft.partnerPointId,
    startsAt: cityDateToIso(draft.startsAt, city.timeZone),
    endsAt: cityDateToIso(draft.endsAt, city.timeZone),
    ...(draft.updatedAt ? { expectedUpdatedAt: draft.updatedAt } : {}),
  };
}
export function validateDraft(draft, city, kind = 'point') {
  const errors = {};
  const required = (key, max) => {
    const value = String(draft[key] ?? '').trim();
    if (!value) errors[key] = 'Заполните это поле';
    else if (value.length > max) errors[key] = `Не более ${max} символов`;
  };
  required('title', 160);
  if (kind === 'point') {
    required('category', 64);
    for (const [key, max] of [
      ['description', 1000],
      ['displayAddress', 240],
      ['promoTerms', 240],
    ])
      if (String(draft[key] ?? '').length > Number(max))
        errors[key] = `Не более ${max} символов`;
    const lat = Number(draft.latitude),
      lng = Number(draft.longitude);
    if (
      String(draft.latitude).trim() === '' ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90
    )
      errors.latitude = 'Широта от −90 до 90';
    if (
      String(draft.longitude).trim() === '' ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    )
      errors.longitude = 'Долгота от −180 до 180';
    if (
      city.bounds &&
      (lat < city.bounds.south ||
        lat > city.bounds.north ||
        lng < city.bounds.west ||
        lng > city.bounds.east)
    )
      errors.latitude = 'Точка должна находиться в зоне выбранного города';
    if (!/^#[0-9a-f]{6}$/iu.test(draft.backgroundColor))
      errors.backgroundColor = 'Цвет в формате #RRGGBB';
    if (!/^#[0-9a-f]{6}$/iu.test(draft.textColor))
      errors.textColor = 'Цвет в формате #RRGGBB';
    const promo = String(draft.promoCode ?? '').trim();
    if (
      promo &&
      (promo.length < 3 ||
        promo.length > 32 ||
        !/^[\p{L}\p{N}_-]+$/u.test(promo))
    )
      errors.promoCode = 'От 3 до 32 букв, цифр, дефисов или подчёркиваний';
    if (draft.contacts.length > 100) errors.contacts = 'Не более 100 контактов';
    draft.contacts.forEach((c, i) => {
      if (!c.label.trim() || c.label.length > 80)
        errors[`contact-${i}-label`] = 'Укажите подпись до 80 символов';
      if (!contactUrl(c) || c.value.length > 500)
        errors[`contact-${i}-value`] =
          'Проверьте номер, email или HTTPS-ссылку';
    });
  } else {
    required('text', 300);
    required('buttonLabel', 80);
    required('buttonUrl', 2048);
    if (!contactUrl({ type: 'WEBSITE', value: draft.buttonUrl }))
      errors.buttonUrl = 'Укажите HTTPS-ссылку без логина и пароля';
    if (!draft.partnerPointId)
      errors.partnerPointId = 'Выберите связанную точку';
  }
  let start, end;
  try {
    start = cityDateToIso(draft.startsAt, city.timeZone);
  } catch {
    errors.startsAt = 'Проверьте дату и местное время начала';
  }
  try {
    end = cityDateToIso(draft.endsAt, city.timeZone);
  } catch {
    errors.endsAt = 'Проверьте дату и местное время окончания';
  }
  if (start && end && end <= start)
    errors.endsAt = 'Окончание должно быть позже начала';
  if (end && new Date(end).getTime() <= Date.now())
    errors.endsAt = 'Окончание должно быть в будущем';
  return errors;
}
/** Compare only editable state. View changes and request retries do not make a form dirty. */
export class DraftSession {
  #saved;
  #pending;
  constructor(value) {
    this.value = clone(value);
    this.#saved = JSON.stringify(value);
  }
  get dirty() {
    return JSON.stringify(this.value) !== this.#saved;
  }
  get mutationKey() {
    this.#pending ??= crypto.randomUUID();
    return this.#pending;
  }
  changed() {
    this.#pending = undefined;
  }
  accept(value) {
    const next = clone(value);
    for (const key of Object.keys(this.value)) delete this.value[key];
    Object.assign(this.value, next);
    this.#saved = JSON.stringify(this.value);
    this.#pending = undefined;
  }
}
