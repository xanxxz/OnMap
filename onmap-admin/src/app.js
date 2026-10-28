import { enter, exit, move } from './motion.js';
import { OwnerApi, ApiError, localDateTime } from './api.js';
import {
  el,
  icon,
  button,
  iconButton,
  field,
  selectField,
  notify,
  confirmDialog,
  showFieldErrors,
  remoteCombobox,
  syncControls,
  controlErrors,
  controlError,
  setupTooltips,
  enhanceMenu,
} from './ui.js';
import {
  DraftSession,
  newPoint,
  pointFormData,
  pointPayload,
  bannerPayload,
  validateDraft,
  moveContact,
  statusLabels,
  contactLabels,
  groupLabels,
} from './editor-model.js';
import {
  updatePreview,
  cardPreview,
  bannerPreview,
  artwork,
  appearance,
  contrast,
} from './preview.js';
const api = new OwnerApi();
/** @typedef {{'main':HTMLElement,'console':HTMLElement,'login':HTMLElement,'login-error':HTMLElement,'login-token':HTMLInputElement,'login-api':HTMLInputElement,'login-submit':HTMLButtonElement,'login-form':HTMLFormElement,'brand-home':HTMLButtonElement,'rotate':HTMLButtonElement,'logout':HTMLButtonElement,'expiry':HTMLElement}} AdminDom */
/** @template {keyof AdminDom} K @param {K} id @returns {AdminDom[K]} */
const $ = id => /** @type {AdminDom[K]} */ (document.getElementById(id));
/** @type {any} */ let metadata;
/** @type {any} */ let editor;
/** @type {any} */ let route = { kind: 'overview' };
let expiresAt = 0,
  generation = 0,
  dispose = () => {},
  navigating = false;
const filters = {
  cityId: '',
  period: '7',
  search: '',
  status: '',
  page: 1,
  contactPage: 1,
};
const pageSize = 20;
/** @param {Event} event */
const eventValue = event =>
  /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} */ (
    event.target
  ).value;
/** @param {HTMLFormElement} form @param {string} name */
const control = (form, name) =>
  /** @type {HTMLInputElement} */ (form.elements.namedItem(name));
const params = object =>
  new URLSearchParams(
    Object.entries(object)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
const city = id => metadata.cities.find(c => c.id === id);
const cityOptions = all => [
  ...(all ? [['', 'Все города']] : []),
  ...metadata.cities.map(c => [c.id, c.name]),
];
const n = value =>
  new Intl.NumberFormat('ru-RU').format(
    typeof value === 'string' ? BigInt(value) : (value ?? 0),
  );
const dates = (start, end, id) =>
  start && end
    ? `${localDateTime(start, city(id).timeZone).replace('T', ' ')} — ${localDateTime(end, city(id).timeZone).replace('T', ' ')} · ${city(id).timeZone}`
    : 'Срок не задан';
const dirty = () => Boolean(editor?.session.dirty || editor?.pendingFile);
const current = version => version === generation && api.connected;

async function task(work) {
  try {
    await work();
  } catch (error) {
    if (!api.connected || (error instanceof ApiError && error.status === 401)) {
      endSession(
        'Сессия завершена или токен отозван. Получите новый токен владельца.',
      );
      return;
    }
    notify(
      error instanceof Error ? error.message : 'Не удалось выполнить действие',
      'error',
    );
  }
}
function endSession(message = '') {
  ++generation;
  dispose();
  dispose = () => {};
  editor = null;
  metadata = null;
  expiresAt = 0;
  api.disconnect();
  $('main').replaceChildren();
  $('console').hidden = true;
  $('login').hidden = false;
  $('login-token').value = '';
  $('login-error').textContent = message;
  $('login-error').hidden = !message;
  document.querySelectorAll('dialog').forEach(d => {
    d.dispatchEvent(new Event('cancel', { cancelable: true }));
  });
  $('login-submit').disabled = false;
  $('login-submit').textContent = 'Войти';
}
async function leaveAllowed() {
  if (editor?.busy) {
    notify('Дождитесь завершения сохранения.', 'info');
    return false;
  }
  return (
    !dirty() ||
    (await confirmDialog({
      title: 'Есть несохранённые изменения',
      text: 'Если уйти сейчас, изменения полей и выбранное изображение не сохранятся.',
      confirm: 'Уйти без сохранения',
      cancel: 'Продолжить редактирование',
      danger: true,
    }))
  );
}
async function go(next, { force = false } = {}) {
  if (navigating) return;
  navigating = true;
  let allowed;
  try {
    allowed = force || (await leaveAllowed());
  } finally {
    navigating = false;
  }
  if (allowed) await showPage(next);
}
function loading(label = 'Загружаем данные…') {
  return el('div', { class: 'loading', role: 'status' }, [
    el('span', { class: 'spinner', 'aria-hidden': true }),
    label,
  ]);
}
function empty(title, text, action) {
  return el('div', { class: 'empty-state' }, [
    el('span', { class: 'empty-icon' }, icon('pin', 28)),
    el('h3', {}, title),
    el('p', {}, text),
    action,
  ]);
}
function errorState(error, retry) {
  return el('div', { class: 'error-state', role: 'alert' }, [
    icon('warning', 25),
    el('h3', {}, 'Не удалось загрузить данные'),
    el('p', {}, error.message || 'Попробуйте ещё раз.'),
    button('Повторить', () => task(retry), 'secondary', 'refresh'),
  ]);
}
async function showPage(next) {
  document.dispatchEvent(new Event('onmap:page-change'));
  dispose();
  dispose = () => {};
  editor = null;
  route = next;
  const version = ++generation;
  $('main').className =
    next.kind === 'overview' || next.kind === 'statistics'
      ? 'dashboard-main'
      : 'workspace-main';
  $('main').replaceChildren(loading());
  for (const node of document.querySelectorAll('[data-page]'))
    node.setAttribute(
      'aria-current',
      node.getAttribute('data-page') ===
        (next.kind === 'statistics' ? 'points' : next.kind)
        ? 'page'
        : 'false',
    );
  try {
    if (next.kind === 'overview') await overview(version);
    else if (next.kind === 'statistics')
      await pointStatistics(next.id, version);
    else if (next.kind === 'points') await pointWorkspace(next, version);
    else await bannerWorkspace(next, version);
  } catch (error) {
    if (version !== generation) return;
    if (error instanceof ApiError && error.status === 401) {
      endSession('Сессия завершена. Получите новый токен владельца.');
      return;
    }
    $('main').replaceChildren(errorState(error, () => showPage(next)));
  }
}
function pager(total, page, size, onChange) {
  const before = button(
    '',
    () => task(() => onChange(page - 1)),
    'icon-button',
    'back',
  );
  before.setAttribute('aria-label', 'Предыдущая страница');
  before.disabled = page <= 1;
  const after = button(
    '',
    () => task(() => onChange(page + 1)),
    'icon-button',
    'right',
  );
  after.setAttribute('aria-label', 'Следующая страница');
  after.disabled = page * size >= total;
  return el('div', { class: 'pagination' }, [
    el('span', {}, `Страница ${page} · ${n(total)} записей`),
    before,
    after,
  ]);
}
function periodControl(value, onChange) {
  return el(
    'div',
    { class: 'segmented', 'aria-label': 'Период статистики' },
    [
      ['7', '7 дней'],
      ['30', '30 дней'],
      ['ALL', 'Всё время'],
    ].map(([id, label]) => {
      const b = button(label, () => task(() => onChange(id)));
      b.setAttribute('aria-pressed', String(id === value));
      return b;
    }),
  );
}
function statMetrics(stats) {
  return el(
    'div',
    { class: 'ad-metrics' },
    [
      ['eye', 'Открытия карточек', stats.pointOpens],
      ['bars', 'Показы баннеров', stats.bannerImpressions],
      ['pointer', 'Нажатия баннеров', stats.bannerClicks],
      ['link', 'Нажатия контактов', stats.contactClicks],
    ].map(([symbol, label, value]) =>
      el('div', { class: 'stat-metric' }, [
        el('span', { class: 'metric-icon' }, icon(symbol, 21)),
        el('div', {}, [
          el('span', { class: 'metric-label' }, label),
          el('strong', {}, n(value)),
        ]),
      ]),
    ),
  );
}
function contactTable(stats, onPage) {
  const section = el('section', { class: 'contact-statistics' }, [
    el('div', { class: 'section-title' }, [
      el('h2', {}, 'Контакты'),
      el(
        'span',
        { class: 'muted' },
        `Всего нажатий: ${n(stats.contactClicks)}`,
      ),
    ]),
  ]);
  if (!stats.contacts.length)
    section.append(
      empty(
        'За этот период нет нажатий',
        'Выберите другой период, чтобы посмотреть статистику.',
      ),
    );
  else {
    const table = el('table', {}, [
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          ['Партнёрская точка', 'Контакт', 'Нажатия', 'Доля кликов'].map(t =>
            el('th', { scope: 'col' }, t),
          ),
        ),
      ),
      el(
        'tbody',
        {},
        stats.contacts.map(c =>
          el('tr', {}, [
            el('td', {}, c.pointTitle),
            el('td', {}, [
              el('span', { class: c.deleted ? 'muted' : '' }, c.label),
              el('small', { class: 'contact-detail' }, [
                c.deleted ? 'Контакт удалён · ' : 'ID контакта · ',
                c.contactId.slice(0, 8),
              ]),
            ]),
            el('td', { class: 'numeric' }, n(c.clicks)),
            el(
              'td',
              { class: 'numeric' },
              stats.contactClicks
                ? `${Math.round((c.clicks / stats.contactClicks) * 100)}%`
                : '—',
            ),
          ]),
        ),
      ),
    ]);
    section.append(el('div', { class: 'table-scroll' }, table));
  }
  section.append(
    pager(stats.contactsTotal, stats.page, stats.pageSize, onPage),
  );
  return section;
}
function statExplanation(stats) {
  return el('div', { class: 'statistics-explanation' }, [
    icon('info', 18),
    el(
      'p',
      {},
      `Суточные агрегаты в UTC. Период включает текущий день. Всего учтённых действий: ${n(stats.total)}. Открытия, показы и клики считаются отдельно; уникальные посетители по этим данным не вычисляются.`,
    ),
  ]);
}
async function overview(version) {
  const root = el('div', { class: 'dashboard' }),
    toolbar = el('div', { class: 'dashboard-toolbar' });
  root.append(el('h1', {}, 'Обзор'), toolbar, loading());
  $('main').replaceChildren(root);
  enter(root);
  const cities = selectField(
    'overview-city',
    'Город',
    cityOptions(true),
    filters.cityId,
  );
  toolbar.append(
    cities,
    periodControl(filters.period, async value => {
      filters.period = value;
      filters.contactPage = 1;
      await showPage({ kind: 'overview' });
    }),
  );
  cities.querySelector('select').addEventListener('change', event => {
    filters.cityId = eventValue(event);
    filters.contactPage = 1;
    void task(() => showPage({ kind: 'overview' }));
  });
  toolbar.append(
    el(
      'span',
      { class: 'period-note' },
      'Реклама — по выбранному городу · UTC',
    ),
  );
  const data = await api.request(
    '/overview?' +
      params({
        cityId: filters.cityId,
        period: filters.period,
        page: filters.contactPage,
        pageSize,
      }),
  );
  if (!current(version)) return;
  root.lastChild.remove();
  const identities = data.anonymousIdentities;
  const count = status =>
    data.points.byStatus.find(p => p.status === status)?.count ?? 0;
  root.append(
    el('h2', { class: 'overview-section-heading' }, 'Общие показатели'),
    el('div', { class: 'general-metrics' }, [
      el('div', { class: 'general-metric' }, [
        el('span', { class: 'metric-icon' }, icon('calendar', 23)),
        el('div', {}, [
          el(
            'span',
            { class: 'metric-label' },
            'Дорожные события за всё время',
          ),
          el('strong', {}, n(data.roadEvents.total)),
          el(
            'small',
            {},
            'Все города · ' +
              data.roadEvents.bySource
                .map(
                  s =>
                    `${s.source === 'USER' ? 'Пользователи' : 'Telegram'}: ${n(s.count)}`,
                )
                .join(' · '),
          ),
        ]),
      ]),
      el('div', { class: 'general-metric' }, [
        el('span', { class: 'metric-icon' }, icon('people', 23)),
        el('div', {}, [
          el('span', { class: 'metric-label' }, 'Анонимные идентификаторы'),
          el('strong', {}, identities ? n(identities.count) : '—'),
          el(
            'small',
            {},
            identities
              ? `С ${new Date(identities.since).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} · все города`
              : 'Учёт ещё не включён',
          ),
        ]),
      ]),
      el('div', { class: 'general-metric' }, [
        el('span', { class: 'metric-icon' }, icon('speaker', 23)),
        el('div', {}, [
          el('span', { class: 'metric-label' }, 'Размещения в текущем сроке'),
          el('strong', {}, n(data.points.activeNow)),
          el(
            'small',
            {},
            `Черновики: ${count('DRAFT')} · На паузе: ${count('PAUSED')}`,
          ),
        ]),
      ]),
    ]),
    el(
      'p',
      { class: 'global-note' },
      'Дорожные события и анонимные идентификаторы — глобальные накопленные показатели: фильтры их не пересчитывают. Анонимный идентификатор не равен человеку; историческая аудитория до начала учёта не оценивается.',
    ),
    el('h2', { class: 'overview-section-heading' }, 'Рекламные показатели'),
    statMetrics(data.advertising),
    contactTable(data.advertising, async page => {
      filters.contactPage = page;
      await showPage({ kind: 'overview' });
    }),
    statExplanation(data.advertising),
  );
}
async function pointStatistics(id, version) {
  const point = await api.request('/points/' + id);
  if (!current(version)) return;
  const root = el('div', { class: 'dashboard' });
  root.append(
    button(
      'К размещению',
      () => task(() => go({ kind: 'points', id })),
      'text-button back-link',
      'back',
    ),
    el('h1', {}, `Статистика · ${point.title}`),
  );
  const toolbar = el('div', { class: 'dashboard-toolbar' }, [
    el('span', { class: 'city-label' }, [
      icon('pin', 16),
      city(point.cityId).name,
    ]),
    periodControl(filters.period, async p => {
      filters.period = p;
      filters.contactPage = 1;
      await showPage({ kind: 'statistics', id });
    }),
    el('span', { class: 'period-note' }, 'Суточные агрегаты · UTC'),
  ]);
  root.append(toolbar, loading());
  $('main').replaceChildren(root);
  enter(root);
  const stats = await api.request(
    `/points/${id}/statistics?` +
      params({ period: filters.period, page: filters.contactPage, pageSize }),
  );
  if (!current(version)) return;
  root.lastChild.remove();
  root.append(
    el('h2', { class: 'overview-section-heading' }, 'Рекламные показатели'),
    statMetrics(stats),
    contactTable(stats, async page => {
      filters.contactPage = page;
      await showPage({ kind: 'statistics', id });
    }),
    statExplanation(stats),
  );
}
function statusPill(status) {
  return el('span', { class: 'status-pill ' + String(status).toLowerCase() }, [
    el('i', { 'aria-hidden': true }),
    statusLabels[status] ?? status,
  ]);
}
function workspaceShell(title) {
  const sidebar = el('aside', {
      class: 'context-sidebar',
      'aria-label': title,
    }),
    detail = el('section', { class: 'detail-shell' });
  const root = el('div', { class: 'workspace' }, [sidebar, detail]);
  $('main').replaceChildren(root);
  enter(root);
  return { root, sidebar, detail };
}
function sidebarFilters(sidebar, kind, refresh) {
  const form = el('form', { class: 'context-filters' }),
    citySelect = selectField(
      'list-city',
      'Город',
      cityOptions(true),
      filters.cityId,
    );
  form.append(citySelect);
  if (kind === 'points')
    form.append(
      field('list-search', 'Поиск точки', filters.search, { maxLength: 160 }),
      selectField(
        'list-status',
        'Статус',
        [['', 'Все статусы'], ...Object.entries(statusLabels)],
        filters.status,
      ),
    );
  form.append(button('Применить фильтры', null, 'filter-submit', 'search'));
  /** @type {HTMLButtonElement} */ (form.querySelector('.filter-submit')).type =
    'submit';
  form.addEventListener('submit', event => {
    event.preventDefault();
    void task(async () => {
      if (!(await leaveAllowed())) return;
      filters.cityId = citySelect.querySelector('select').value;
      if (kind === 'points') {
        filters.search = control(form, 'list-search').value;
        filters.status = control(form, 'list-status').value;
      }
      filters.page = 1;
      await refresh();
    });
  });
  const toggle = button(
    'Список',
    () => {
      const open = sidebar.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    },
    'secondary context-toggle',
    'menu',
  );
  toggle.setAttribute('aria-expanded', 'false');
  sidebar.append(
    el('div', { class: 'context-heading' }, [
      el('h2', {}, kind === 'points' ? 'Партнёрские точки' : 'Баннеры'),
      toggle,
    ]),
    form,
  );
}
async function pointWorkspace(next, version) {
  const { sidebar, detail } = workspaceShell('Партнёрские точки');
  sidebarFilters(sidebar, 'points', () => showPage({ kind: 'points' }));
  sidebar.append(
    button(
      'Новая точка',
      () => task(() => go({ kind: 'points', isNew: true })),
      'primary new-placement',
      'plus',
    ),
    loading(),
  );
  detail.append(loading());
  const list = await api.request(
    '/points?' +
      params({
        cityId: filters.cityId,
        search: filters.search,
        status: filters.status,
        page: filters.page,
        pageSize,
      }),
  );
  if (!current(version)) return;
  sidebar.lastChild.remove();
  const selectedId = next.isNew ? null : (next.id ?? list.items[0]?.id);
  const listNode = el('div', { class: 'placement-list' });
  for (const point of list.items) {
    const colors = appearance(point);
    const row = button(
      '',
      () => task(() => go({ kind: 'points', id: point.id })),
      'placement-item' + (selectedId === point.id ? ' selected' : ''),
    );
    row.setAttribute('aria-label', `Открыть точку ${point.title}`);
    row.setAttribute(
      'aria-current',
      selectedId === point.id ? 'true' : 'false',
    );
    row.append(
      artwork(null, colors.accent, 38),
      el('span', { class: 'placement-item-copy' }, [
        el('strong', {}, point.title),
        el('small', {}, point.category),
        statusPill(point.status),
      ]),
      icon('right', 16),
    );
    listNode.append(row);
  }
  sidebar.append(
    listNode.children.length
      ? listNode
      : el('p', { class: 'sidebar-empty' }, 'По этим фильтрам точек нет.'),
    pager(list.total, filters.page, pageSize, async page => {
      if (!(await leaveAllowed())) return;
      filters.page = page;
      await showPage({ kind: 'points' });
    }),
  );
  if (!selectedId && !next.isNew) {
    detail.replaceChildren(
      empty(
        'Выберите партнёрскую точку',
        'Создайте черновик или измените фильтры списка.',
        button(
          'Создать черновик',
          () => task(() => go({ kind: 'points', isNew: true })),
          'primary',
          'plus',
        ),
      ),
    );
    return;
  }
  const point = next.isNew
    ? newPoint(city(filters.cityId || metadata.cities[0].id))
    : await api.request('/points/' + selectedId);
  if (!current(version)) return;
  route = { kind: 'points', id: point.id, isNew: !point.id };
  await renderPointEditor(point, detail, version);
}
function editorStructure(detail, title, status, groups) {
  const heading = el('div', { class: 'detail-header' }, [
    el('div', { class: 'detail-title' }, [
      el('h1', {}, title),
      statusPill(status),
    ]),
  ]);
  const body = el('div', { class: 'editing-columns' }),
    nav = el('nav', { class: 'section-nav', 'aria-label': 'Поля размещения' }),
    form = el('form', { class: 'editor-form', novalidate: true }),
    scroll = el('div', { class: 'form-scroll' }),
    preview = el('aside', {
      class: 'preview-pane',
      'aria-label': 'Предпросмотр в приложении',
    }),
    footer = el('footer', { class: 'savebar' });
  form.append(scroll);
  body.append(nav, form, preview);
  detail.replaceChildren(heading, body, footer);
  const sections = {};
  for (const [id, label, symbol] of groups) {
    const section = el(
      'section',
      { class: 'form-section', id: 'section-' + id },
      [el('h2', {}, [icon(symbol, 20), label])],
    );
    sections[id] = section;
    scroll.append(section);
    const b = button(
      label,
      () => {
        section.scrollIntoView({ block: 'start', behavior: 'auto' });
        nav
          .querySelectorAll('button')
          .forEach(n => n.setAttribute('aria-current', String(n === b)));
      },
      '',
      symbol,
    );
    b.setAttribute('aria-current', String(id === groups[0][0]));
    nav.append(b);
  }
  const previewToggle = button(
    'Предпросмотр',
    () => {
      const showing = body.classList.toggle('show-preview');
      previewToggle.textContent = showing
        ? 'Вернуться к полям'
        : 'Предпросмотр';
      previewToggle.setAttribute('aria-pressed', String(showing));
    },
    'secondary mobile-preview-toggle',
    'eye',
  );
  heading.append(previewToggle);
  return { heading, body, nav, form, scroll, preview, footer, sections };
}
function bindField(form, wrapper, draft, key, changed) {
  const input = wrapper.querySelector('input,textarea,select');
  input.addEventListener('input', () => {
    draft[key] = input.value;
    input.removeAttribute('aria-invalid');
    wrapper.querySelector('.field-error').hidden = true;
    changed();
  });
  return wrapper;
}
function errorSummary(form, editorState) {
  const box = el('div', { class: 'form-error', role: 'alert', hidden: true });
  form.prepend(box);
  editorState.errorBox = box;
  return box;
}
function showEditorError(error, state) {
  if (error instanceof ApiError && error.status === 401) {
    endSession('Сессия завершена. Войдите с новым токеном.');
    return;
  }
  const box = state.errorBox;
  if (error instanceof ApiError && error.status === 400) {
    const fields = {};
    for (const message of error.messages) {
      const contact = /contacts\.(\d+)\.(label|value|type)/u.exec(message);
      const field =
        /\b(title|category|description|displayAddress|latitude|longitude|backgroundColor|textColor|promoCode|promoTerms|startsAt|endsAt|buttonLabel|buttonUrl|partnerPointId)\b/u.exec(
          message,
        );
      if (contact)
        fields[`contact-${contact[1]}-${contact[2]}`] =
          'Проверьте значение: backend отклонил это поле.';
      else if (field)
        fields[field[1]] = 'Проверьте значение: backend отклонил это поле.';
    }
    showFieldErrors(state.form, fields);
  }
  box.hidden = false;
  box.replaceChildren(
    icon('warning', 20),
    el('div', {}, [
      el(
        'strong',
        {},
        error instanceof ApiError && error.status === 409
          ? 'Запись изменилась'
          : 'Не удалось сохранить',
      ),
      el('p', {}, error.message),
    ]),
  );
  if (error instanceof ApiError && error.status === 409)
    box.append(
      button(
        'Загрузить актуальную версию',
        () => task(() => go({ ...route })),
        'secondary',
        'refresh',
      ),
    );
  box.scrollIntoView({ block: 'nearest' });
}
function setBusy(state, busy, label = 'Сохраняем…') {
  state.busy = busy;
  state.form.setAttribute('aria-busy', String(busy));
  state.form.querySelectorAll('input,textarea,select,button').forEach(n => {
    if (busy) {
      n.dataset.preDisabled = String(n.disabled);
      n.disabled = true;
    } else {
      n.disabled = n.dataset.preDisabled === 'true';
      delete n.dataset.preDisabled;
    }
  });
  state.footer.querySelectorAll('button').forEach(b => (b.disabled = busy));
  state.saveButton.replaceChildren(
    ...(busy
      ? [el('span', { class: 'small-spinner', 'aria-hidden': true }), label]
      : [state.saveLabel]),
  );
  state.saveButton.setAttribute('aria-busy', String(busy));
  syncControls(state.form);
}
function updateSavebar(state) {
  const dirtyState = Boolean(state.session.dirty || state.pendingFile);
  if (state.dirtyLabel.dataset.dirty === String(dirtyState)) return;
  state.dirtyLabel.dataset.dirty = String(dirtyState);
  state.dirtyLabel.replaceChildren(
    icon(dirtyState ? 'warning' : 'check', 15),
    dirtyState ? 'Есть несохранённые изменения' : 'Изменения сохранены',
  );
  state.dirtyLabel.classList.toggle('is-dirty', dirtyState);
}
function setupSavebar(ui, state, label, onSave, onCancel, explanation) {
  const dirtyLabel = el('span', { class: 'dirty-state' }, [
    icon('check', 15),
    'Изменения сохранены',
  ]);
  state.dirtyLabel = dirtyLabel;
  const save = button(label, () => void onSave(), 'primary');
  state.saveButton = save;
  state.saveLabel = label;
  ui.footer.append(
    el('div', { class: 'savebar-copy' }, [
      dirtyLabel,
      explanation ? el('small', {}, explanation) : null,
    ]),
    el('div', { class: 'savebar-actions' }, [
      button('Отмена', () => task(onCancel), 'secondary'),
      save,
    ]),
  );
}
function previewHeading(pane) {
  const head = el('div', { class: 'preview-heading' }, [
    el('h2', {}, 'В приложении'),
    el('span', { class: 'muted' }, 'Предпросмотр'),
  ]);
  pane.append(head);
  return head;
}
function setupPointPreview(pane, draft, state) {
  const head = previewHeading(pane);
  const target = el('div', { class: 'phone-preview' }),
    note = el(
      'p',
      { class: 'preview-note' },
      'Предпросмотр не открывает ссылки и не учитывает показы или клики.',
    );
  let view = 'card';
  const tabs = el(
    'div',
    { class: 'segmented preview-tabs' },
    [
      ['card', 'Карточка'],
      ['banner', 'Баннер'],
    ].map(([id, label]) => {
      const b = button(label, () => {
        view = id;
        paint();
      });
      b.setAttribute('aria-pressed', String(id === view));
      b.dataset.view = id;
      return b;
    }),
  );
  head.append(tabs);
  pane.append(target, note);
  function paint() {
    tabs
      .querySelectorAll('button')
      .forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.view === view)),
      );
    if (view === 'card')
      updatePreview(target, cardPreview(draft, state.imageUrl));
    else if (state.linkedBanner)
      updatePreview(
        target,
        el('div', { class: 'banner-preview-stack point-banner-preview' }, [
          el(
            'p',
            { class: 'preview-state-label' },
            'Сохранённый баннер · свёрнутый',
          ),
          bannerPreview(state.linkedBanner, draft, false),
          el('p', { class: 'preview-state-label' }, 'Раскрытый'),
          bannerPreview(state.linkedBanner, draft, true),
        ]),
      );
    else
      updatePreview(
        target,
        el('div', { class: 'preview-unavailable' }, [
          icon('info', 22),
          el('p', {}, 'Баннер настраивается отдельно'),
          el(
            'small',
            {},
            'Название, текст и действие баннера независимы от полей точки. Откройте раздел «Баннеры».',
          ),
        ]),
      );
    if (state.previewView && state.previewView !== view) enter(target);
    state.previewView = view;
  }
  return paint;
}
async function renderPointEditor(point, detail, version) {
  const session = new DraftSession(pointFormData(point, city(point.cityId))),
    draft = session.value;
  const ui = editorStructure(
    detail,
    point.title || 'Новая точка',
    point.status,
    groupLabels,
  );
  const state = {
    session,
    form: ui.form,
    footer: ui.footer,
    busy: false,
    pendingFile: null,
    imageUrl: null,
    assetUrl: null,
    fileUrl: null,
    version,
  };
  editor = state;
  errorSummary(ui.form, state);
  ui.form.dataset.timeZone = city(draft.cityId).timeZone;
  const changed = () => {
    session.changed();
    updateSavebar(state);
    paint();
    mapNode.dispatchEvent(new Event('artwork-updated'));
    ui.heading.querySelector('h1').textContent =
      draft.title.trim() || 'Новая точка';
  };
  const add = (group, key, label, options = {}) => {
    const wrap = field(key, label, draft[key], options);
    bindField(ui.form, wrap, draft, key, changed);
    ui.sections[group].append(wrap);
    return wrap;
  };
  ui.sections.main.append(
    el(
      'p',
      { class: 'section-description' },
      'Базовая информация о партнёрской точке. Сохранение не меняет её статус.',
    ),
  );
  add('main', 'title', 'Название точки', { required: true, maxLength: 160 });
  const cityField = selectField(
    'cityId',
    'Город',
    cityOptions(false),
    draft.cityId,
  );
  cityField.querySelector('select').disabled = Boolean(point.id);
  const cat = field('category', 'Категория', draft.category, {
    required: true,
    maxLength: 64,
  });
  bindField(ui.form, cat, draft, 'category', changed);
  ui.sections.main.append(el('div', { class: 'field-row' }, [cityField, cat]));
  add('main', 'description', 'Описание', {
    type: 'textarea',
    maxLength: 1000,
    rows: 4,
  });
  add('address', 'displayAddress', 'Отображаемый адрес', {
    maxLength: 240,
    hint: 'Этот адрес будет показан в карточке и подставлен в Яндекс Карты.',
  });
  const lat = field('latitude', 'Широта', draft.latitude, {
      type: 'number',
      required: true,
    }),
    lng = field('longitude', 'Долгота', draft.longitude, {
      type: 'number',
      required: true,
    });
  for (const f of [lat, lng]) {
    f.querySelector('input').step = 'any';
    bindField(ui.form, f, draft, f.querySelector('input').name, changed);
  }
  ui.sections.address.append(el('div', { class: 'field-row' }, [lat, lng]));
  const mapNode = el('div', {
      class: 'coordinate-map',
      'aria-label': 'Карта выбора координат',
    }),
    mapNote = el(
      'p',
      { class: 'field-hint' },
      'Нажмите на карту или перетащите маркер. Можно ввести координаты вручную. Карта — OpenFreeMap.',
    );
  ui.sections.address.append(mapNode, mapNote);
  const mapDispose = setupMap(
    mapNode,
    draft,
    ui.form,
    changed,
    mapNote,
    () => state.imageUrl,
  );
  const contactList = el('div', { class: 'contact-editor-list' });
  ui.sections.contacts.append(
    el(
      'p',
      { class: 'section-description' },
      'Первый доступный контакт станет основным действием карточки. Порядок можно менять.',
    ),
    contactList,
  );
  const contactKeys = new WeakMap();
  const contactKey = contact => {
    if (!contactKeys.has(contact))
      contactKeys.set(contact, crypto.randomUUID());
    return contactKeys.get(contact);
  };
  function renderContacts(
    animated = false,
    focusedContact = null,
    focusAction = '',
  ) {
    const rects = new Map(
      [...contactList.children].map(row => [
        row.getAttribute('data-motion-key'),
        row.getBoundingClientRect().top,
      ]),
    );
    contactList.replaceChildren();
    draft.contacts.forEach((contact, index) => {
      const row = el('div', {
        class: 'contact-editor',
        'data-contact-id': contact.id ?? '',
        'data-motion-key': contactKey(contact),
      });
      const header = el('div', { class: 'contact-editor-heading' }, [
        el('strong', {}, `Контакт ${index + 1}`),
        el('div', { class: 'contact-order' }, [
          iconButton('Переместить контакт выше', 'up', () => {
            draft.contacts = moveContact(draft.contacts, index, -1);
            renderContacts(true, contact, 'up');
            changed();
          }),
          iconButton('Переместить контакт ниже', 'down', () => {
            draft.contacts = moveContact(draft.contacts, index, 1);
            renderContacts(true, contact, 'down');
            changed();
          }),
          iconButton(
            'Удалить контакт',
            'trash',
            async event => {
              const source = event.currentTarget;
              source.disabled = true;
              await exit(row, 'control');
              if (editor !== state) return;
              const currentIndex = draft.contacts.indexOf(contact);
              if (currentIndex < 0) return;
              draft.contacts.splice(currentIndex, 1);
              renderContacts(
                true,
                draft.contacts[currentIndex] || draft.contacts.at(-1),
                'input',
              );
              changed();
              if (!draft.contacts.length)
                ui.sections.contacts.querySelector('button.secondary')?.focus();
            },
            'danger-text',
          ),
        ]),
      ]);
      header.querySelector('button').disabled = index === 0;
      header.querySelectorAll('button')[1].disabled =
        index === draft.contacts.length - 1;
      const type = selectField(
        `contact-${index}-type`,
        'Тип контакта',
        Object.entries(contactLabels),
        contact.type,
      );
      type.querySelector('select').addEventListener('change', event => {
        contact.type = eventValue(event);
        changed();
      });
      const label = field(`contact-${index}-label`, 'Подпись', contact.label, {
          maxLength: 80,
          required: true,
        }),
        value = field(
          `contact-${index}-value`,
          'Номер, email или HTTPS-ссылка',
          contact.value,
          { maxLength: 500, required: true },
        );
      for (const [wrapper, key] of /** @type {Array<[HTMLElement,string]>} */ ([
        [label, 'label'],
        [value, 'value'],
      ]))
        wrapper.querySelector('input').addEventListener('input', event => {
          contact[key] = eventValue(event);
          changed();
        });
      row.append(
        header,
        el('div', { class: 'field-row' }, [type, label]),
        value,
      );
      contactList.append(row);
      if (animated) {
        const old = rects.get(contactKey(contact));
        if (old === undefined) enter(row, 'control');
        else move(row, old - row.getBoundingClientRect().top);
      }
      if (contact === focusedContact) {
        const target = /** @type {HTMLInputElement|HTMLButtonElement} */ (
          focusAction === 'input'
            ? row.querySelector('input:not([hidden])')
            : row.querySelectorAll('.contact-order button')[
                focusAction === 'up' ? 0 : 1
              ]
        );
        const fallback = /** @type {HTMLButtonElement} */ (
          row.querySelector('button:not([disabled])')
        );
        (target && !target.disabled ? target : fallback)?.focus({
          preventScroll: true,
        });
      }
    });
  }
  renderContacts();
  ui.sections.contacts.append(
    button(
      'Добавить контакт',
      () => {
        if (draft.contacts.length >= 100) {
          notify('Можно добавить не более 100 контактов.', 'error');
          return;
        }
        draft.contacts.push({
          type: 'PHONE',
          label: '',
          value: '',
          displayOrder: draft.contacts.length,
        });
        renderContacts(true, draft.contacts.at(-1), 'input');
        changed();
      },
      'secondary',
      'plus',
    ),
  );
  add('promo', 'promoCode', 'Промокод', {
    maxLength: 32,
    hint: 'Регистр сохраняется. Оставьте пустым, если промокода нет.',
  });
  add('promo', 'promoTerms', 'Условия промокода', {
    type: 'textarea',
    maxLength: 240,
    rows: 3,
  });
  const imageBox = el('div', { class: 'image-editor' }),
    imageSlot = el('div', { class: 'image-slot' }),
    file = field('image', 'Изображение · PNG / JPEG / WebP до 4 МБ', '', {
      type: 'file',
    });
  file.querySelector('input').accept = 'image/png,image/jpeg,image/webp';
  file.querySelector('input').disabled = !point.id;
  const imageStatus = el(
    'p',
    { class: 'field-hint' },
    point.id
      ? 'Изображение сохраняется вместе с формой. При ошибке прежний файл останется.'
      : 'Сначала сохраните черновик. После этого можно загрузить изображение.',
  );
  file.querySelector('input').addEventListener('change', () => {
    const selected = file.querySelector('input').files?.[0];
    if (!selected) return;
    if (selected.size > 4 * 1024 * 1024) {
      notify('Размер изображения должен быть не больше 4 МБ.', 'error');
      file.querySelector('input').value = '';
      controlError(file, 'Размер изображения должен быть не больше 4 МБ.');
      syncControls(ui.form);
      return;
    }
    controlError(file, '');
    if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
    state.pendingFile = selected;
    state.fileUrl = URL.createObjectURL(selected);
    state.imageUrl = state.fileUrl;
    updatePreview(
      imageSlot,
      artwork(state.imageUrl, appearance(draft).accent, 64),
    );
    changed();
  });
  const clearImage = button(
    'Убрать изображение',
    () =>
      task(async () => {
        if (dirty()) {
          notify('Сначала сохраните или отмените изменения формы.', 'info');
          return;
        }
        if (
          !(await confirmDialog({
            title: 'Убрать изображение?',
            text: 'Вместо него появится штатный знак партнёра. Поля и статус точки не изменятся.',
            confirm: 'Убрать изображение',
            danger: true,
          }))
        )
          return;
        setBusy(state, true);
        try {
          await api.request(`/points/${point.id}/image`, { method: 'DELETE' });
          await showPage({ kind: 'points', id: point.id });
          notify('Изображение удалено');
        } catch (error) {
          showEditorError(error, state);
        } finally {
          if (editor === state) setBusy(state, false);
        }
      }),
    'text-button danger-text',
    'trash',
  );
  clearImage.disabled = !point.id || !point.imageAssetKey;
  imageBox.append(imageSlot, el('div', {}, [file, imageStatus, clearImage]));
  ui.sections.appearance.append(imageBox);
  const bg = field('backgroundColor', 'Акцентный цвет', draft.backgroundColor, {
      type: 'color',
    }),
    fg = field('textColor', 'Текст на акценте', draft.textColor, {
      type: 'color',
    });
  bindField(ui.form, bg, draft, 'backgroundColor', changed);
  bindField(ui.form, fg, draft, 'textColor', changed);
  ui.sections.appearance.append(el('div', { class: 'field-row' }, [bg, fg]));
  const presets = el(
    'div',
    { class: 'color-presets', 'aria-label': 'Быстрые цвета' },
    ['#D91D2D', '#286348', '#285C78', '#F7F4EA', '#8C4AA8'].map(color => {
      const b = button(
        '',
        () => {
          draft.backgroundColor = color;
          bg.querySelector('input').value = color;
          changed();
        },
        'color-swatch',
      );
      b.style.backgroundColor = color;
      b.setAttribute('aria-label', 'Акцент ' + color);
      b.dataset.tooltip = color;
      return b;
    }),
  );
  ui.sections.appearance.append(
    presets,
    el(
      'p',
      { class: 'field-hint' },
      'Светлый акцент в мелких элементах отображается контрастно по правилам приложения. Сохранённый цвет не подменяется.',
    ),
  );
  const start = add('period', 'startsAt', 'Начало размещения', {
      type: 'datetime-local',
      required: true,
    }),
    end = add('period', 'endsAt', 'Окончание размещения', {
      type: 'datetime-local',
      required: true,
    });
  const zone = el('p', { class: 'timezone-note' }, [
    icon('clock', 16),
    `Дата и время города: ${city(draft.cityId).timeZone}`,
  ]);
  ui.sections.period.append(
    zone,
    el(
      'p',
      { class: 'field-hint' },
      'Публикация — отдельное действие. Будущее размещение не показывается до начала срока.',
    ),
  );
  const paint = setupPointPreview(ui.preview, draft, state);
  function updateImage() {
    updatePreview(
      imageSlot,
      artwork(state.imageUrl, appearance(draft).accent, 64),
    );
    paint();
    mapNode.dispatchEvent(new Event('artwork-updated'));
  }
  setupSavebar(
    ui,
    state,
    point.id ? 'Сохранить изменения' : 'Сохранить черновик',
    () => savePoint(state, renderContacts),
    () => go({ kind: 'points', id: point.id }),
    point.id
      ? 'Статус точки управляется отдельно.'
      : 'Новая точка останется черновиком до подтверждения публикации.',
  );
  const actions = el('div', { class: 'detail-actions' });
  if (point.id)
    actions.append(
      button(
        'Посмотреть статистику',
        () => task(() => go({ kind: 'statistics', id: point.id })),
        'text-button',
        'bars',
      ),
      pointActions(point, state),
    );
  ui.heading.append(actions);
  ui.form.addEventListener('submit', event => {
    event.preventDefault();
    void savePoint(state, renderContacts);
  });
  cityField.querySelector('select').addEventListener('change', event => {
    const c = city(eventValue(event));
    draft.cityId = c.id;
    ui.form.dataset.timeZone = c.timeZone;
    draft.latitude = c.center.latitude;
    draft.longitude = c.center.longitude;
    control(ui.form, 'latitude').value = draft.latitude;
    control(ui.form, 'longitude').value = draft.longitude;
    zone.replaceChildren(
      icon('clock', 16),
      `Дата и время города: ${c.timeZone}`,
    );
    start.querySelector('input').value = draft.startsAt;
    end.querySelector('input').value = draft.endsAt;
    mapNode.dispatchEvent(new Event('coordinates-updated'));
    changed();
  });
  updateSavebar(state);
  paint();
  updateImage();
  if (point.status === 'ENDED') {
    ui.form
      .querySelectorAll('input,textarea,select,button')
      .forEach(control => {
        control.setAttribute('disabled', '');
      });
    mapNode.inert = true;
    state.saveButton.disabled = true;
    state.saveButton.textContent = 'Только просмотр';
    state.dirtyLabel.replaceChildren(
      icon('info', 15),
      'Завершённое размещение нельзя изменить',
    );
  }
  dispose = () => {
    mapDispose();
    if (state.assetUrl) URL.revokeObjectURL(state.assetUrl);
    if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
  };
  if (point.id && point.imageAssetKey) {
    try {
      const blob = await api.request(`/points/${point.id}/image`, {
        blob: true,
      });
      if (!current(version)) return;
      state.assetUrl = URL.createObjectURL(blob);
      if (!state.pendingFile) state.imageUrl = state.assetUrl;
      updateImage();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      imageStatus.textContent =
        'Изображение недоступно. В предпросмотре показан штатный знак; можно выбрать новый файл.';
    }
  }
  if (point.id) {
    try {
      const banners = await api.request(
        '/banners?' + params({ cityId: point.cityId, page: 1, pageSize: 1 }),
      );
      if (!current(version)) return;
      state.linkedBanner =
        banners.items.find(b => b.partnerPointId === point.id) ?? null;
      paint();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      // A failed optional preview request does not discard the editable point.
    }
  }
}
function pointActions(point, state) {
  const menu = el('details', { class: 'action-menu' }),
    summary = el(
      'summary',
      { 'aria-label': 'Действия с точкой' },
      icon('more', 22),
    );
  menu.append(summary);
  const popup = el('div', { class: 'menu-popover' });
  const actions =
    point.status === 'DRAFT'
      ? [['publish', 'Опубликовать']]
      : point.status === 'ACTIVE'
        ? [
            ['pause', 'Приостановить'],
            ['end', 'Завершить'],
          ]
        : point.status === 'PAUSED'
          ? [
              ['resume', 'Возобновить'],
              ['end', 'Завершить'],
            ]
          : [];
  if (!actions.length) popup.append(el('p', {}, 'Размещение завершено'));
  for (const [action, label] of actions)
    popup.append(
      button(
        label,
        () =>
          task(async () => {
            menu.open = false;
            if (state.busy) return;
            if (dirty()) {
              notify(
                'Сначала сохраните изменения полей. Статус меняется отдельно.',
                'info',
              );
              return;
            }
            if (
              !(await confirmDialog({
                title: label + ' размещение?',
                text: `«${point.title}» · ${city(point.cityId).name}\n${dates(point.startsAt, point.endsAt, point.cityId)}\n${action === 'publish' ? 'Точка станет доступна по правилам срока и города. Баннер включается отдельно.' : 'Период и баннер не изменятся автоматически.'}`,
                confirm: label,
                danger: action === 'end',
              }))
            )
              return;
            setBusy(state, true);
            try {
              await api.request(`/points/${point.id}/actions/${action}`, {
                method: 'POST',
              });
              notify('Статус размещения изменён');
              await showPage({ kind: 'points', id: point.id });
            } catch (error) {
              showEditorError(error, state);
            } finally {
              if (editor === state) setBusy(state, false);
            }
          }),
        action === 'end' ? 'danger-text' : '',
      ),
    );
  menu.append(popup);
  enhanceMenu(menu);
  return menu;
}
async function savePoint(state, renderContacts) {
  if (state.busy) return;
  if (state.session.value.status === 'ENDED') return;
  if (state.recoveryId) {
    await task(() => go({ kind: 'points', id: state.recoveryId }));
    return;
  }
  const draft = state.session.value,
    c = city(draft.cityId),
    errors = { ...validateDraft(draft, c), ...controlErrors(state.form) };
  if (contrast(draft.backgroundColor, draft.textColor) < 4.5)
    errors.textColor =
      'Недостаточный контраст текста и фона. Выберите другую пару.';
  showFieldErrors(state.form, errors);
  if (Object.keys(errors).length) {
    notify('Проверьте отмеченные поля.', 'error');
    return;
  }
  state.errorBox.hidden = true;
  setBusy(state, true);
  try {
    const saved = await api.request(
      draft.id ? '/points/' + draft.id : '/points',
      {
        method: draft.id ? 'PUT' : 'POST',
        body: pointPayload(draft, c),
        key: state.session.mutationKey,
      },
    );
    state.recoveryId = saved.id;
    const latest = await api.request('/points/' + saved.id);
    state.recoveryId = null;
    if (!current(state.version)) return;
    state.session.accept(pointFormData(latest, c));
    route = { kind: 'points', id: saved.id };
    updateSavebar(state);
    if (state.pendingFile) {
      const body = new FormData();
      body.set('image', state.pendingFile);
      await api.request(`/points/${saved.id}/image`, { method: 'POST', body });
      state.pendingFile = null;
    }
    notify(
      latest.status === 'DRAFT'
        ? 'Черновик сохранён. Публикация — отдельное действие.'
        : 'Изменения сохранены. Статус точки не изменён.',
    );
    await showPage({ kind: 'points', id: saved.id });
  } catch (error) {
    if (editor === state) {
      showEditorError(error, state);
      if (state.pendingFile && state.session.value.id)
        notify(
          'Поля точки могли сохраниться. Выбранный файл оставлен для повтора; прежнее изображение не удалено.',
          'info',
        );
    }
  } finally {
    if (editor === state) {
      setBusy(state, false);
      renderContacts();
      updateSavebar(state);
    }
  }
}
function setupMap(node, draft, form, changed, note, getImage) {
  let map, marker;
  try {
    map = new window.maplibregl.Map({
      container: node,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [Number(draft.longitude), Number(draft.latitude)],
      zoom: 14,
      attributionControl: {},
    });
    map.addControl(
      new window.maplibregl.NavigationControl({ showCompass: false }),
    );
    const element = el('div', { class: 'map-partner-marker' });
    const refreshArtwork = () => {
      const accent = appearance(draft).accent;
      element.style.setProperty('--partner-accent', accent);
      updatePreview(
        element,
        artwork(getImage(), accent, 38),
        el('i', { class: 'map-partner-tip' }),
      );
    };
    refreshArtwork();
    node.addEventListener('artwork-updated', refreshArtwork);
    marker = new window.maplibregl.Marker({
      draggable: true,
      element,
      anchor: 'bottom',
    })
      .setLngLat([Number(draft.longitude), Number(draft.latitude)])
      .addTo(map);
    const set = (lng, lat) => {
      draft.latitude = Number(lat.toFixed(6));
      draft.longitude = Number(lng.toFixed(6));
      control(form, 'latitude').value = draft.latitude;
      control(form, 'longitude').value = draft.longitude;
      marker.setLngLat([lng, lat]);
      changed();
    };
    map.on('click', event => set(event.lngLat.lng, event.lngLat.lat));
    marker.on('dragend', () => {
      const p = marker.getLngLat();
      set(p.lng, p.lat);
    });
    const update = () => {
      const lat = Number(draft.latitude),
        lng = Number(draft.longitude);
      if (
        Number.isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        Number.isFinite(lng) &&
        lng >= -180 &&
        lng <= 180
      ) {
        marker.setLngLat([lng, lat]);
        map.setCenter([lng, lat]);
      }
    };
    node.addEventListener('coordinates-updated', update);
    form.addEventListener('change', update);
    map.on('error', () => {
      note.textContent =
        'Карта недоступна. Введите координаты вручную; остальные поля работают.';
    });
    return () => map.remove();
  } catch {
    node.replaceChildren(
      el('p', { class: 'map-fallback' }, [
        icon('pin', 24),
        'Карта недоступна. Введите координаты вручную.',
      ]),
    );
    return () => {
      try {
        map?.remove();
      } catch {
        /* A partially initialized map needs no further work. */
      }
    };
  }
}
async function bannerWorkspace(next, version) {
  const { sidebar, detail } = workspaceShell('Баннеры');
  sidebarFilters(sidebar, 'banners', () => showPage({ kind: 'banners' }));
  sidebar.append(
    button(
      'Настроить баннер',
      () =>
        task(() =>
          go({
            kind: 'banners',
            isNew: true,
            cityId: filters.cityId || metadata.cities[0].id,
          }),
        ),
      'primary new-placement',
      'plus',
    ),
    loading(),
  );
  detail.append(loading());
  const list = await api.request(
    '/banners?' +
      params({ cityId: filters.cityId, page: filters.page, pageSize }),
  );
  if (!current(version)) return;
  sidebar.lastChild.remove();
  const selectedCity = next.cityId ?? list.items[0]?.cityId;
  const listNode = el('div', { class: 'placement-list' });
  for (const b of list.items) {
    const row = button(
      '',
      () => task(() => go({ kind: 'banners', cityId: b.cityId })),
      'placement-item' + (selectedCity === b.cityId ? ' selected' : ''),
    );
    row.setAttribute(
      'aria-label',
      'Открыть баннер ' + (b.title || city(b.cityId).name),
    );
    row.append(
      el('span', { class: 'list-banner-icon' }, icon('speaker', 25)),
      el('span', { class: 'placement-item-copy' }, [
        el('strong', {}, b.title || 'Без заголовка'),
        el('small', {}, city(b.cityId).name),
        el(
          'span',
          { class: 'status-pill ' + (b.enabled ? 'active' : 'draft') },
          b.enabled ? 'Включён' : 'Выключен / черновик',
        ),
      ]),
      icon('right', 16),
    );
    listNode.append(row);
  }
  sidebar.append(
    listNode.children.length
      ? listNode
      : el(
          'p',
          { class: 'sidebar-empty' },
          'Баннеров нет. Можно настроить один баннер на город.',
        ),
    pager(list.total, filters.page, pageSize, async page => {
      if (!(await leaveAllowed())) return;
      filters.page = page;
      await showPage({ kind: 'banners' });
    }),
  );
  if (!selectedCity && !next.isNew) {
    detail.replaceChildren(
      empty(
        'Настройте баннер города',
        'Баннер необязателен. Его сохранение и включение выполняются отдельно.',
        button(
          'Настроить баннер',
          () =>
            task(() =>
              go({
                kind: 'banners',
                isNew: true,
                cityId: filters.cityId || metadata.cities[0].id,
              }),
            ),
          'primary',
          'plus',
        ),
      ),
    );
    return;
  }
  const cityId = selectedCity || filters.cityId || metadata.cities[0].id;
  let b = list.items.find(item => item.cityId === cityId);
  if (!b) {
    const result = await api.request(
      '/banners?' + params({ cityId, page: 1, pageSize: 1 }),
    );
    b = result.items[0];
  }
  if (!current(version)) return;
  await renderBannerEditor(
    b ?? {
      cityId,
      title: '',
      text: '',
      buttonLabel: '',
      buttonUrl: '',
      partnerPointId: '',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      enabled: false,
    },
    detail,
    version,
  );
}
async function renderBannerEditor(banner, detail, version) {
  const session = new DraftSession({
      ...banner,
      startsAt: localDateTime(banner.startsAt, city(banner.cityId).timeZone),
      endsAt: localDateTime(banner.endsAt, city(banner.cityId).timeZone),
    }),
    draft = session.value;
  const ui = editorStructure(
    detail,
    banner.title ? `Баннер · ${banner.title}` : 'Новый баннер',
    banner.enabled ? 'ACTIVE' : 'DRAFT',
    [
      ['main', 'Содержание', 'speaker'],
      ['link', 'Действие и точка', 'link'],
      ['period', 'Срок размещения', 'calendar'],
    ],
  );
  ui.heading
    .querySelector('.status-pill')
    .replaceChildren(
      el('i', { 'aria-hidden': true }),
      banner.enabled ? 'Включён' : 'Выключен / черновик',
    );
  const state = {
    session,
    form: ui.form,
    footer: ui.footer,
    busy: false,
    pendingFile: null,
    linked: null,
    version,
  };
  editor = state;
  errorSummary(ui.form, state);
  ui.form.dataset.timeZone = city(draft.cityId).timeZone;
  let paint = () => {};
  const changed = () => {
    session.changed();
    updateSavebar(state);
    paint();
  };
  const add = (group, key, label, options = {}) => {
    const wrap = field(key, label, draft[key], options);
    bindField(ui.form, wrap, draft, key, changed);
    ui.sections[group].append(wrap);
    return wrap;
  };
  const cityField = selectField(
    'cityId',
    'Город',
    cityOptions(false),
    draft.cityId,
  );
  cityField.querySelector('select').disabled = Boolean(banner.id);
  ui.sections.main.append(
    cityField,
    el(
      'p',
      { class: 'section-description' },
      'В городе доступен один баннер. Заголовок, текст и действие задаются независимо от карточки точки.',
    ),
  );
  add('main', 'title', 'Заголовок баннера', { required: true, maxLength: 160 });
  add('main', 'text', 'Текст баннера', {
    type: 'textarea',
    required: true,
    maxLength: 300,
    rows: 4,
  });
  const picker = remoteCombobox({
    name: 'pointSearch',
    label: 'Найти связанную точку',
    load: async (query, page) => {
      const data = await api.request(
        '/points?' +
          params({ cityId: draft.cityId, search: query, page, pageSize: 10 }),
      );
      return {
        ...data,
        items: data.items.map(p => ({
          id: p.id,
          label: p.title,
          detail: statusLabels[p.status] + ' · ' + city(p.cityId).name,
        })),
      };
    },
    onSelect: async item => {
      if (!item) {
        state.linked = null;
        draft.partnerPointId = '';
        changed();
        return;
      }
      const selected = await api.request('/points/' + item.id);
      if (!current(version)) return;
      state.linked = selected;
      draft.partnerPointId = selected.id;
      changed();
    },
    onError: error => {
      if (error instanceof ApiError && error.status === 401)
        endSession('Сессия завершена. Получите новый токен.');
    },
  });
  const selectedPaint = () =>
    picker.setSelected(
      state.linked ? { id: state.linked.id, label: state.linked.title } : null,
    );
  ui.sections.link.append(
    picker.element,
    el(
      'p',
      { class: 'field-hint' },
      'Поиск по названию. Цвета наследуются от выбранной точки.',
    ),
  );
  add('link', 'buttonLabel', 'Подпись кнопки', {
    required: true,
    maxLength: 80,
  });
  add('link', 'buttonUrl', 'HTTPS-ссылка действия', {
    type: 'url',
    required: true,
    maxLength: 2048,
  });
  ui.sections.link.append(
    el(
      'p',
      { class: 'field-hint' },
      'Цвета наследуются от связанной точки. Её статус и срок не изменяются. Для включения баннера потребуется действующая активная точка.',
    ),
  );
  add('period', 'startsAt', 'Начало показа', {
    type: 'datetime-local',
    required: true,
  });
  add('period', 'endsAt', 'Окончание показа', {
    type: 'datetime-local',
    required: true,
  });
  ui.sections.period.append(
    el('p', { class: 'timezone-note' }, [
      icon('clock', 16),
      `Местное время: ${city(draft.cityId).timeZone}`,
    ]),
  );
  previewHeading(ui.preview);
  const target = el('div', { class: 'banner-preview-stack' });
  ui.preview.append(
    target,
    el(
      'p',
      { class: 'preview-note' },
      'Оба состояния баннера. Предпросмотр не открывает ссылки и не учитывает клики.',
    ),
  );
  paint = () =>
    updatePreview(
      target,
      el('p', { class: 'preview-state-label' }, 'Свёрнутый'),
      bannerPreview(draft, state.linked ?? banner.partnerPoint ?? {}, false),
      el('p', { class: 'preview-state-label' }, 'Раскрытый'),
      bannerPreview(draft, state.linked ?? banner.partnerPoint ?? {}, true),
    );
  setupSavebar(
    ui,
    state,
    'Сохранить выключенный черновик',
    () => saveBanner(state),
    () => go({ kind: 'banners', cityId: banner.cityId }),
    'После сохранения баннер будет выключен. Включение — отдельное действие.',
  );
  const actions = el('div', { class: 'detail-actions' });
  if (banner.id)
    for (const [action, label] of [
      ['enable', 'Включить'],
      ['pause', 'Приостановить'],
      ['end', 'Завершить'],
    ]) {
      const actionButton = button(
        label,
        () =>
          task(async () => {
            if (dirty()) {
              notify('Сначала сохраните изменения баннера.', 'info');
              return;
            }
            if (
              !(await confirmDialog({
                title: `${label} баннер?`,
                text: `${banner.title} · ${city(banner.cityId).name}\n${dates(banner.startsAt, banner.endsAt, banner.cityId)}\nСвязанная точка и её срок не изменятся.`,
                confirm: label,
                danger: action === 'end',
              }))
            )
              return;
            setBusy(state, true);
            try {
              await api.request(`/banners/${banner.cityId}/actions/${action}`, {
                method: 'POST',
              });
              notify('Состояние баннера изменено');
              await showPage({ kind: 'banners', cityId: banner.cityId });
            } catch (error) {
              showEditorError(error, state);
            } finally {
              if (editor === state) setBusy(state, false);
            }
          }),
        action === 'enable'
          ? 'secondary'
          : action === 'end'
            ? 'text-button danger-text'
            : 'text-button',
      );
      actionButton.disabled =
        (action === 'pause' && !banner.enabled) ||
        (action === 'enable' && banner.enabled);
      actions.append(actionButton);
    }
  ui.heading.append(actions);
  ui.form.addEventListener('submit', event => {
    event.preventDefault();
    void saveBanner(state);
  });
  cityField.querySelector('select').addEventListener('change', event => {
    const id = eventValue(event);
    void task(() => go({ kind: 'banners', isNew: true, cityId: id }));
  });
  dispose = () => picker.close();
  updateSavebar(state);
  paint();
  selectedPaint();
  if (banner.partnerPointId) {
    try {
      state.linked = await api.request('/points/' + banner.partnerPointId);
      if (!current(version)) return;
      selectedPaint();
      paint();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      controlError(
        picker.element,
        'Связанная точка не загрузилась. Найдите и выберите её заново.',
      );
    }
  }
}
async function saveBanner(state) {
  if (state.busy) return;
  const draft = state.session.value,
    errors = {
      ...validateDraft(draft, city(draft.cityId), 'banner'),
      ...controlErrors(state.form),
    };
  showFieldErrors(state.form, errors);
  if (Object.keys(errors).length) {
    notify('Проверьте отмеченные поля.', 'error');
    return;
  }
  if (
    !(await confirmDialog({
      title: 'Сохранить выключенный баннер?',
      text: 'После сохранения баннер не будет показываться. Включите его отдельным действием, когда проверите содержание. Связанная точка не изменится.',
      confirm: 'Сохранить черновик',
    }))
  )
    return;
  setBusy(state, true);
  state.errorBox.hidden = true;
  try {
    await api.request('/banners/' + draft.cityId, {
      method: 'PUT',
      body: bannerPayload(draft, city(draft.cityId)),
      key: state.session.mutationKey,
    });
    notify('Баннер сохранён и выключен');
    await showPage({ kind: 'banners', cityId: draft.cityId });
  } catch (error) {
    if (editor === state) showEditorError(error, state);
  } finally {
    if (editor === state) setBusy(state, false);
  }
}

$('login-form').addEventListener('submit', event => {
  event.preventDefault();
  const submit = $('login-submit');
  if (submit.disabled) return;
  const base = $('login-api').value.trim(),
    token = $('login-token').value;
  $('login-token').value = '';
  $('login-error').hidden = true;
  if (!token.trim()) {
    $('login-error').textContent = 'Введите токен владельца.';
    $('login-error').hidden = false;
    $('login-token').focus();
    return;
  }
  submit.disabled = true;
  submit.textContent = 'Подключаемся…';
  void (async () => {
    try {
      api.connect(base, token);
      const session = await api.request('/session');
      metadata = await api.request('/metadata');
      if (!metadata.cities?.length)
        throw new Error('Backend не вернул доступные города.');
      expiresAt = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
        throw new Error('Срок токена уже истёк. Получите новый токен.');
      $('login').hidden = true;
      $('console').hidden = false;
      filters.cityId = '';
      filters.page = 1;
      await showPage({ kind: 'overview' });
      notify('Подключено к панели владельца');
    } catch (error) {
      endSession(error.message || 'Не удалось подключиться.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Войти';
    }
  })();
});
for (const b of document.querySelectorAll('[data-page]'))
  b.addEventListener(
    'click',
    () => void task(() => go({ kind: b.getAttribute('data-page') })),
  );
$('brand-home').addEventListener(
  'click',
  () => void task(() => go({ kind: 'overview' })),
);
$('rotate').addEventListener(
  'click',
  () =>
    void task(async () => {
      const b = $('rotate');
      b.disabled = true;
      try {
        expiresAt = Date.parse(await api.rotate());
        notify('Токен обновлён. Срок сессии остался прежним.');
      } finally {
        b.disabled = false;
        /** @type {HTMLDetailsElement} */ (
          document.querySelector('.session-menu')
        ).open = false;
      }
    }),
);
$('logout').addEventListener(
  'click',
  () =>
    void task(async () => {
      if (!(await leaveAllowed())) return;
      const b = $('logout');
      b.disabled = true;
      try {
        await api.request('/session', { method: 'DELETE' });
        endSession();
        notify('Вы вышли из панели');
      } finally {
        b.disabled = false;
      }
    }),
);
setupTooltips();
enhanceMenu(document.querySelector('details.session-menu'));
document
  .querySelector('.session-menu summary>span:last-child')
  .replaceChildren(icon('down', 16));
let lastExpiryText = '';
setInterval(() => {
  if (!expiresAt) return;
  if (Date.now() >= expiresAt) {
    endSession('Срок сессии истёк. Получите новый токен владельца.');
    return;
  }
  const text = `${Math.ceil((expiresAt - Date.now()) / 60000)} мин.`;
  if (text !== lastExpiryText) {
    lastExpiryText = text;
    $('expiry').replaceChildren(icon('clock', 17), text);
  }
}, 1000);
window.addEventListener('beforeunload', event => {
  if (dirty()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  api.disconnect();
  ++generation;
  dispose();
});
fetch('/config.json', { cache: 'no-store' })
  .then(r => {
    if (!r.ok) throw new Error();
    return r.json();
  })
  .then(c => {
    if (c.apiUrl) $('login-api').value = c.apiUrl;
  })
  .catch(() => {
    $('login-error').textContent =
      'Локальная конфигурация недоступна. Адрес API можно ввести вручную.';
    $('login-error').hidden = false;
  });
