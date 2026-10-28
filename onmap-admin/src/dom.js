/** Small DOM primitives: all API/form text is inserted as text, never markup.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string,string|number|boolean>} [attrs]
 * @param {unknown} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') node.className = String(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [children].flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
  return node;
}

const paths = {
  pin: [
    'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z',
    'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  ],
  search: ['M17 17l4 4', 'M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z'],
  plus: ['M12 5v14M5 12h14'],
  arrow: ['M7 17 17 7M7 7h10v10'],
  right: ['m9 5 7 7-7 7'],
  down: ['m6 9 6 6 6-6'],
  back: ['m12 5-7 7 7 7M5 12h15'],
  close: ['m6 6 12 12M6 18 18 6'],
  check: ['m5 12 4 4L19 6'],
  clock: ['M12 8v5l3 2', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  calendar: ['M4 5h16v16H4zM8 2v6M16 2v6M4 10h16'],
  people: [
    'M9 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM21 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM1 21v-3a5 5 0 0 1 10 0v3M13 21v-3a5 5 0 0 1 10 0v3',
  ],
  speaker: ['M3 10h4l12-6v16L7 14H3zM7 14l2 7h4l-2-5'],
  eye: [
    'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z',
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  ],
  bars: ['M4 20v-6M10 20V9M16 20V4M22 20H1'],
  pointer: ['m5 3 15 9-7 2-3 7Z'],
  link: [
    'm9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 7l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  ],
  phone: [
    'M5 3h4l2 5-3 2a16 16 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2Z',
  ],
  mail: ['M3 5h18v14H3zM3 5l9 8 9-8'],
  globe: [
    'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2a22 22 0 0 1 0 20 22 22 0 0 1 0-20Z',
  ],
  image: ['M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4', 'M17 7h.01'],
  tag: ['M3 3h8l10 10-8 8L3 11ZM7 7h.01'],
  settings: ['M4 7h16M4 17h16M8 4v6M16 14v6'],
  lock: ['M5 10h14v12H5zM8 10V6a4 4 0 0 1 8 0v4M12 15v3'],
  refresh: ['M20 7V2l-4 4A9 9 0 1 0 4 18M20 7h-5M4 17v5l4-4M4 17h5'],
  logout: ['M9 3H3v18h6M8 12h13m-5-5 5 5-5 5'],
  trash: ['M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7'],
  up: ['m6 15 6-6 6 6'],
  info: ['M12 11v6M12 7h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  warning: ['m12 2 11 20H1ZM12 9v5M12 18h.01'],
  target: [
    'M12 1v5M12 18v5M1 12h5M18 12h5',
    'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  ],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  user: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
};
export function icon(name, size = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.65,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    class: 'icon',
  }))
    svg.setAttribute(k, String(v));
  for (const d of paths[name] ?? paths.info) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
export function button(label, onClick, className = '', symbol) {
  const node = el('button', { type: 'button', class: className }, [
    symbol ? icon(symbol, 18) : null,
    label,
  ]);
  if (onClick) node.addEventListener('click', onClick);
  return node;
}
export function iconButton(label, symbol, onClick, className = '') {
  const node = button('', onClick, 'icon-button ' + className, symbol);
  node.setAttribute('aria-label', label);
  node.dataset.tooltip = label;
  return node;
}
