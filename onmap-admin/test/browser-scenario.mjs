/** Run against browser-fixture.mjs only. This script never connects to production. */
export default async function runScenario(page, fixture) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const save = async () => {
    await page
      .getByRole('button', { name: /^Сохранить (черновик|изменения)$/ })
      .click();
    await page.getByText('Изменения сохранены', { exact: true }).waitFor();
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
  await shot('login');
  await page
    .getByLabel('Адрес HTTPS API')
    .fill('https://owner-ui.example.invalid/api');
  await page.locator('#login-token').fill('synthetic-test-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('heading', { name: 'Обзор', level: 1 }).waitFor();
  await page.getByRole('table').waitFor();
  await shot('overview');
  assert(
    (await page.locator('#login-token').inputValue()) === '',
    'Token input was not cleared',
  );
  await page.getByRole('button', { name: '30 дней', exact: true }).click();
  await page.getByRole('table').waitFor();
  await page
    .getByRole('button', { name: 'Партнёрские точки', exact: true })
    .click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  await shot('point');
  await page
    .getByLabel('Название точки', { exact: true })
    .fill('Несохранённая правка');
  assert(
    (await page
      .getByTestId('card-preview')
      .getByRole('heading', { level: 3 })
      .textContent()) === 'Несохранённая правка',
    'Preview was not live',
  );
  await page.getByRole('button', { name: 'Баннеры', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await shot('unsaved-dialog');
  assert(
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Продолжить редактирование' })
      .evaluate(el => el === document.activeElement),
    'Initial dialog focus',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert(
    (await page.getByRole('dialog').count()) === 0,
    'Escape did not close dialog',
  );
  await page.getByLabel('Название точки', { exact: true }).fill('ProAvto');
  await page.getByRole('button', { name: 'Новая точка', exact: true }).click();
  await page.getByRole('heading', { name: 'Новая точка', level: 1 }).waitFor();
  await page
    .getByRole('button', { name: 'Сохранить черновик', exact: true })
    .click();
  assert(
    (await page.locator('[aria-invalid=true]').count()) >= 2,
    'Required validation missing',
  );
  await page
    .getByLabel('Название точки', { exact: true })
    .fill('Сервис На карте');
  await page.getByLabel('Категория', { exact: true }).fill('Автосервис');
  await page
    .getByLabel('Описание', { exact: true })
    .fill('Тестовая карточка. Изолированные данные интерфейса.');
  await page
    .getByLabel('Отображаемый адрес', { exact: true })
    .fill('Тестовая улица, 1');
  await page.getByLabel('Промокод', { exact: true }).fill('Test_Code');
  await page
    .getByLabel('Условия промокода', { exact: true })
    .fill('Тестовые условия без обещаний скидки');
  await page
    .getByRole('button', { name: 'Добавить контакт', exact: true })
    .click();
  await page.getByLabel('Подпись', { exact: true }).fill('Связаться');
  await page
    .getByLabel('Номер, email или HTTPS-ссылка', { exact: true })
    .fill('+79000000000');
  await save();
  assert(
    fixture.points.length === 3,
    'Create produced duplicate or missing point',
  );
  const created = fixture.points.find(p => p.title === 'Сервис На карте');
  assert(
    created.status === 'DRAFT',
    'New point was published without confirmation',
  );
  const contactId = created.contacts[0].id;
  await page.getByLabel('Подпись', { exact: true }).fill('Позвонить в сервис');
  await save();
  assert(
    created.contacts[0].id === contactId,
    'Contact ID changed after label edit',
  );
  await page
    .getByRole('button', { name: 'Открыть точку ProAvto', exact: true })
    .click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Контакты', exact: true }).click();
  await page
    .getByRole('button', { name: 'Переместить контакт ниже', exact: true })
    .first()
    .click();
  assert(
    (await page
      .getByTestId('card-preview')
      .locator('.primary-contact strong')
      .textContent()) === 'Позвонить',
    'Primary contact did not follow order',
  );
  await save();
  assert(
    fixture.points[0].contacts[0].id === '44444444-4444-4444-8444-444444444444',
    'Reorder did not retain ID',
  );
  await page
    .getByRole('button', { name: 'Посмотреть статистику', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Статистика · ProAvto', level: 1 })
    .waitFor();
  await page.getByRole('table').waitFor();
  await shot('statistics');
  await page.getByRole('button', { name: 'Всё время', exact: true }).click();
  await page.getByRole('table').waitFor();
  await page.getByRole('button', { name: 'К размещению', exact: true }).click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  await page.getByLabel('Акцентный цвет', { exact: true }).fill('#F7F4EA');
  await page.getByLabel('Текст на акценте', { exact: true }).fill('#153D32');
  assert(
    (await page
      .getByTestId('card-preview')
      .evaluate(el => el.style.getPropertyValue('--partner-accent'))) ===
      '#153D32',
    'Light accent disappeared',
  );
  await shot('light');
  await page.getByRole('button', { name: 'Баннеры', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Уйти без сохранения' })
    .click();
  await page
    .getByRole('heading', { name: 'Баннер · ProAvto', level: 1 })
    .waitFor();
  await page.getByTestId('banner-expanded').waitFor();
  await page.waitForFunction(
    () => document.querySelector('.remote-input input')?.value === 'ProAvto',
  );
  await shot('banner');
  const title = await page
    .getByTestId('banner-compact')
    .locator('.mobile-banner-copy>strong')
    .textContent();
  assert(title === 'ProAvto', 'Banner uses point title unexpectedly');
  await page
    .getByLabel('Заголовок баннера', { exact: true })
    .fill('Отдельный заголовок');
  assert(
    (await page
      .getByTestId('banner-compact')
      .locator('.mobile-banner-copy>strong')
      .textContent()) === 'Отдельный заголовок',
    'Banner preview not live',
  );
  await page
    .getByLabel('Найти связанную точку', { exact: true })
    .fill('Кофейня');
  await page
    .getByRole('option', { name: /Кофейня Точка/ })
    .last()
    .waitFor();
  await page
    .getByRole('option', { name: /Кофейня Точка/ })
    .last()
    .click();
  await page
    .getByRole('button', {
      name: 'Сохранить выключенный черновик',
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Сохранить черновик', exact: true })
    .click();
  await page.getByText('Изменения сохранены', { exact: true }).waitFor();
  assert(fixture.getBanner().enabled === false, 'Banner saved enabled');
  assert(
    fixture.points[1].status === 'PAUSED',
    'Banner activated linked point',
  );
  assert(
    fixture.getBanner().partnerPointId === fixture.points[1].id,
    'Picker did not submit point ID',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  await shot('mobile-banner');
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'Whole page has horizontal scroll',
  );
  await page
    .getByRole('button', { name: 'Партнёрские точки', exact: true })
    .click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  await page.getByTestId('card-preview').waitFor();
  await shot('mobile-point');
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'Point page overflows narrow viewport',
  );
  const before = page.url();
  await page
    .getByTestId('card-preview')
    .getByRole('button', { name: /Открыть в Яндекс Картах/ })
    .click();
  assert(page.url() === before, 'Preview navigated to real address');
  const writes = fixture.calls.filter(c => c.method !== 'GET');
  assert(
    !fixture.calls.some(c => c.path.includes('interaction')),
    'Preview recorded stats',
  );
  console.log(
    'UI scenario passed: login, overview, draft create/reopen/edit, contacts, unsaved dialog, statistics, banner, preview, narrow layout. Mutations target fixture only: ' +
      writes.length,
  );
  return { passed: true, mutations: writes.length };
}
