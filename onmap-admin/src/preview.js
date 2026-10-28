import { el, icon } from './ui.js';
import { contactUrl } from './editor-model.js';
const HEX = /^#[0-9a-f]{6}$/iu;
const failedImages = new Set();
const contactKeys = new WeakMap();
const contactKey = contact => {
  if (contact.id) return contact.id;
  if (!contactKeys.has(contact)) contactKeys.set(contact, crypto.randomUUID());
  return contactKeys.get(contact);
};
const defaults = { backgroundColor: '#153D32', textColor: '#FDFBF4' };
const luminance = hex => {
  const c = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export function contrast(a, b) {
  if (!HEX.test(a) || !HEX.test(b)) return 1;
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
/** Same visual rules as mobile partnerAppearance; stored values are not mutated. */
export function appearance(point = {}) {
  const source =
    HEX.test(point.backgroundColor) && HEX.test(point.textColor)
      ? { backgroundColor: point.backgroundColor, textColor: point.textColor }
      : defaults;
  const accent =
    contrast(source.backgroundColor, '#F7F4EA') >= 3
      ? source.backgroundColor
      : '#153D32';
  const accentText =
    contrast(source.textColor, accent) >= 4.5
      ? source.textColor
      : contrast('#FDFBF4', accent) >= contrast('#14241E', accent)
        ? '#FDFBF4'
        : '#14241E';
  return { ...source, accent, accentText };
}
export function artwork(url, accent, size = 48) {
  const frame = el(
    'span',
    {
      class: 'partner-artwork',
      'aria-hidden': true,
      'data-preview-key': 'artwork',
    },
    'П',
  );
  frame.style.setProperty('--partner-accent', accent);
  frame.style.width = size + 'px';
  frame.style.height = size + 'px';
  frame.style.fontSize = size * 0.48 + 'px';
  // Only in-memory, authenticated blobs supplied by this app. Never a form-supplied URL.
  if (url?.startsWith('blob:') && !failedImages.has(url)) {
    const img = el('img', { src: url, alt: '' });
    img.addEventListener('error', () => {
      if (failedImages.size > 64) failedImages.clear();
      failedImages.add(url);
      img.remove();
    });
    frame.append(img);
  }
  return frame;
}
function previewButton(children, className = '') {
  return el(
    'button',
    { type: 'button', class: className, tabindex: '-1' },
    children,
  );
}
export function cardPreview(point, imageUrl) {
  const colors = appearance(point);
  const card = el('section', {
    class: 'mobile-card',
    'aria-label': 'Предпросмотр карточки партнёра',
    'data-testid': 'card-preview',
  });
  card.style.setProperty('--partner-accent', colors.accent);
  card.style.setProperty('--partner-brand', colors.backgroundColor);
  card.style.setProperty('--partner-text', colors.textColor);
  const title = point.title?.trim() || 'Название точки';
  card.append(
    el('div', { class: 'sheet-handle' }),
    el('div', { class: 'mobile-card-heading' }, [
      artwork(imageUrl, colors.accent),
      el('div', { class: 'mobile-heading-copy' }, [
        el(
          'p',
          { class: 'mobile-kicker' },
          point.category
            ? `ПАРТНЁР · ${point.category.toLocaleUpperCase('ru-RU')}`
            : 'ПАРТНЁР',
        ),
        el('h3', {}, title),
      ]),
      Object.assign(previewButton(icon('close', 20), 'mobile-close'), {
        ariaLabel: 'Закрыть карточку — предпросмотр',
      }),
    ]),
    el('div', { class: 'mobile-accent-line' }),
  );
  if (point.displayAddress?.trim())
    card.append(
      previewButton(
        [
          el('span', { class: 'mobile-address-icon' }, icon('target', 24)),
          el('span', { class: 'mobile-address-copy' }, [
            el('strong', {}, point.displayAddress),
            el('span', {}, 'Открыть в Яндекс Картах'),
          ]),
          icon('arrow', 22),
        ],
        'mobile-address',
      ),
    );
  if (point.description?.trim())
    card.append(el('p', { class: 'mobile-description' }, point.description));
  if (point.promoCode?.trim())
    card.append(
      el('div', { class: 'mobile-promo' }, [
        el('div', {}, [
          el('span', { class: 'mobile-muted' }, 'Промокод'),
          el('strong', {}, point.promoCode),
        ]),
        point.promoTerms?.trim()
          ? el('span', { class: 'mobile-terms' }, point.promoTerms)
          : null,
        previewButton('Копировать', 'mobile-copy'),
      ]),
    );
  if (point.contacts?.length) {
    const first = point.contacts.findIndex(c => contactUrl(c));
    card.append(
      el('p', { class: 'mobile-contact-heading' }, 'Связаться'),
      ...point.contacts.map((c, i) => {
        const row = previewButton(
          [
            el('span', { class: 'mobile-contact-copy' }, [
              el('strong', {}, c.label || 'Подпись контакта'),
              el('span', {}, c.value),
            ]),
            contactUrl(c)
              ? el('span', { class: 'mobile-contact-arrow' }, icon('right', 18))
              : null,
          ],
          i === first ? 'mobile-contact primary-contact' : 'mobile-contact',
        );
        row.dataset.previewKey = 'contact-' + contactKey(c);
        return row;
      }),
    );
  }
  card.addEventListener('click', event => event.preventDefault());
  return card;
}
export function bannerPreview(banner, point = {}, expanded = false) {
  const colors = appearance(point);
  const node = el('section', {
    class: 'mobile-banner',
    'aria-label': expanded ? 'Раскрытый баннер' : 'Компактный баннер',
    'data-testid': expanded ? 'banner-expanded' : 'banner-compact',
  });
  node.style.setProperty('--partner-accent', colors.accent);
  node.style.setProperty('--partner-accent-text', colors.accentText);
  node.append(
    previewButton(
      [
        el('span', { class: 'mobile-banner-mark' }, 'П'),
        el('span', { class: 'mobile-banner-copy' }, [
          el('span', { class: 'mobile-kicker' }, 'ПАРТНЁР РЯДОМ'),
          el('strong', {}, banner.title?.trim() || 'Заголовок баннера'),
          !expanded
            ? el(
                'span',
                { class: 'mobile-banner-summary' },
                banner.text || 'Текст предложения',
              )
            : null,
        ]),
        el(
          'span',
          { class: 'mobile-banner-toggle' },
          expanded ? 'Свернуть' : 'Открыть',
        ),
      ],
      'mobile-banner-top',
    ),
  );
  if (expanded)
    node.append(
      el('div', { class: 'mobile-banner-details' }, [
        el('p', {}, banner.text || 'Текст предложения'),
        previewButton(
          [banner.buttonLabel || 'Действие', icon('arrow', 20)],
          'mobile-banner-action',
        ),
      ]),
    );
  node.addEventListener('click', event => event.preventDefault());
  return node;
}

/** Update text/attributes in place. Stable image URLs keep their actual Image node. */
function sameNode(current, next) {
  if (current.nodeType !== next.nodeType) return false;
  if (current instanceof Element && next instanceof Element) {
    const key = n =>
      n.getAttribute('data-preview-key') || n.getAttribute('data-testid');
    return (
      current.tagName === next.tagName &&
      key(current) === key(next) &&
      (!(current instanceof HTMLImageElement) ||
        current.getAttribute('src') === next.getAttribute('src'))
    );
  }
  return true;
}
function patch(current, next) {
  if (!sameNode(current, next)) {
    current.replaceWith(next);
    return next;
  }
  if (current.nodeType === Node.TEXT_NODE) {
    if (current.textContent !== next.textContent)
      current.textContent = next.textContent;
    return current;
  }
  if (current instanceof Element && next instanceof Element) {
    for (const attr of [...current.attributes])
      if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    for (const attr of next.attributes)
      if (current.getAttribute(attr.name) !== attr.value)
        current.setAttribute(attr.name, attr.value);
    reconcile(current, [...next.childNodes]);
  }
  return current;
}
function reconcile(parent, children) {
  const original = [...parent.childNodes],
    used = new Set();
  children.forEach((next, index) => {
    const key =
      next instanceof Element ? next.getAttribute('data-preview-key') : null;
    let current = key
      ? original.find(
          n =>
            n instanceof Element && n.getAttribute('data-preview-key') === key,
        )
      : parent.childNodes[index];
    if (current && used.has(current)) current = null;
    if (!current) {
      parent.insertBefore(next, parent.childNodes[index] || null);
      used.add(next);
    } else {
      const node = patch(current, next);
      if (parent.childNodes[index] !== node)
        parent.insertBefore(node, parent.childNodes[index] || null);
      used.add(node);
    }
  });
  for (const node of [...parent.childNodes]) if (!used.has(node)) node.remove();
}
export function updatePreview(container, ...children) {
  reconcile(container, children.flat());
}
