import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = path.dirname(fileURLToPath(import.meta.url));
const colors = {
  green: '#0b382e',
  dark: '#092f27',
  lime: '#d8ea70',
  paper: '#f8f6ee',
  coral: '#f4775d',
  muted: '#688078',
};

const concepts = [
  {
    id: 'a',
    name: 'Излучина',
    idea: 'Один жест: течение и буква s.',
    shape: '<path d="M46.6 14.1C39.1 9.8 27.1 9.5 19.5 14.6c-6.4 4.3-7.7 10.9-3.8 15.5 3.4 4.1 10.4 4.6 17.7 5.1 8.1.6 15.5 2.5 16.8 9.4 1.2 6.3-5.3 11.9-16 12.5-6.9.4-13.9-1.3-20.1-5.1" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: 'b',
    name: 'Два берега',
    idea: 'Две формы встречаются у реки.',
    shape: '<path d="M8 8h32c12 0 18 7 18 17s-6 17-18 17h-2V31h2c5 0 7-2 7-6s-2-6-7-6H8V8Z" fill="currentColor"/><path d="M56 56H24C12 56 6 49 6 39s6-17 18-17h2v11h-2c-5 0-7 2-7 6s2 6 7 6h32v11Z" fill="currentColor"/>',
  },
  {
    id: 'c',
    name: 'Б в движении',
    idea: 'Балаково в одном сильном силуэте.',
    shape: '<path fill="currentColor" fill-rule="evenodd" d="M52 8H31C18 8 10 17 10 30v10c0 11 9 18 22 18s22-7 22-18-9-18-22-18h-8c2-2 5-3 9-3h19V8ZM32 34c-6 0-10 2-10 6s4 6 10 6 10-2 10-6-4-6-10-6Z"/>',
  },
];

function standalone(concept, color = colors.green) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" color="${color}" role="img" aria-label="${concept.name}">${concept.shape}</svg>`;
}

function markUse(id, x, y, size, color) {
  return `<use href="#mark-${id}" x="${x}" y="${y}" width="${size}" height="${size}" color="${color}"/>`;
}

function text(x, y, value, size = 22, weight = 400, fill = colors.green, extra = '') {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" ${extra}>${value}</text>`;
}

function line(x1, y1, x2, y2, color = '#d8ddd2') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}"/>`;
}

const blocks = [];
for (const [index, concept] of concepts.entries()) {
  const x = 50 + index * 625;
  const w = 595;
  const inner = x + 26;
  blocks.push(`
    <g>
      <rect x="${x}" y="164" width="${w}" height="1392" rx="26" fill="${colors.paper}"/>
      ${text(inner, 218, `0${index + 1} / ${concept.name}`, 28, 700)}
      ${text(inner, 251, concept.idea, 19, 400, colors.muted)}

      <rect x="${inner}" y="285" width="543" height="270" rx="20" fill="#e7edd8"/>
      ${markUse(concept.id, x + 229, 312, 180, colors.green)}
      ${text(inner + 20, 528, 'Знак · одинаковый масштаб', 15, 600, colors.muted)}

      ${text(inner, 610, 'ХЕДЕР САЙТА', 14, 700, colors.muted, 'letter-spacing="2"')}
      <rect x="${inner}" y="629" width="543" height="82" rx="0" fill="#f8f6ee" stroke="#e8e7dd"/>
      ${markUse(concept.id, inner + 22, 648, 44, colors.green)}
      ${text(inner + 78, 681, 'balakovo-go.ru', 19, 700)}
      ${text(inner + 346, 680, 'Проекты', 14, 500)}
      ${text(inner + 430, 680, 'Опросы', 14, 500)}

      ${text(inner, 765, 'КОМПАКТНАЯ ПАНЕЛЬ', 14, 700, colors.muted, 'letter-spacing="2"')}
      <rect x="${inner + 54}" y="785" width="435" height="66" rx="33" fill="${colors.green}"/>
      ${markUse(concept.id, inner + 70, 797, 42, colors.lime)}
      ${text(inner + 151, 826, 'Проекты', 15, 600, colors.paper)}
      ${text(inner + 238, 826, 'Опросы', 15, 600, colors.paper)}
      ${text(inner + 317, 826, 'sssvam ↗', 15, 600, colors.paper)}
      <circle cx="${inner + 458}" cy="818" r="23" fill="${colors.coral}"/>
      <path d="M${inner + 450} 813h16M${inner + 450} 819h16M${inner + 450} 825h16" stroke="white" stroke-width="2" stroke-linecap="round"/>

      ${text(inner, 905, 'SSSVAM', 14, 700, colors.muted, 'letter-spacing="2"')}
      <rect x="${inner}" y="924" width="543" height="82" fill="#f8f6ee" stroke="#e8e7dd"/>
      ${markUse(concept.id, inner + 22, 943, 44, colors.green)}
      ${text(inner + 78, 976, '← balakovo-go.ru', 17, 700)}
      ${text(inner + 366, 975, 'Работы', 14, 500)}
      ${text(inner + 447, 975, 'Обо мне', 14, 500)}

      ${text(inner, 1063, 'FAVICON В РЕАЛЬНОМ РАЗМЕРЕ', 14, 700, colors.muted, 'letter-spacing="1.2"')}
      <rect x="${inner}" y="1083" width="543" height="118" rx="14" fill="white" stroke="#e8e7dd"/>
      ${markUse(concept.id, inner + 68, 1124, 16, colors.green)}
      ${markUse(concept.id, inner + 202, 1116, 32, colors.green)}
      ${markUse(concept.id, inner + 343, 1100, 64, colors.green)}
      ${text(inner + 63, 1184, '16 px', 15, 600, colors.muted)}
      ${text(inner + 192, 1184, '32 px', 15, 600, colors.muted)}
      ${text(inner + 353, 1184, '64 px', 15, 600, colors.muted)}

      ${text(inner, 1254, 'ОДИН ЦВЕТ · БЕЗ ПОДЛОЖКИ', 14, 700, colors.muted, 'letter-spacing="1.2"')}
      <rect x="${inner}" y="1274" width="263" height="210" rx="14" fill="white" stroke="#e8e7dd"/>
      ${markUse(concept.id, inner + 72, 1316, 120, '#151515')}
      <rect x="${inner + 280}" y="1274" width="263" height="210" rx="14" fill="${colors.green}"/>
      ${markUse(concept.id, inner + 352, 1316, 120, colors.paper)}
    </g>`);
}

const board = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1610" width="1920" height="1610">
  <defs>${concepts.map(concept => `<symbol id="mark-${concept.id}" viewBox="0 0 64 64">${concept.shape}</symbol>`).join('')}</defs>
  <rect width="1920" height="1610" fill="#dce5d4"/>
  ${text(52, 72, 'Балаково Go / sssvam', 41, 700)}
  ${text(52, 111, 'Три направления знака · до выбора', 23, 400, colors.muted)}
  ${blocks.join('')}
  ${line(50, 1581, 1870, 1581, colors.green)}
  ${text(52, 1600, 'Формы показаны без рамки, градиента и дополнительных деталей.', 15, 400, colors.muted)}
</svg>`;

await mkdir(dir, { recursive: true });
for (const concept of concepts) {
  const svg = standalone(concept);
  await writeFile(path.join(dir, `concept-${concept.id}.svg`), svg);
  for (const size of [16, 32, 64]) {
    await sharp(Buffer.from(svg), { density: 72 })
      .resize(size, size)
      .png()
      .toFile(path.join(dir, `concept-${concept.id}-${size}.png`));
  }
}
await writeFile(path.join(dir, 'comparison.svg'), board);
await sharp(Buffer.from(board), { density: 72 }).png().toFile(path.join(dir, 'comparison.png'));

const faviconBase = `<svg xmlns="http://www.w3.org/2000/svg" width="1170" height="468" viewBox="0 0 1170 468">
  <rect width="1170" height="468" fill="#dce5d4"/>
  ${concepts.map((concept, index) => {
    const x = 24 + index * 382;
    return `<g>
      <rect x="${x}" y="24" width="358" height="420" rx="20" fill="${colors.paper}"/>
      ${text(x + 22, 64, `0${index + 1} / ${concept.name}`, 24, 700)}
      ${text(x + 22, 106, 'Светлая вкладка · 16 px', 15, 600, colors.muted)}
      <rect x="${x + 22}" y="121" width="314" height="48" rx="13" fill="#ffffff" stroke="#dce0d7"/>
      ${text(x + 61, 151, 'Балаково Go', 15, 600)}
      ${text(x + 22, 214, 'Тёмная вкладка · 16 px', 15, 600, colors.muted)}
      <rect x="${x + 22}" y="229" width="314" height="48" rx="13" fill="${colors.dark}"/>
      ${text(x + 61, 259, 'Балаково Go', 15, 600, colors.paper)}
      ${text(x + 22, 325, 'Растр 16 px × 8', 15, 600, colors.muted)}
      <rect x="${x + 22}" y="340" width="128" height="80" rx="9" fill="white"/>
      ${text(x + 203, 370, '32 px', 14, 600, colors.muted)}
      ${text(x + 270, 370, '64 px', 14, 600, colors.muted)}
    </g>`;
  }).join('')}
</svg>`;

const faviconOverlays = [];
for (const [index, concept] of concepts.entries()) {
  const x = 24 + index * 382;
  const dark16 = await sharp(Buffer.from(standalone(concept, colors.lime))).resize(16, 16).png().toBuffer();
  const green16 = await sharp(path.join(dir, `concept-${concept.id}-16.png`)).png().toBuffer();
  const magnified16 = await sharp(green16).resize(80, 80, { kernel: 'nearest' }).png().toBuffer();
  faviconOverlays.push(
    { input: green16, left: x + 36, top: 137 },
    { input: dark16, left: x + 36, top: 245 },
    { input: magnified16, left: x + 46, top: 340 },
    { input: path.join(dir, `concept-${concept.id}-32.png`), left: x + 202, top: 380 },
    { input: path.join(dir, `concept-${concept.id}-64.png`), left: x + 270, top: 362 },
  );
}
await sharp(Buffer.from(faviconBase)).composite(faviconOverlays).png().toFile(path.join(dir, 'favicon-check.png'));

const footerBoard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 430" width="1920" height="430">
  <defs>${concepts.map(concept => `<symbol id="mark-${concept.id}" viewBox="0 0 64 64">${concept.shape}</symbol>`).join('')}</defs>
  <rect width="1920" height="430" fill="#dce5d4"/>
  ${concepts.map((concept, index) => {
    const x = 50 + index * 625;
    return `<g>
      ${text(x, 55, `0${index + 1} / ${concept.name}`, 25, 700)}
      <rect x="${x}" y="82" width="595" height="278" rx="18" fill="#103c31"/>
      ${markUse(concept.id, x + 30, 122, 44, colors.lime)}
      ${text(x + 90, 152, 'balakovo-go.ru', 19, 700, colors.paper)}
      ${text(x + 30, 218, 'Балаково, Саратовская область', 17, 400, '#cbd7c8')}
      ${line(x + 30, 257, x + 565, 257, '#4e6c5e')}
      ${text(x + 30, 299, 'OnMap', 14, 400, '#cbd7c8')}
      ${text(x + 110, 299, 'Конфиденциальность', 14, 400, '#cbd7c8')}
      ${text(x + 318, 299, 'Поддержка', 14, 400, '#cbd7c8')}
    </g>`;
  }).join('')}
</svg>`;
await writeFile(path.join(dir, 'footer-check.svg'), footerBoard);
await sharp(Buffer.from(footerBoard)).png().toFile(path.join(dir, 'footer-check.png'));
