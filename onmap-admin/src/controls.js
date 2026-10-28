import { el, icon, button, iconButton } from './dom.js';
import { popup } from './overlays.js';
import {
  filteredOptions,
  optionIndex,
  monthGrid,
  parseDay,
  parseCalendarInput,
  displayDate,
  calendarValue,
  addDays,
  hexRgb,
  rgbHex,
} from './control-model.js';
const uid = prefix => prefix + '-' + crypto.randomUUID();
const send = input => {
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
function hideSource(input) {
  input.hidden = true;
  input.tabIndex = -1;
  input.removeAttribute('aria-labelledby');
  input.setAttribute('aria-hidden', 'true');
  input.id = 'source-' + input.name;
  input.classList.add('control-source');
}
function linkControl(input, button, refresh) {
  const sync = () => {
    button.disabled = input.disabled;
    if (input.getAttribute('aria-describedby'))
      button.setAttribute(
        'aria-describedby',
        input.getAttribute('aria-describedby'),
      );
    refresh();
  };
  new MutationObserver(sync).observe(input, {
    attributes: true,
    attributeFilter: ['disabled', 'aria-invalid'],
  });
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  input.addEventListener('onmap:control-sync', sync);
  queueMicrotask(sync);
}
export function syncControls(form) {
  for (const input of form.querySelectorAll('.control-source'))
    input.dispatchEvent(new Event('onmap:control-sync'));
}
export function controlErrors(form) {
  return Object.fromEntries(
    [...form.querySelectorAll('[data-control-error]')]
      .filter(n => n.dataset.controlError)
      .map(n => [n.name, n.dataset.controlError]),
  );
}
export function controlError(wrapper, message) {
  const error = wrapper.querySelector('.field-error'),
    control = wrapper.querySelector(
      '[role=combobox],.control-trigger,input:not([hidden])',
    );
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
  control?.setAttribute('aria-invalid', String(Boolean(message)));
}

/** Native select is a hidden form adapter; the accessible interactive control is a combobox. */
export function selectControl(select, labelId, label) {
  hideSource(select);
  const value = el('span', { class: 'select-value' }),
    trigger = button(
      [value, icon('down', 17)],
      null,
      'select-trigger control-trigger',
    );
  const listId = uid('options');
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-controls', listId);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-labelledby', labelId);
  let overlay,
    active = 0,
    list,
    search,
    query = '',
    typeahead = '',
    typeTimer;
  const all = () =>
    [...select.options].map(o => ({
      id: o.value,
      label: o.textContent,
      disabled: o.disabled,
    }));
  const visible = () => filteredOptions(all(), query);
  const refresh = () => {
    value.textContent =
      select.selectedOptions[0]?.textContent || 'Выберите вариант';
    trigger.setAttribute(
      'aria-invalid',
      select.getAttribute('aria-invalid') || 'false',
    );
    if (overlay && select.disabled) overlay.close(false);
  };
  function focusOption(index) {
    const options = visible();
    active = Math.max(0, Math.min(index, options.length - 1));
    list
      .querySelectorAll('[role=option]')
      .forEach((n, i) => (n.dataset.active = String(i === active)));
    const chosen = list.querySelectorAll('[role=option]')[active];
    const focused = search || trigger;
    if (chosen) {
      focused.setAttribute('aria-activedescendant', chosen.id);
      chosen.scrollIntoView({ block: 'nearest' });
    } else focused.removeAttribute('aria-activedescendant');
  }
  function choose(option) {
    if (!option || option.disabled) return;
    select.value = option.id;
    refresh();
    send(select);
    overlay?.close(true);
  }
  function paint() {
    list.replaceChildren(
      ...visible().map((option, index) => {
        const row = el(
          'li',
          {
            role: 'option',
            id: listId + '-' + index,
            'aria-selected': String(option.id === select.value),
            'aria-disabled': String(option.disabled),
            class: 'select-option',
          },
          [
            el('span', {}, option.label),
            option.id === select.value ? icon('check', 16) : null,
          ],
        );
        row.addEventListener('pointermove', () => focusOption(index));
        row.addEventListener('pointerdown', event => event.preventDefault());
        row.addEventListener('click', () => choose(option));
        return row;
      }),
    );
    if (!visible().length)
      list.append(
        el(
          'li',
          { class: 'popup-empty', role: 'presentation' },
          'Ничего не найдено',
        ),
      );
    focusOption(active);
    overlay?.position();
  }
  function keydown(event) {
    if (event.key === 'Tab') {
      overlay?.close(false);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (!overlay) {
        open();
        return;
      }
      if (event.key === 'Enter') choose(visible()[active]);
      else
        focusOption(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? visible().length - 1
              : optionIndex(
                  active,
                  event.key === 'ArrowDown' ? 1 : -1,
                  visible().length,
                ),
        );
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      if (event.target === search) return;
      event.preventDefault();
      if (!overlay) open();
      if (search) {
        search.value += event.key;
        query = search.value;
        active = 0;
        paint();
        return;
      }
      clearTimeout(typeTimer);
      typeahead += event.key.toLocaleLowerCase('ru-RU');
      typeTimer = setTimeout(() => (typeahead = ''), 700);
      const index = visible().findIndex(o =>
        o.label.toLocaleLowerCase('ru-RU').startsWith(typeahead),
      );
      if (index >= 0) focusOption(index);
    }
  }
  function open() {
    if (select.disabled || overlay) return;
    query = '';
    const panel = el('div', { class: 'select-popup' });
    list = el('ul', {
      id: listId,
      role: 'listbox',
      'aria-label': label,
      class: 'select-options',
    });
    search = null;
    if (all().length > 7) {
      search = el('input', {
        type: 'search',
        class: 'popup-search',
        'aria-label': 'Поиск вариантов: ' + label,
        'aria-controls': listId,
        autocomplete: 'off',
      });
      search.addEventListener('input', () => {
        query = search.value;
        active = 0;
        paint();
      });
      search.addEventListener('keydown', keydown);
      panel.append(
        el('div', { class: 'popup-search-wrap' }, [icon('search', 16), search]),
      );
    }
    panel.append(list);
    active = Math.max(
      0,
      visible().findIndex(o => o.id === select.value),
    );
    paint();
    trigger.setAttribute('aria-expanded', 'true');
    overlay = popup(trigger, panel, {
      width: Math.max(240, trigger.offsetWidth),
      onClose: () => {
        overlay = null;
        search = null;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.removeAttribute('aria-activedescendant');
        clearTimeout(typeTimer);
      },
    });
    focusOption(active);
    search?.focus();
  }
  trigger.addEventListener('click', () => {
    if (overlay) overlay.close();
    else open();
  });
  trigger.addEventListener('keydown', keydown);
  linkControl(select, trigger, refresh);
  return trigger;
}

/** Server-search combobox: pagination and errors remain outside the listbox options. */
export function remoteCombobox({
  name,
  label,
  load,
  onSelect,
  onError = _error => {},
}) {
  const id = uid('remote'),
    labelNode = el('span', { class: 'field-label', id: id + '-label' }, label),
    input = el('input', {
      name,
      type: 'text',
      role: 'combobox',
      'aria-labelledby': id + '-label',
      'aria-controls': id + '-list',
      'aria-expanded': 'false',
      'aria-autocomplete': 'list',
      autocomplete: 'off',
      placeholder: 'Найти по названию',
    });
  const clear = iconButton('Очистить связанную точку', 'close', () => {
    setSelected(null);
    void Promise.resolve(onSelect(null)).catch(onError);
    input.focus();
    open();
  });
  clear.hidden = true;
  const wrapper = el(
    'div',
    { class: 'field remote-field', 'data-field': 'partnerPointId' },
    [
      labelNode,
      el('div', { class: 'remote-input' }, [input, clear, icon('search', 17)]),
      el('span', {
        class: 'field-error',
        id: 'field-partnerPointId-error',
        hidden: true,
      }),
    ],
  );
  input.setAttribute('aria-describedby', 'field-partnerPointId-error');
  let selected = null,
    overlay,
    list,
    status,
    footer,
    items = [],
    active = 0,
    page = 1,
    total = 0,
    sequence = 0,
    selecting = false,
    timer;
  function focused(index) {
    active = Math.max(0, Math.min(index, items.length - 1));
    list
      .querySelectorAll('[role=option]')
      .forEach((n, i) => (n.dataset.active = String(i === active)));
    const option = list.children[active];
    if (option) {
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  async function choose(item) {
    if (!item || selecting) return;
    selecting = true;
    input.setAttribute('aria-busy', 'true');
    try {
      await onSelect(item);
      if (!input.isConnected) return;
      setSelected(item);
      overlay?.close(true);
    } catch (error) {
      if (overlay) {
        status.hidden = false;
        status.replaceChildren(el('p', { role: 'alert' }, error.message));
      }
      onError(error);
    } finally {
      selecting = false;
      input.removeAttribute('aria-busy');
    }
  }
  async function query() {
    const version = ++sequence;
    if (!overlay) return;
    status.replaceChildren(
      el('span', { class: 'small-spinner', 'aria-hidden': true }),
      el('span', {}, 'Ищем точки…'),
    );
    status.hidden = false;
    input.setAttribute('aria-busy', 'true');
    list.replaceChildren();
    items = [];
    footer.replaceChildren();
    try {
      const data = await load(
        input.value === selected?.label ? '' : input.value,
        page,
      );
      if (version !== sequence || !overlay) return;
      items = data.items;
      total = data.total;
      active = 0;
      status.hidden = items.length > 0;
      status.replaceChildren(
        el('span', {}, 'По этому названию ничего не найдено.'),
      );
      list.replaceChildren(
        ...items.map((item, index) => {
          const option = el(
            'li',
            {
              class: 'select-option remote-option',
              id: id + '-option-' + index,
              role: 'option',
              'aria-selected': String(item.id === selected?.id),
            },
            [
              el('span', {}, [
                el('strong', {}, item.label),
                item.detail ? el('small', {}, item.detail) : null,
              ]),
              item.id === selected?.id ? icon('check', 16) : null,
            ],
          );
          option.addEventListener('pointerdown', event =>
            event.preventDefault(),
          );
          option.addEventListener('pointermove', () => focused(index));
          option.addEventListener('click', () => void choose(item));
          return option;
        }),
      );
      if (total > data.pageSize) {
        const before = iconButton('Предыдущие варианты', 'back', () => {
            page--;
            void query();
          }),
          after = iconButton('Следующие варианты', 'right', () => {
            page++;
            void query();
          });
        before.disabled = page <= 1;
        after.disabled = page * data.pageSize >= total;
        footer.append(
          el('span', {}, `${page} · ${total} точек`),
          before,
          after,
        );
      }
      focused(0);
      overlay.position();
    } catch (error) {
      if (version !== sequence || !overlay) return;
      status.hidden = false;
      status.replaceChildren(
        el('p', { role: 'alert' }, error.message),
        button('Повторить', () => void query(), 'secondary', 'refresh'),
      );
      onError(error);
    } finally {
      if (version === sequence) input.removeAttribute('aria-busy');
    }
  }
  function open() {
    if (input.disabled || overlay) return;
    const panel = el('div', { class: 'select-popup remote-popup' });
    list = el('ul', {
      role: 'listbox',
      id: id + '-list',
      'aria-label': label,
      class: 'select-options',
    });
    status = el('div', { class: 'popup-status', role: 'status' });
    footer = el('div', { class: 'popup-pagination' });
    panel.append(status, list, footer);
    input.setAttribute('aria-expanded', 'true');
    overlay = popup(input, panel, {
      width: Math.max(input.offsetWidth, 300),
      onClose: () => {
        overlay = null;
        sequence++;
        clearTimeout(timer);
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        input.removeAttribute('aria-busy');
        input.value = selected?.label || '';
      },
    });
    page = 1;
    void query();
  }
  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  input.addEventListener('input', () => {
    if (!overlay) open();
    page = 1;
    clearTimeout(timer);
    timer = setTimeout(() => void query(), 220);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      overlay?.close(false);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (!overlay) {
        open();
        return;
      }
      if (event.key === 'Enter') void choose(items[active]);
      else
        focused(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : optionIndex(
                  active,
                  event.key === 'ArrowDown' ? 1 : -1,
                  items.length,
                ),
        );
    }
  });
  function setSelected(item, preserveQuery = false) {
    const editing =
      preserveQuery && overlay && document.activeElement === input;
    selected = item;
    if (!editing) input.value = item?.label || '';
    clear.hidden = !item;
  }
  return {
    element: wrapper,
    input,
    // A late initial GET must not overwrite a search already being typed.
    setSelected: item => setSelected(item, true),
    close: () => overlay?.close(false),
  };
}

export function dateControl(source, labelId, label) {
  hideSource(source);
  const value = el('span', { class: 'date-value' }),
    trigger = button(
      [value, icon('calendar', 18)],
      null,
      'date-trigger control-trigger',
    );
  trigger.setAttribute('aria-labelledby', labelId);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  let overlay;
  linkControl(source, trigger, () => {
    value.textContent = displayDate(source.value);
    trigger.setAttribute(
      'aria-invalid',
      source.getAttribute('aria-invalid') || 'false',
    );
    if (source.disabled) overlay?.close(false);
  });
  trigger.addEventListener('click', () => {
    if (overlay) {
      overlay.close();
      return;
    }
    const now = new Date(),
      fallback = (() => {
        const zone = source.closest('form')?.dataset.timeZone || 'UTC';
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(now);
        return ['year', 'month', 'day']
          .map(type => parts.find(p => p.type === type).value)
          .join('-');
      })();
    let selected = source.value.split('T')[0] || fallback,
      view = parseDay(selected) || parseDay(fallback);
    let hour = source.value.split('T')[1]?.split(':')[0] || '12',
      minute = source.value.split(':')[1] || '00';
    const panel = el('div', {
        class: 'calendar-popup',
        role: 'dialog',
        'aria-label': label,
      }),
      month = el('strong', { class: 'calendar-month', 'aria-live': 'polite' }),
      grid = el('div', {
        class: 'calendar-grid',
        role: 'grid',
        'aria-label': 'Календарь',
      }),
      manual = el('input', {
        type: 'text',
        inputmode: 'numeric',
        placeholder: 'ДД.ММ.ГГГГ',
        'aria-label': 'Дата',
        class: 'calendar-manual',
      }),
      hours = el('input', {
        type: 'text',
        inputmode: 'numeric',
        maxlength: 2,
        'aria-label': 'Часы',
        class: 'time-input',
      }),
      minutes = el('input', {
        type: 'text',
        inputmode: 'numeric',
        maxlength: 2,
        'aria-label': 'Минуты',
        class: 'time-input',
      }),
      error = el('p', { class: 'field-error', role: 'alert', hidden: true });
    const shift = delta => {
      view = new Date(
        Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + delta, 1),
      );
      paint();
    };
    panel.append(
      el('div', { class: 'calendar-header' }, [
        iconButton('Предыдущий месяц', 'back', () => shift(-1)),
        month,
        iconButton('Следующий месяц', 'right', () => shift(1)),
      ]),
      el(
        'div',
        { class: 'calendar-weekdays', 'aria-hidden': true },
        ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => el('span', {}, d)),
      ),
      grid,
      el('div', { class: 'calendar-shortcuts' }, [
        button('Сегодня', () => chooseDay(fallback), 'text-button'),
        button('Завтра', () => chooseDay(addDays(fallback, 1)), 'text-button'),
      ]),
      el('label', { class: 'picker-date-label' }, [
        el('span', {}, 'Дата'),
        manual,
      ]),
      el('div', { class: 'time-picker' }, [
        el('span', {}, [icon('clock', 16), 'Время']),
        hours,
        el('span', {}, ':'),
        minutes,
      ]),
      error,
      el('div', { class: 'popup-actions' }, [
        button('Отмена', () => overlay.close(), 'secondary'),
        button(
          'Применить',
          () => {
            const key = parseCalendarInput(manual.value),
              result = key && calendarValue(key, hours.value, minutes.value);
            if (!result) {
              error.textContent =
                'Проверьте дату и время: часы 00–23, минуты 00–59.';
              error.hidden = false;
              return;
            }
            source.value = result;
            send(source);
            overlay.close(true);
          },
          'primary',
        ),
      ]),
    );
    function chooseDay(key) {
      selected = key;
      view = parseDay(key);
      manual.value = key.split('-').reverse().join('.');
      paint();
    }
    function paint() {
      month.textContent = new Intl.DateTimeFormat('ru-RU', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(view);
      const cells = monthGrid(view.getUTCFullYear(), view.getUTCMonth());
      grid.replaceChildren(
        ...Array.from({ length: 6 }, (_, row) =>
          el(
            'div',
            { role: 'row' },
            cells.slice(row * 7, row * 7 + 7).map(cell => {
              const day = el(
                'button',
                {
                  type: 'button',
                  class:
                    'calendar-day' + (!cell.inMonth ? ' outside-month' : ''),
                  role: 'gridcell',
                  'aria-label': new Intl.DateTimeFormat('ru-RU', {
                    dateStyle: 'full',
                    timeZone: 'UTC',
                  }).format(parseDay(cell.key)),
                  'aria-selected': String(cell.key === selected),
                  tabindex: cell.key === selected ? '0' : '-1',
                  'data-date': cell.key,
                },
                cell.day,
              );
              day.addEventListener('click', () => chooseDay(cell.key));
              day.addEventListener('keydown', event => {
                const deltas = {
                  ArrowLeft: -1,
                  ArrowRight: 1,
                  ArrowUp: -7,
                  ArrowDown: 7,
                };
                if (
                  event.key in deltas ||
                  ['Home', 'End'].includes(event.key)
                ) {
                  event.preventDefault();
                  const weekday = (parseDay(cell.key).getUTCDay() + 6) % 7;
                  const delta =
                    event.key === 'Home'
                      ? -weekday
                      : event.key === 'End'
                        ? 6 - weekday
                        : deltas[event.key];
                  chooseDay(addDays(cell.key, delta));
                  /** @type {HTMLElement} */ (
                    grid.querySelector(`[data-date="${selected}"]`)
                  )?.focus();
                } else if (event.key === 'PageUp' || event.key === 'PageDown') {
                  event.preventDefault();
                  const date = parseDay(cell.key),
                    delta = event.key === 'PageUp' ? -1 : 1;
                  date.setUTCDate(1);
                  date.setUTCMonth(date.getUTCMonth() + delta);
                  const last = new Date(date);
                  last.setUTCMonth(last.getUTCMonth() + 1, 0);
                  date.setUTCDate(Math.min(cell.day, last.getUTCDate()));
                  chooseDay(date.toISOString().slice(0, 10));
                  /** @type {HTMLElement} */ (
                    grid.querySelector('[tabindex="0"]')
                  )?.focus();
                }
              });
              return day;
            }),
          ),
        ),
      );
      if (!grid.querySelector('[tabindex="0"]'))
        grid.querySelector('[data-date]')?.setAttribute('tabindex', '0');
      overlay?.position();
    }
    manual.value = selected.split('-').reverse().join('.');
    hours.value = hour;
    minutes.value = minute;
    manual.addEventListener('change', () => {
      const key = parseCalendarInput(manual.value);
      if (key) chooseDay(key);
    });
    paint();
    trigger.setAttribute('aria-expanded', 'true');
    overlay = popup(trigger, panel, {
      width: 316,
      trap: true,
      onClose: () => {
        overlay = null;
        trigger.setAttribute('aria-expanded', 'false');
      },
    });
    /** @type {HTMLElement} */ (grid.querySelector('[tabindex="0"]'))?.focus();
  });
  return trigger;
}

export function colorControl(source, labelId, label) {
  hideSource(source);
  const swatch = el('span', { class: 'color-chip' }),
    trigger = button(swatch, null, 'color-trigger control-trigger'),
    hex = el('input', {
      type: 'text',
      name: source.name + '-hex',
      class: 'hex-input',
      maxlength: 7,
      spellcheck: 'false',
      'aria-labelledby': labelId,
      autocomplete: 'off',
    }),
    row = el('div', { class: 'color-control' }, [trigger, hex]);
  trigger.setAttribute('aria-label', 'Выбрать цвет: ' + label);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  let overlay;
  const update = () => {
    swatch.style.backgroundColor = source.value;
    if (document.activeElement !== hex || hexRgb(hex.value))
      hex.value = source.value.toUpperCase();
    hex.disabled = source.disabled;
    trigger.setAttribute(
      'aria-invalid',
      source.getAttribute('aria-invalid') || 'false',
    );
    if (source.disabled) overlay?.close(false);
  };
  hex.addEventListener('input', () => {
    if (hexRgb(hex.value)) {
      delete source.dataset.controlError;
      source.value = hex.value;
      send(source);
      controlError(row.closest('[data-field]'), '');
    } else source.dataset.controlError = 'Укажите цвет в формате #RRGGBB';
  });
  hex.addEventListener('blur', () => {
    if (source.dataset.controlError)
      controlError(row.closest('[data-field]'), source.dataset.controlError);
  });
  source.addEventListener('input', () => {
    delete source.dataset.controlError;
    hex.value = source.value.toUpperCase();
    controlError(row.closest('[data-field]'), '');
  });
  linkControl(source, trigger, update);
  trigger.addEventListener('click', () => {
    if (overlay) {
      overlay.close();
      return;
    }
    let rgb = hexRgb(source.value) || [21, 61, 50];
    const sample = el('div', { class: 'color-sample' }),
      code = el('strong'),
      panel = el('div', {
        class: 'color-popup',
        role: 'dialog',
        'aria-label': 'Выбор цвета: ' + label,
      }),
      sliders = [];
    const paint = () => {
      const color = rgbHex(rgb);
      sample.style.backgroundColor = color;
      code.textContent = color;
      sliders.forEach((slider, i) => {
        slider.value = String(rgb[i]);
        slider.style.setProperty('--range-color', color);
      });
    };
    panel.append(
      el('div', { class: 'picker-title' }, [
        el('h3', {}, label),
        iconButton('Закрыть выбор цвета', 'close', () => overlay.close()),
      ]),
      sample,
      code,
      el(
        'div',
        { class: 'color-presets' },
        ['#153D32', '#286348', '#285C78', '#D91D2D', '#F7F4EA', '#8C4AA8'].map(
          color => {
            const choice = button(
              '',
              () => {
                rgb = hexRgb(color);
                paint();
              },
              'color-swatch',
            );
            choice.setAttribute('aria-label', 'Цвет ' + color);
            choice.style.backgroundColor = color;
            return choice;
          },
        ),
      ),
    );
    ['Красный', 'Зелёный', 'Синий'].forEach((name, i) => {
      const slider = el('input', {
        type: 'range',
        min: 0,
        max: 255,
        value: rgb[i],
        'aria-label': name,
      });
      sliders.push(slider);
      slider.addEventListener('input', () => {
        rgb[i] = Number(slider.value);
        paint();
      });
      panel.append(
        el('label', { class: 'color-channel' }, [el('span', {}, name), slider]),
      );
    });
    panel.append(
      el('div', { class: 'popup-actions' }, [
        button('Отмена', () => overlay.close(), 'secondary'),
        button(
          'Применить',
          () => {
            delete source.dataset.controlError;
            source.value = rgbHex(rgb);
            send(source);
            overlay.close(true);
          },
          'primary',
        ),
      ]),
    );
    paint();
    trigger.setAttribute('aria-expanded', 'true');
    overlay = popup(trigger, panel, {
      width: 292,
      trap: true,
      onClose: () => {
        overlay = null;
        trigger.setAttribute('aria-expanded', 'false');
      },
    });
    panel.querySelector('button').focus();
  });
  return row;
}
export function fileControl(source, labelId) {
  hideSource(source);
  const filename = el('span', { class: 'file-name' }, 'Файл не выбран'),
    trigger = button(
      'Выбрать файл',
      () => source.click(),
      'secondary control-trigger',
      'image',
    ),
    zone = el('div', { class: 'file-control' }, [trigger, filename]);
  trigger.setAttribute('aria-describedby', labelId);
  const sync = () => {
    filename.textContent = source.files?.[0]?.name || 'Файл не выбран';
    filename.dataset.tooltip = filename.textContent;
    filename.tabIndex = source.files?.length ? 0 : -1;
    zone.classList.toggle('has-file', Boolean(source.files?.length));
  };
  linkControl(source, trigger, sync);
  return zone;
}
