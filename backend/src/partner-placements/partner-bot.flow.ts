import {
  getCityConfig,
  isCoordinateInsideCityCoverage,
} from '../cities/city.registry';
import { formatCityTime } from '../cities/city-local-time';
import {
  DEFAULT_PARTNER_BACKGROUND_COLOR,
  DEFAULT_PARTNER_TEXT_COLOR,
  isReadablePartnerColors,
  parsePartnerColor,
} from './partner-placement-colors';

export type PartnerBotKind = 'POINT' | 'BANNER';
export type PartnerContactKind =
  'PHONE' | 'EMAIL' | 'WEBSITE' | 'TELEGRAM' | 'OTHER';

export interface ContactDraft {
  id?: string;
  type: PartnerContactKind;
  label: string;
  value: string;
  displayOrder: number;
}

export interface PointDraft {
  cityId: string;
  editingId?: string;
  quickEdit?: 'CONTACTS' | 'IMAGE' | 'PROMO' | 'FIELD';
  quickEditStep?: string;
  title?: string;
  category?: string;
  backgroundColor?: string;
  textColor?: string;
  imageAssetKey?: string | null;
  originalImageAssetKey?: string | null;
  promoCode?: string | null;
  promoTerms?: string | null;
  description?: string | null;
  latitude?: number;
  longitude?: number;
  displayAddress?: string | null;
  contacts: ContactDraft[];
  pendingContact?: Partial<ContactDraft> & { editingIndex?: number };
  startsAt?: string;
  endsAt?: string;
  dateSelection?: { day?: string; hour?: number; page?: number };
}

export interface BannerDraft {
  cityId: string;
  quickEditEndStep?: 'TEXT' | 'BUTTON_URL' | 'ENDS_AT';
  preserveEnabled?: boolean;
  title?: string;
  text?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  partnerPointId?: string;
  pointChoices?: Array<{ id: string; title: string }>;
  startsAt?: string;
  endsAt?: string;
  dateSelection?: { day?: string; hour?: number; page?: number };
}

export interface PartnerDraftState {
  kind: PartnerBotKind;
  step: string;
  payload: PointDraft | BannerDraft;
  revision: number;
}

export interface PartnerBotInput {
  text?: string;
  location?: { latitude: number; longitude: number };
  action?: 'ADD_CONTACT' | 'DONE_CONTACTS';
}

const CONTACT_TYPES = new Set<PartnerContactKind>([
  'PHONE',
  'EMAIL',
  'WEBSITE',
  'TELEGRAM',
  'OTHER',
]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/iu;

export const parsePlacementDate = (raw: string): string | null => {
  if (!ISO_WITH_ZONE.test(raw)) return null;
  const day = raw.slice(0, 10);
  const calendar = new Date(day + 'T00:00:00Z');
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== day
  )
    return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export const parsePartnerPromoCode = (raw: string): string | null => {
  const code = raw.trim();
  return /^[\p{L}\p{N}_-]{3,32}$/u.test(code) ? code : null;
};

export const parsePartnerCoordinates = (
  input: PartnerBotInput,
  cityId: string,
): { latitude: number; longitude: number } | null => {
  const city = getCityConfig(cityId);
  if (!city) return null;
  let latitude = input.location?.latitude;
  let longitude = input.location?.longitude;
  if (latitude === undefined || longitude === undefined) {
    const match =
      /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/u.exec(
        input.text ?? '',
      );
    if (!match) return null;
    latitude = Number(match[1]);
    longitude = Number(match[2]);
  }
  return isCoordinateInsideCityCoverage(city, latitude, longitude)
    ? { latitude, longitude }
    : null;
};

export const isSafePartnerButtonUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname !== 'localhost' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
};

const field = (value: string | null | undefined) =>
  value ? ` Текущее: ${value}. /keep — оставить.` : '';

const displayPeriod = (
  cityId: string,
  start?: string,
  end?: string,
): string => {
  const timeZone = getCityConfig(cityId)?.timeZone;
  if (!timeZone) return 'часовой пояс города не задан';
  const render = (value?: string) =>
    value ? formatCityTime(new Date(value), timeZone) : 'не выбрано';
  return `${render(start)} — ${render(end)}`;
};

export const partnerDraftPrompt = (state: PartnerDraftState): string => {
  const payload = state.payload;
  if (state.kind === 'POINT') {
    const point = payload as PointDraft;
    switch (state.step) {
      case 'TITLE':
        return `Название точки (до 160 символов).${field(point.title)}`;
      case 'CATEGORY':
        return `Категория (до 64 символов).${field(point.category)}`;
      case 'DESCRIPTION':
        return `Описание (до 1000 символов); /skip — без описания.${field(point.description)}`;
      case 'COORDINATE':
        return 'Пришлите геопозицию Telegram или координаты «широта, долгота» в пределах города.';
      case 'ADDRESS':
        return `Отображаемый адрес (до 240 символов); /skip — без адреса.${field(point.displayAddress)}`;
      case 'CONTACT_CHOICE':
        return `Контактов: ${point.contacts.length}. Нажмите «Добавить контакт» или «Готово». /clear_contacts — удалить существующие.`;
      case 'CONTACT_TYPE':
        return 'Выберите тип контакта: телефон, почта, сайт, Telegram или другое.';
      case 'CONTACT_LABEL':
        return 'Подпись контакта (до 80 символов).';
      case 'CONTACT_VALUE':
        return 'Значение контакта (до 500 символов).';
      case 'STARTS_AT':
        return `Выберите начало размещения кнопками по местному времени города.${field(point.startsAt)}`;
      case 'ENDS_AT':
        return `Выберите окончание размещения кнопками. Оно должно быть позже начала и текущего времени.${field(point.endsAt)}`;
      case 'BACKGROUND_COLOR':
        return `Цвет плашки и кнопки карточки: #RRGGBB. Выберите кнопку ниже или пришлите HEX.${field(point.backgroundColor ?? DEFAULT_PARTNER_BACKGROUND_COLOR)}`;
      case 'TEXT_COLOR':
        return `Цвет текста на выбранном фоне: #RRGGBB. Выберите кнопку или пришлите HEX. Контраст должен быть не ниже 4.5:1.${field(point.textColor ?? DEFAULT_PARTNER_TEXT_COLOR)}`;
      case 'IMAGE':
        return `Пришлите PNG, JPEG или WebP как фото или файл (до 4 МБ). Изображение станет квадратной прозрачной меткой без обрезки. /skip — ${point.imageAssetKey ? 'оставить текущее' : 'без изображения'}.`;
      case 'PROMO_CODE':
        return `Промокод: 3–32 буквы/цифры, дефис или _. Без пробелов. /skip — ${point.promoCode ? 'оставить текущий' : 'без промокода'}; /clear_promo — удалить.${field(point.promoCode)}`;
      case 'PROMO_TERMS':
        return `Условия промокода (до 240 символов); /skip — ${point.promoTerms ? 'оставить текущие' : 'не указывать'}, /clear_terms — убрать условия.${field(point.promoTerms)}`;
      default:
        return partnerPointPreview(point);
    }
  }
  const banner = payload as BannerDraft;
  switch (state.step) {
    case 'TITLE':
      return `Заголовок баннера (до 160 символов).${field(banner.title)}`;
    case 'TEXT':
      return `Текст баннера (до 300 символов).${field(banner.text)}`;
    case 'BUTTON_LABEL':
      return `Подпись кнопки (до 80 символов).${field(banner.buttonLabel)}`;
    case 'BUTTON_URL':
      return `HTTPS-ссылка кнопки.${field(banner.buttonUrl)}`;
    case 'POINT_ID':
      return `ID связанной точки.${field(banner.partnerPointId)}`;
    case 'STARTS_AT':
      return `Начало баннера: выберите дату и время кнопками по местному времени города.${field(banner.startsAt)}`;
    case 'ENDS_AT':
      return `Окончание баннера: выберите дату и время кнопками по местному времени города.${field(banner.endsAt)}`;
    default:
      return partnerBannerPreview(banner);
  }
};

const partnerPointPreview = (point: PointDraft): string =>
  [
    'Предпросмотр партнёрской точки',
    `${point.title} · ${point.category}`,
    point.description ?? 'Без описания',
    `Координаты: ${point.latitude}, ${point.longitude}`,
    `Адрес: ${point.displayAddress ?? 'не указан'}`,
    `Контактов: ${point.contacts.length}`,
    `Цвет: ${point.backgroundColor ?? DEFAULT_PARTNER_BACKGROUND_COLOR} / текст ${point.textColor ?? DEFAULT_PARTNER_TEXT_COLOR}`,
    `Изображение метки: ${point.imageAssetKey ? 'есть' : 'нет'}`,
    `Промокод: ${point.promoCode ?? 'не указан'}`,
    ...(point.promoCode && point.promoTerms
      ? [`Условия: ${point.promoTerms}`]
      : []),
    `Срок: ${displayPeriod(point.cityId, point.startsAt, point.endsAt)}`,
    'Точка не станет активной, пока вы не нажмёте «Подтвердить».',
  ].join('\n');

const partnerBannerPreview = (banner: BannerDraft): string =>
  [
    'Предпросмотр баннера',
    banner.title ?? '',
    banner.text ?? '',
    `Кнопка: ${banner.buttonLabel} → ${banner.buttonUrl}`,
    `Связанная точка: ${banner.partnerPointId}`,
    'Фон и цвет текста берутся из связанной точки.',
    `Срок: ${displayPeriod(banner.cityId, banner.startsAt, banner.endsAt)}`,
    banner.preserveEnabled === false
      ? 'Изменения не включат баннер. Для включения нужна отдельная кнопка. Он не продлевает и не включает точку.'
      : 'Баннер не продлевает и не включает точку.',
  ].join('\n');

export const advancePartnerDraft = (
  state: PartnerDraftState,
  input: PartnerBotInput,
  now: Date,
): { state: PartnerDraftState; error?: string } => {
  const text = input.text?.trim() ?? '';
  const next = structuredClone(state);
  const fail = (message: string) => ({ state, error: message });
  if (state.step === 'PREVIEW')
    return fail('Используйте кнопку подтверждения или /partner_cancel.');

  if (state.kind === 'POINT') {
    const point = next.payload as PointDraft;
    switch (state.step) {
      case 'TITLE':
      case 'CATEGORY':
      case 'DESCRIPTION':
      case 'ADDRESS': {
        const key =
          state.step === 'TITLE'
            ? 'title'
            : state.step === 'CATEGORY'
              ? 'category'
              : state.step === 'DESCRIPTION'
                ? 'description'
                : 'displayAddress';
        const max =
          key === 'title'
            ? 160
            : key === 'category'
              ? 64
              : key === 'description'
                ? 1000
                : 240;
        const current = point[key];
        const optional = key === 'description' || key === 'displayAddress';
        if (text === '/keep' && current !== undefined && current !== null) {
          // Keep the current value when editing.
        } else if (text === '/skip' && optional) {
          point[key] = null;
        } else if (!text || text.startsWith('/') || text.length > max) {
          return fail(`Введите значение длиной 1–${max} символов.`);
        } else {
          point[key] = text;
        }
        next.step =
          state.step === 'TITLE'
            ? 'CATEGORY'
            : state.step === 'CATEGORY'
              ? 'DESCRIPTION'
              : state.step === 'DESCRIPTION'
                ? 'COORDINATE'
                : 'CONTACT_CHOICE';
        break;
      }
      case 'COORDINATE': {
        if (
          text !== '/keep' ||
          point.latitude === undefined ||
          point.longitude === undefined
        ) {
          const coordinates = parsePartnerCoordinates(input, point.cityId);
          if (!coordinates)
            return fail(
              'Координаты не распознаны или находятся вне покрытия города.',
            );
          Object.assign(point, coordinates);
        }
        next.step = 'ADDRESS';
        break;
      }
      case 'CONTACT_CHOICE':
        if (text === '/clear_contacts') {
          point.contacts = [];
          break;
        }
        if (input.action === 'ADD_CONTACT' || text === '/add_contact') {
          point.pendingContact = {};
          next.step = 'CONTACT_TYPE';
        } else if (input.action === 'DONE_CONTACTS' || text === '/done') {
          next.step = 'STARTS_AT';
        } else return fail('Выберите «Добавить контакт» или «Готово».');
        break;
      case 'CONTACT_TYPE': {
        const type = text.toUpperCase() as PartnerContactKind;
        if (!CONTACT_TYPES.has(type)) return fail('Недопустимый тип контакта.');
        point.pendingContact = { ...point.pendingContact, type };
        next.step = 'CONTACT_LABEL';
        break;
      }
      case 'CONTACT_LABEL':
        if (!text || text.startsWith('/') || text.length > 80)
          return fail('Подпись: 1–80 символов.');
        point.pendingContact = { ...point.pendingContact, label: text };
        next.step = 'CONTACT_VALUE';
        break;
      case 'CONTACT_VALUE': {
        if (!text || text.startsWith('/') || text.length > 500)
          return fail('Значение: 1–500 символов.');
        const contact: ContactDraft = {
          ...(point.pendingContact?.editingIndex !== undefined &&
          point.contacts[point.pendingContact.editingIndex]?.type ===
            point.pendingContact.type &&
          point.contacts[point.pendingContact.editingIndex]?.value === text &&
          point.contacts[point.pendingContact.editingIndex]?.id
            ? { id: point.contacts[point.pendingContact.editingIndex].id }
            : {}),
          type: point.pendingContact?.type as PartnerContactKind,
          label: point.pendingContact?.label ?? '',
          value: text,
          displayOrder:
            point.pendingContact?.editingIndex === undefined
              ? Math.max(
                  -1,
                  ...point.contacts.map((existing) => existing.displayOrder),
                ) + 1
              : (point.contacts[point.pendingContact.editingIndex]
                  ?.displayOrder ?? 0),
        };
        if (point.pendingContact?.editingIndex === undefined)
          point.contacts.push(contact);
        else point.contacts[point.pendingContact.editingIndex] = contact;
        delete point.pendingContact;
        next.step = 'CONTACT_CHOICE';
        break;
      }
      case 'STARTS_AT':
      case 'ENDS_AT': {
        const value =
          text === '/keep'
            ? point[state.step === 'STARTS_AT' ? 'startsAt' : 'endsAt']
            : parsePlacementDate(text);
        if (!value) return fail('Укажите ISO дату и время с часовым поясом.');
        if (state.step === 'STARTS_AT') {
          point.startsAt = value;
          delete point.dateSelection;
          next.step = 'ENDS_AT';
        } else {
          if (
            new Date(value) <= new Date(point.startsAt ?? '') ||
            new Date(value) <= now
          )
            return fail('Конец должен быть позже начала и текущего времени.');
          point.endsAt = value;
          delete point.dateSelection;
          next.step = 'BACKGROUND_COLOR';
        }
        break;
      }
      case 'BACKGROUND_COLOR':
      case 'TEXT_COLOR': {
        const key =
          state.step === 'BACKGROUND_COLOR' ? 'backgroundColor' : 'textColor';
        const current =
          point[key] ??
          (key === 'backgroundColor'
            ? DEFAULT_PARTNER_BACKGROUND_COLOR
            : DEFAULT_PARTNER_TEXT_COLOR);
        const color = parsePartnerColor(text === '/keep' ? current : text);
        if (!color) return fail('Укажите цвет строго в формате #RRGGBB.');
        if (
          key === 'textColor' &&
          !isReadablePartnerColors(
            point.backgroundColor ?? DEFAULT_PARTNER_BACKGROUND_COLOR,
            color,
          )
        )
          return fail(
            'Текст будет плохо читаться. Выберите более контрастную пару цветов.',
          );
        point[key] = color;
        next.step = key === 'backgroundColor' ? 'TEXT_COLOR' : 'IMAGE';
        break;
      }
      case 'IMAGE':
        if (text !== '/skip' && text !== '/keep')
          return fail('Пришлите PNG, JPEG или WebP либо /skip.');
        next.step = point.quickEdit === 'IMAGE' ? 'PREVIEW' : 'PROMO_CODE';
        break;
      case 'PROMO_CODE': {
        if (text === '/clear_promo') {
          point.promoCode = null;
          point.promoTerms = null;
        } else if (text !== '/skip' && text !== '/keep') {
          const code = parsePartnerPromoCode(text);
          if (!code)
            return fail(
              'Промокод: 3–32 буквы/цифры, дефис или _, без пробелов.',
            );
          point.promoCode = code;
        }
        next.step = point.promoCode ? 'PROMO_TERMS' : 'PREVIEW';
        break;
      }
      case 'PROMO_TERMS': {
        if (!point.promoCode) return fail('Сначала укажите промокод.');
        if (text === '/clear_terms') point.promoTerms = null;
        else if (text === '/skip' || text === '/keep') {
          // Existing terms remain, including null for legacy codes.
        } else if (!text || text.startsWith('/') || text.length > 240)
          return fail('Условия: 1–240 символов.');
        else point.promoTerms = text;
        next.step = 'PREVIEW';
        break;
      }
    }
  } else {
    const banner = next.payload as BannerDraft;
    const fields: Record<
      string,
      { key: keyof BannerDraft; max: number; next: string }
    > = {
      TITLE: { key: 'title', max: 160, next: 'TEXT' },
      TEXT: { key: 'text', max: 300, next: 'BUTTON_LABEL' },
      BUTTON_LABEL: { key: 'buttonLabel', max: 80, next: 'BUTTON_URL' },
      BUTTON_URL: { key: 'buttonUrl', max: 2048, next: 'POINT_ID' },
      POINT_ID: { key: 'partnerPointId', max: 36, next: 'STARTS_AT' },
    };
    const fieldConfig = fields[state.step];
    if (fieldConfig) {
      const value = text === '/keep' ? banner[fieldConfig.key] : text;
      if (
        typeof value !== 'string' ||
        !value ||
        value.startsWith('/') ||
        value.length > fieldConfig.max
      )
        return fail(`Введите значение длиной 1–${fieldConfig.max} символов.`);
      if (state.step === 'BUTTON_URL' && !isSafePartnerButtonUrl(value))
        return fail('Нужна корректная HTTPS-ссылка без учётных данных.');
      if (state.step === 'POINT_ID' && !UUID.test(value))
        return fail('Нужен UUID связанной точки.');
      Object.assign(banner, { [fieldConfig.key]: value });
      next.step = fieldConfig.next;
    } else if (state.step === 'STARTS_AT' || state.step === 'ENDS_AT') {
      const key = state.step === 'STARTS_AT' ? 'startsAt' : 'endsAt';
      const value = text === '/keep' ? banner[key] : parsePlacementDate(text);
      if (!value) return fail('Укажите ISO дату и время с часовым поясом.');
      if (
        state.step === 'ENDS_AT' &&
        (new Date(value) <= new Date(banner.startsAt ?? '') ||
          new Date(value) <= now)
      )
        return fail('Конец должен быть позже начала и текущего времени.');
      banner[key] = value;
      delete banner.dateSelection;
      next.step = state.step === 'STARTS_AT' ? 'ENDS_AT' : 'PREVIEW';
    }
  }
  if (
    state.kind === 'POINT' &&
    (next.payload as PointDraft).quickEdit === 'FIELD' &&
    (next.payload as PointDraft).quickEditStep === state.step
  ) {
    next.step = 'PREVIEW';
  }
  if (
    state.kind === 'BANNER' &&
    (next.payload as BannerDraft).quickEditEndStep === state.step
  ) {
    next.step = 'PREVIEW';
  }
  next.revision += 1;
  return { state: next };
};
