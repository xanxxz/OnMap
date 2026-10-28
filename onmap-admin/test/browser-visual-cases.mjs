export default async function runVisualCases(page, fixture) {
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const shot = async name => {
    for (const close of await page
      .getByRole('button', { name: 'Закрыть уведомление', exact: true })
      .all()) {
      await close.click();
      await close.waitFor({ state: 'detached' });
    }
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(a => a.effect?.getTiming().iterations !== Infinity)
          .map(a => a.finished.catch(() => {})),
      ),
    );
    await page.screenshot({ path: `output/playwright/redesign-${name}.png` });
  };
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
    .getByLabel('Название точки', { exact: true })
    .fill(
      'Партнёрская мастерская с длинным названием — обслуживание и помощь автомобилистам Балаково',
    );
  await page
    .getByLabel('Описание', { exact: true })
    .fill('Подробное описание партнёра. '.repeat(25));
  for (let i = 0; i < 6; i++) {
    await page
      .getByRole('button', { name: 'Добавить контакт', exact: true })
      .click();
    const row = page.locator('.contact-editor').nth(i + 2);
    await row
      .getByRole('combobox', { name: 'Тип контакта', exact: true })
      .click();
    await page.getByRole('option', { name: 'Сайт', exact: true }).click();
    await page.getByRole('listbox').waitFor({ state: 'detached' });
    await row.getByLabel('Подпись', { exact: true }).fill('Контакт ' + (i + 3));
    await row
      .getByLabel('Номер, email или HTTPS-ссылка', { exact: true })
      .fill('https://partner.example.invalid/path/' + i);
  }
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  await page.getByLabel('Акцентный цвет', { exact: true }).fill('#285C78');
  await page.getByLabel('Текст на акценте', { exact: true }).fill('#FFFFFF');
  await shot('long-blue');
  assert(
    (await page
      .getByTestId('card-preview')
      .locator('.mobile-contact')
      .count()) === 8,
    'Many contacts lost',
  );
  const makePng = async (w, h) =>
    Buffer.from(
      await page.evaluate(
        ({ w, h }) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d');
          g.fillStyle = '#285C78';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#FFFFFF';
          g.font = '14px sans-serif';
          g.fillText('QA', 3, 20);
          return Array.from(
            Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]), x =>
              x.charCodeAt(0),
            ),
          );
        },
        { w, h },
      ),
    );
  await page.locator('input[type=file]').setInputFiles({
    name: 'test-wide.png',
    mimeType: 'image/png',
    buffer: await makePng(100, 40),
  });
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid=card-preview] img');
    return img instanceof HTMLImageElement && img.naturalWidth === 100;
  });
  await shot('image-wide');
  await page.locator('input[type=file]').setInputFiles({
    name: 'test-tall.png',
    mimeType: 'image/png',
    buffer: await makePng(40, 100),
  });
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid=card-preview] img');
    return img instanceof HTMLImageElement && img.naturalHeight === 100;
  });
  await shot('image-tall');
  await page.getByLabel('Акцентный цвет', { exact: true }).fill('#F7F4EA');
  await page.getByLabel('Текст на акценте', { exact: true }).fill('#153D32');
  await shot('long-light');
  assert(
    (await page
      .getByTestId('card-preview')
      .evaluate(el =>
        el.style.getPropertyValue('--partner-brand').toUpperCase(),
      )) === '#F7F4EA',
    'Stored light colour was changed',
  );
  assert(
    (await page
      .getByTestId('card-preview')
      .evaluate(el => el.style.getPropertyValue('--partner-accent'))) ===
      '#153D32',
    'Light accent does not match mobile',
  );
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a png'),
  });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid=card-preview] img'),
  );
  await page.setViewportSize({ width: 900, height: 900 });
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  await shot('tablet');
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'Tablet overflow',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('long-mobile');
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'Long mobile content overflow',
  );
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Уйти без сохранения' })
    .click();
  await page.getByRole('heading', { name: 'Обзор', level: 1 }).waitFor();
  fixture.points[0].status = 'ENDED';
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page
    .getByRole('button', { name: 'Партнёрские точки', exact: true })
    .click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  assert(
    await page.getByLabel('Название точки', { exact: true }).isDisabled(),
    'Ended point is editable',
  );
  assert(
    await page
      .getByRole('button', { name: 'Только просмотр', exact: true })
      .isDisabled(),
    'Ended point can be saved',
  );
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  return {
    passed: true,
    checks: [
      'long title and description',
      'eight contacts',
      'blue and light colours',
      'wide and tall image contain',
      'broken image fallback',
      '900px and 390px no overflow',
    ],
  };
}
