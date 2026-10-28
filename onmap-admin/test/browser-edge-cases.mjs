export default async function runEdgeCases(page, fixture) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const headers = {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
    'Access-Control-Allow-Headers':
      'Authorization,Content-Type,Idempotency-Key',
  };
  const failOnce = (glob, status, message) =>
    page.route(
      glob,
      r =>
        r.fulfill({
          status,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ message }),
        }),
      { times: 1 },
    );
  const first = '11111111-1111-4111-8111-111111111111',
    base = 'https://owner-ui.example.invalid/api/owner-admin';
  await page.setViewportSize({ width: 1600, height: 1000 });
  await failOnce(base + '/overview?*', 500, 'Изолированная ошибка загрузки');
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Не удалось загрузить данные' })
    .waitFor();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await page.getByRole('table').waitFor();
  await page
    .getByRole('button', { name: 'Партнёрские точки', exact: true })
    .click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  await page
    .getByLabel('Поиск точки', { exact: true })
    .fill('Нет такой тестовой точки');
  await page
    .getByRole('button', { name: 'Применить фильтры', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Выберите партнёрскую точку' })
    .waitFor();
  await page.getByLabel('Поиск точки', { exact: true }).fill('');
  await page
    .getByRole('button', { name: 'Применить фильтры', exact: true })
    .click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  await page
    .getByRole('button', { name: 'Открыть точку Кофейня Точка', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Кофейня Точка', level: 1 })
    .waitFor();
  const card = page.getByTestId('card-preview');
  assert(
    (await card
      .locator('.mobile-promo,.mobile-address,.mobile-contact-heading')
      .count()) === 0,
    'Missing optional values rendered empty blocks',
  );
  await page
    .getByRole('button', { name: 'Открыть точку ProAvto', exact: true })
    .click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  await page
    .getByLabel('Название точки', { exact: true })
    .fill('Конфликт редактирования');
  await failOnce(
    base + '/points/' + first,
    409,
    'Запись изменилась. Загрузите актуальные данные.',
  );
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Загрузить актуальную версию' })
    .waitFor();
  assert(
    (await page.getByLabel('Название точки', { exact: true }).inputValue()) ===
      'Конфликт редактирования',
    '409 discarded the form',
  );
  await page
    .getByRole('button', { name: 'Загрузить актуальную версию' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
    assert(
      await dialog.evaluate(el => el.contains(document.activeElement)),
      'Dialog focus escaped',
    );
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert(
    await page
      .getByRole('button', { name: 'Загрузить актуальную версию' })
      .evaluate(el => el === document.activeElement),
    'Dialog did not restore focus',
  );
  await page
    .getByRole('button', { name: 'Загрузить актуальную версию' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Уйти без сохранения' })
    .click();
  await page.getByRole('heading', { name: 'ProAvto', level: 1 }).waitFor();
  await page
    .getByLabel('Название точки', { exact: true })
    .fill('Сохранено после сетевого сбоя');
  const keys = [];
  const capture = req => {
    if (req.method() === 'PUT' && req.url() === base + '/points/' + first)
      keys.push(req.headers()['idempotency-key']);
  };
  page.on('request', capture);
  await page.route(base + '/points/' + first, r => r.abort('failed'), {
    times: 1,
  });
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Не удалось сохранить' }).count();
  await page
    .locator('.form-error')
    .filter({ hasText: 'Проверьте соединение' })
    .waitFor();
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await page.getByText('Изменения сохранены', { exact: true }).waitFor();
  page.off('request', capture);
  assert(
    keys.length === 2 && keys[0] === keys[1],
    'Network retry changed idempotency key',
  );
  await failOnce(base + '/points/' + first, 400, [
    'title must be shorter than or equal to 160 characters',
  ]);
  await page
    .getByLabel('Название точки', { exact: true })
    .fill('Проверка ошибки поля');
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await page.locator('input[name=title][aria-invalid=true]').waitFor();
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Уйти без сохранения' })
    .click();
  await page.getByRole('heading', { name: 'Обзор', level: 1 }).waitFor();
  await failOnce(base + '/points?*', 401, 'Токен истёк');
  await page
    .getByRole('button', { name: 'Партнёрские точки', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Вход в панель' }).waitFor();
  assert(
    (await page.locator('#main').textContent()) === '',
    '401 left private data in the DOM',
  );
  assert(
    (await page.locator('#login-token').inputValue()) === '',
    '401 left a token in the field',
  );
  await page.locator('#login-token').fill('synthetic-test-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('heading', { name: 'Обзор', level: 1 }).waitFor();
  await page.getByText('Управление сессией', { exact: true }).count();
  await page.locator('summary[aria-label="Управление сессией"]').click();
  await page
    .getByRole('menuitem', { name: 'Обновить токен', exact: true })
    .click();
  await page
    .getByText('Токен обновлён. Срок сессии остался прежним.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: '30 дней', exact: true }).click();
  await page.getByRole('table').waitFor();
  await page.locator('summary[aria-label="Управление сессией"]').click();
  await page.getByRole('menuitem', { name: 'Выйти', exact: true }).click();
  await page.getByRole('heading', { name: 'Вход в панель' }).waitFor();
  assert(
    !fixture.calls.some(c => c.path.includes('interaction')),
    'Admin touched interaction counts',
  );
  return {
    passed: true,
    checks: [
      '500 + retry',
      'empty list',
      'missing optional fields',
      '409 preserve/reload',
      'dialog Tab/Escape/focus',
      'network retry key',
      '400 inline validation',
      '401 clear session',
      'rotate and revoke',
    ],
  };
}
