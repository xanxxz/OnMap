export const pad = value => String(value).padStart(2, '0');
export function parseDay(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const date = new Date(0);
  date.setUTCFullYear(+m[1], +m[2] - 1, +m[3]);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10) === raw ? date : null;
}
export const dayKey = date =>
  `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
export function addDays(raw, amount) {
  const d = parseDay(raw);
  if (!d) return raw;
  d.setUTCDate(d.getUTCDate() + amount);
  return dayKey(d);
}
export function monthGrid(year, month) {
  const first = new Date(0);
  first.setUTCFullYear(year, month, 1);
  first.setUTCHours(0, 0, 0, 0);
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(i - offset + 1);
    return {
      key: dayKey(d),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month,
    };
  });
}
export function parseCalendarInput(raw) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  const key = m ? `${m[3]}-${m[2]}-${m[1]}` : raw;
  return parseDay(key) ? key : null;
}
export function displayDate(value) {
  const [day, time] = value.split('T'),
    d = parseDay(day ?? '');
  return d
    ? `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${time || '00:00'}`
    : 'Выберите дату и время';
}
export function calendarValue(day, hour, minute) {
  return parseDay(day) &&
    /^\d{1,2}$/.test(hour) &&
    /^\d{1,2}$/.test(minute) &&
    +hour < 24 &&
    +minute < 60
    ? `${day}T${pad(+hour)}:${pad(+minute)}`
    : null;
}
export function filteredOptions(options, query) {
  const normalized = query.trim().toLocaleLowerCase('ru-RU');
  return options.filter(option =>
    option.label.toLocaleLowerCase('ru-RU').includes(normalized),
  );
}
export function optionIndex(current, delta, length) {
  return length ? (current + delta + length) % length : -1;
}
export function popupRect(anchor, size, viewport) {
  const padding = 12,
    gap = 6,
    width = Math.max(
      0,
      Math.min(size.width || anchor.width, viewport.width - padding * 2),
    );
  const below = viewport.height - anchor.bottom - gap - padding,
    above = anchor.top - gap - padding;
  const up = below < size.height && above > below,
    available = Math.max(80, up ? above : below),
    height = Math.min(size.height, available, viewport.height - padding * 2);
  return {
    left: Math.max(
      padding,
      Math.min(anchor.left, viewport.width - width - padding),
    ),
    top: Math.max(
      padding,
      up ? anchor.top - gap - height : anchor.bottom + gap,
    ),
    width,
    height,
    up,
  };
}
export function hexRgb(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex)
    ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
    : null;
}
export const rgbHex = channels =>
  '#' +
  channels
    .map(v =>
      Math.min(255, Math.max(0, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
