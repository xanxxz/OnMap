/** Interaction checks use the actual UI modules and isolated HTTPS fixtures only. */
export default async function runPolishCases(page, fixture) {
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const shot = async name => {
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(a => a.effect?.getTiming().iterations !== Infinity)
          .map(a => a.finished.catch(() => {})),
      ),
    );
    await page.screenshot({ path: `output/playwright/polish-${name}.png` });
  };
  const detached = () =>
    page.locator('.ui-popup').waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator('#login-api').fill('https://owner-ui.example.invalid/api');
  await page.locator('#login-token').fill('synthetic-test-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('heading', { name: 'Обзор', level: 1 }).waitFor();
  await page
    .getByRole('button', { name: 'Партнёрские точки', exact: true })
    .click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  await page
    .getByRole('button', { name: 'Срок размещения', exact: true })
    .click();
  const date = page.getByRole('button', {
    name: 'Начало размещения',
    exact: true,
  });
  const originalDate = await page.locator('input[name=startsAt]').inputValue();
  await date.click();
  const calendar = page.getByRole('dialog', {
    name: 'Начало размещения',
    exact: true,
  });
  await shot('calendar');
  await calendar.getByLabel('Дата', { exact: true }).fill('31.02.2028');
  await calendar
    .getByRole('button', { name: 'Применить', exact: true })
    .click();
  await calendar.getByRole('alert').waitFor();
  assert(
    (await page.locator('input[name=startsAt]').inputValue()) === originalDate,
    'Invalid calendar date reached form',
  );
  await calendar.getByLabel('Дата', { exact: true }).fill('29.02.2028');
  await calendar.getByLabel('Часы', { exact: true }).fill('9');
  await calendar.getByLabel('Минуты', { exact: true }).fill('07');
  await calendar
    .getByRole('button', { name: 'Применить', exact: true })
    .click();
  await detached();
  assert(
    (await page.locator('input[name=startsAt]').inputValue()) ===
      '2028-02-29T09:07',
    'Calendar changed city wall time',
  );
  assert(
    await date.evaluate(el => el === document.activeElement),
    'Calendar did not restore focus',
  );
  await date.click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  await detached();
  assert(
    (await page.locator('input[name=startsAt]').inputValue()) ===
      '2028-02-29T09:07',
    'Escape committed temporary calendar choice',
  );
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  const hex = page.getByLabel('Акцентный цвет', { exact: true });
  await hex.fill('#bad');
  await hex.press('Tab');
  await page
    .getByText('Укажите цвет в формате #RRGGBB', { exact: true })
    .waitFor();
  const writesBefore = fixture.calls.filter(c => c.method !== 'GET').length;
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  assert(
    fixture.calls.filter(c => c.method !== 'GET').length === writesBefore,
    'Invalid HEX was silently saved',
  );
  await hex.fill('#F7F4EA');
  await page
    .getByRole('button', { name: 'Выбрать цвет: Акцентный цвет', exact: true })
    .click();
  const color = page.getByRole('dialog', {
    name: 'Выбор цвета: Акцентный цвет',
  });
  await color
    .getByRole('button', { name: 'Цвет #285C78', exact: true })
    .click();
  await color.getByRole('slider', { name: 'Красный', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await shot('colour');
  await color.getByRole('button', { name: 'Применить', exact: true }).click();
  await detached();
  assert(
    (await hex.inputValue()) === '#295C78',
    'Custom palette/RGB changes not applied',
  );
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    g.fillStyle = '#285C78';
    g.fillRect(0, 0, 64, 64);
    return Array.from(
      Uint8Array.from(atob(canvas.toDataURL().split(',')[1]), c =>
        c.charCodeAt(0),
      ),
    );
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'polish-test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(bytes),
  });
  await page.waitForFunction(
    () => document.querySelector('[data-testid=card-preview] img')?.complete,
  );
  await page.evaluate(() => {
    window.__stableImage = document.querySelector(
      '[data-testid=card-preview] img',
    );
    window.__stableCard = document.querySelector('[data-testid=card-preview]');
  });
  await page.getByRole('button', { name: 'Основное', exact: true }).click();
  await page
    .getByLabel('Название точки', { exact: true })
    .fill('Предпросмотр без мигания');
  await page
    .getByLabel('Описание', { exact: true })
    .pressSequentially(' Новый текст');
  assert(
    await page.evaluate(
      () =>
        window.__stableImage ===
          document.querySelector('[data-testid=card-preview] img') &&
        window.__stableCard ===
          document.querySelector('[data-testid=card-preview]'),
    ),
    'Preview/image DOM was replaced while typing',
  );
  assert(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid=card-preview]').getAnimations()
          .length === 0,
    ),
    'Preview animates on every keystroke',
  );
  await page.getByRole('button', { name: 'Контакты', exact: true }).click();
  await page
    .getByRole('button', { name: 'Переместить контакт ниже', exact: true })
    .first()
    .focus();
  await page.keyboard.press('Enter');
  assert(
    await page.evaluate(() =>
      document
        .querySelectorAll('.contact-editor')[1]
        ?.contains(document.activeElement),
    ),
    'Contact reorder lost keyboard focus',
  );
  await page
    .getByRole('button', { name: 'Удалить контакт', exact: true })
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll('.contact-editor').length === 1,
  );
  assert(
    await page.evaluate(
      () =>
        document.querySelector('.contact-editor input:not([hidden])') ===
        document.activeElement,
    ),
    'Contact deletion lost focus',
  );
  const nav = page.getByRole('button', { name: 'Баннеры', exact: true });
  const before = await nav.boundingBox();
  await nav.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await shot('dialog');
  const after = await nav.boundingBox();
  assert(before.x === after.x, 'Modal shifted background layout');
  await dialog
    .getByRole('button', { name: 'Уйти без сохранения', exact: true })
    .focus();
  await page.keyboard.press('Tab');
  assert(
    await page.evaluate(
      () => document.activeElement === document.querySelector('dialog button'),
    ),
    'Dialog Tab does not wrap',
  );
  await page.mouse.click(5, 5);
  await dialog.waitFor({ state: 'detached' });
  assert(
    await nav.evaluate(el => el === document.activeElement),
    'Dialog did not return focus after backdrop cancel',
  );
  assert(
    (await page.getByLabel('Название точки', { exact: true }).inputValue()) ===
      'Предпросмотр без мигания',
    'Backdrop confirmed destructive navigation',
  );
  await nav.click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Уйти без сохранения', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Баннер · ProAvto', level: 1 })
    .waitFor();
  const remote = page.getByRole('combobox', {
    name: 'Найти связанную точку',
    exact: true,
  });
  await remote.fill('Ничего не найдено');
  await page
    .getByText('По этому названию ничего не найдено.', { exact: true })
    .waitFor();
  const api = 'https://owner-ui.example.invalid/api/owner-admin/points?*';
  await page.route(
    api,
    r =>
      r.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173' },
        body: JSON.stringify({ message: 'Изолированная ошибка поиска' }),
      }),
    { times: 1 },
  );
  await remote.fill('Кофейня');
  await page
    .locator('.remote-popup')
    .getByRole('button', { name: 'Повторить', exact: true })
    .waitFor();
  await page
    .locator('.remote-popup')
    .getByRole('button', { name: 'Повторить', exact: true })
    .click();
  await page.getByRole('option', { name: /Кофейня Точка/ }).waitFor();
  await remote.focus();
  await page.keyboard.press('Enter');
  await detached();
  assert(
    (await remote.inputValue()) === 'Кофейня Точка',
    'Remote combobox Enter failed',
  );
  // A long city list exercises reusable search and upward placement without changing metadata/API.
  await page.evaluate(async () => {
    const ui = await import('/ui.js');
    const host = ui.el('div', {
      id: 'polish-harness',
      style:
        'position:fixed;bottom:10px;left:20px;width:300px;z-index:55;background:white;padding:8px',
    });
    const options = Array.from({ length: 12 }, (_, i) => [
      String(i),
      'Город ' + String(i + 1).padStart(2, '0'),
    ]);
    host.append(ui.selectField('qa-city', 'Тестовые города', options, '0'));
    document.body.append(host);
  });
  const combo = page.getByRole('combobox', {
    name: 'Тестовые города',
    exact: true,
  });
  await combo.focus();
  await page.keyboard.press('ArrowDown');
  const search = page.getByRole('searchbox', {
    name: 'Поиск вариантов: Тестовые города',
  });
  await search.fill('12');
  await shot('select-up');
  await page.getByRole('option', { name: 'Город 12', exact: true }).waitFor();
  assert(
    (await page.locator('.ui-popup').getAttribute('data-direction')) === 'up',
    'Bottom combobox clipped instead of opening up',
  );
  await page.keyboard.press('Enter');
  await detached();
  assert(
    (await combo.textContent()) === 'Город 12',
    'Search did not select hidden form value',
  );
  await combo.press('ArrowDown');
  await page.keyboard.press('Escape');
  await detached();
  assert(
    await combo.evaluate(el => el === document.activeElement),
    'Combobox Escape lost focus',
  );
  await combo.press('1');
  assert(
    (await search.inputValue()) === '1',
    'First search character was lost',
  );
  await page.keyboard.press('Escape');
  await detached();
  await combo.press('ArrowDown');
  await page.keyboard.press('Tab');
  await detached();
  await page.locator('#polish-harness select').evaluate(el => {
    el.disabled = true;
  });
  await page.waitForFunction(
    () => document.querySelector('#polish-harness [role=combobox]').disabled,
  );
  await page.evaluate(async () => {
    const ui = await import('/ui.js');
    const host = document.getElementById('polish-harness');
    window.__latePicker = ui.remoteCombobox({
      name: 'qa-remote',
      label: 'Тестовый поиск',
      load: async () => ({ items: [], total: 0, pageSize: 10 }),
      onSelect: () => {},
    });
    host.append(window.__latePicker.element);
    host.append(
      ui.selectField(
        'qa-short',
        'Короткий список',
        [
          ['a', 'Альфа'],
          ['b', 'Бета'],
          ['c', 'Гамма'],
        ],
        'a',
      ),
    );
    host.append(
      ui.button('Тестовое подтверждение', () => {
        window.__confirmResults = [];
        for (let i = 0; i < 2; i++)
          void ui
            .confirmDialog({
              title: 'Проверка повторного действия',
              text: 'Синтетический тест, данные не отправляются.',
            })
            .then(v => window.__confirmResults.push(v));
      }),
    );
  });
  const latePicker = page.getByRole('combobox', {
    name: 'Тестовый поиск',
    exact: true,
  });
  await latePicker.fill('Новый запрос');
  await page.evaluate(() =>
    window.__latePicker.setSelected({
      id: 'saved',
      label: 'Сохранённая точка',
    }),
  );
  assert(
    (await latePicker.inputValue()) === 'Новый запрос',
    'Late initial selection overwrote typed search',
  );
  await latePicker.press('Escape');
  await detached();
  assert(
    (await latePicker.inputValue()) === 'Сохранённая точка',
    'Cancelled query lost saved selection',
  );
  const short = page.getByRole('combobox', {
    name: 'Короткий список',
    exact: true,
  });
  await short.focus();
  await short.dispatchEvent('keydown', { key: 'г', bubbles: true });
  await page.keyboard.press('Enter');
  await detached();
  assert(
    (await short.textContent()) === 'Гамма',
    'Short-list typeahead failed',
  );
  await short.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await detached();
  assert(
    (await short.textContent()) === 'Бета',
    'Short-list ArrowUp/Enter failed',
  );
  await page
    .getByRole('button', { name: 'Тестовое подтверждение', exact: true })
    .click();
  assert(
    (await page.getByRole('dialog').count()) === 1,
    'Duplicate confirmation was opened',
  );
  const closing = await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Подтвердить', exact: true })
    .evaluate(el => {
      el.click();
      el.click();
      return document.querySelector('dialog')?.dataset.state;
    });
  assert(closing === 'closing', 'Dialog was removed before exit animation');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert(
    await page.evaluate(
      () =>
        window.__confirmResults.length === 2 &&
        window.__confirmResults.filter(Boolean).length === 1,
    ),
    'Duplicate confirmation was executed',
  );
  await page.evaluate(() => document.getElementById('polish-harness').remove());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'Narrow view overflow',
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = '28px'));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'Enlarged text overflow',
  );
  assert(
    await page
      .getByRole('button', { name: 'Баннеры', exact: true })
      .evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 20),
    'User text size ignored',
  );
  await shot('enlarged');
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  assert(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('button'))
          .transitionDuration === '0s',
    ),
    'Reduced motion not applied',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Уйти без сохранения', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Обзор', level: 1 }).waitFor();
  return {
    passed: true,
    checks: [
      'calendar validation/keyboard/cancel/focus',
      'HEX and RGB picker',
      'file adapter/image load',
      'stable image/card DOM',
      'contact move/delete focus',
      'dialog trap/backdrop/no shift',
      'remote search empty/error/retry/Enter',
      'long list search/upward popup/disabled/Escape/Tab',
      'short typeahead/first search character/duplicate confirmation',
      '390px/200% text/reduced motion',
    ],
  };
}
