import { el, icon, button, iconButton } from './dom.js';
export { el, icon, button, iconButton } from './dom.js';
import {
  selectControl,
  dateControl,
  colorControl,
  fileControl,
} from './controls.js';
import { closePopups, lockBackground, dismissNotice } from './overlays.js';
import { enter, exit } from './motion.js';
export { setupTooltips, enhanceMenu } from './overlays.js';
export {
  remoteCombobox,
  syncControls,
  controlErrors,
  controlError,
} from './controls.js';
export function notify(message, kind = 'success') {
  const node = el(
    'div',
    { class: 'toast ' + kind, role: kind === 'error' ? 'alert' : 'status' },
    [icon(kind === 'error' ? 'warning' : 'check'), el('span', {}, message)],
  );
  const close = iconButton(
    'Закрыть уведомление',
    'close',
    () => void dismissNotice(node),
  );
  node.append(close);
  document.getElementById('notifications').replaceChildren(node);
  enter(node);
  setTimeout(() => void dismissNotice(node), kind === 'error' ? 7000 : 4000);
}

let modalOpen = false;
/** Native dialog element supplies modal focus containment; this is app-owned UI. */
export function confirmDialog({
  title,
  text,
  confirm = 'Подтвердить',
  cancel = 'Отмена',
  danger = false,
}) {
  if (modalOpen) return Promise.resolve(false);
  modalOpen = true;
  closePopups();
  return new Promise(resolve => {
    const unlock = lockBackground();
    const previous = document.activeElement;
    const dialog = el('dialog', {
      class: 'dialog',
      'aria-labelledby': 'confirmation-title',
      'aria-describedby': 'confirmation-copy',
    });
    const cancelButton = button(cancel, () => done(false), 'secondary');
    const confirmButton = button(
      confirm,
      () => done(true),
      danger ? 'danger-fill' : 'primary',
    );
    let settled = false;
    async function done(value) {
      if (settled) return;
      settled = true;
      dialog.dataset.state = 'closing';
      dialog.setAttribute('aria-busy', 'true');
      await exit(dialog, 'dialog');
      document.removeEventListener('keydown', trap, true);
      dialog.close();
      dialog.remove();
      unlock();
      modalOpen = false;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
      resolve(value);
    }
    function trap(event) {
      if (event.key !== 'Tab') return;
      const controls = [
        ...dialog.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
        ),
      ].map(node => /** @type {HTMLElement} */ (node));
      const first = controls[0],
        last = controls.at(-1),
        active = /** @type {HTMLElement} */ (document.activeElement);
      if (!controls.includes(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', trap, true);
    dialog.append(
      el('div', { class: 'dialog-heading' }, [
        el('h2', { id: 'confirmation-title' }, title),
        iconButton('Закрыть диалог', 'close', () => done(false)),
      ]),
      el('p', { class: 'dialog-copy', id: 'confirmation-copy' }, text),
      el('div', { class: 'dialog-actions' }, [cancelButton, confirmButton]),
    );
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      done(false);
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          done(false);
      }
    });
    document.body.append(dialog);
    dialog.showModal();
    enter(dialog, 'dialog');
    cancelButton.focus();
  });
}

/** @param {string} name @param {string} label @param {any} [value]
 * @param {{type?:string,required?:boolean,maxLength?:number,hint?:string,rows?:number}} [options] */
export function field(
  name,
  label,
  value = '',
  { type = 'text', required = false, maxLength, hint, rows } = {},
) {
  const id = 'field-' + name;
  const input =
    type === 'textarea'
      ? el('textarea', { id, name, rows: rows ?? 3 })
      : el('input', { id, name, type });
  input.value = String(value ?? '');
  input.required = required;
  if (maxLength) input.maxLength = maxLength;
  const error = el('span', {
    id: id + '-error',
    class: 'field-error',
    hidden: true,
  });
  input.setAttribute('aria-labelledby', id + '-label');
  input.setAttribute(
    'aria-describedby',
    id + '-error' + (hint ? ' ' + id + '-hint' : ''),
  );
  const wrap = el('div', { class: 'field', 'data-field': name }, [
    el('span', { class: 'field-label', id: id + '-label' }, label),
    input,
    hint ? el('small', { id: id + '-hint', class: 'field-hint' }, hint) : null,
    error,
  ]);
  const custom =
    type === 'datetime-local'
      ? dateControl(input, id + '-label', label)
      : type === 'color'
        ? colorControl(input, id + '-label', label)
        : type === 'file'
          ? fileControl(input, id + '-label')
          : null;
  if (custom) input.after(custom);
  if (type === 'number') {
    input.inputMode = 'decimal';
    input.classList.add('number-control');
  }
  if (type === 'textarea' && maxLength) {
    const count = el(
      'span',
      { class: 'character-count' },
      `${input.value.length} / ${maxLength}`,
    );
    input.addEventListener(
      'input',
      () => (count.textContent = `${input.value.length} / ${maxLength}`),
    );
    wrap.append(count);
  }
  return wrap;
}
export function selectField(name, label, options, value = '') {
  const select = el('select', { name, id: 'field-' + name });
  for (const [key, text] of options)
    select.append(el('option', { value: key }, text));
  select.value = value;
  const trigger = selectControl(select, 'field-' + name + '-label', label);
  trigger.setAttribute('aria-describedby', 'field-' + name + '-error');
  return el('div', { class: 'field', 'data-field': name }, [
    el('span', { class: 'field-label', id: 'field-' + name + '-label' }, label),
    select,
    trigger,
    el('span', {
      id: 'field-' + name + '-error',
      class: 'field-error',
      hidden: true,
    }),
  ]);
}
export function showFieldErrors(form, errors) {
  for (const wrapper of form.querySelectorAll('[data-field]')) {
    const name = wrapper.getAttribute('data-field');
    const message = errors[name];
    const control = wrapper.querySelector(
      '[role=combobox],.control-trigger,input:not([hidden]),textarea,select',
    );
    control?.setAttribute('aria-invalid', String(Boolean(message)));
    const text = wrapper.querySelector('.field-error');
    if (text) {
      text.textContent = message ?? '';
      text.hidden = !message;
    }
  }
  if (Object.keys(errors).length)
    form.querySelector('[aria-invalid=true]')?.focus();
}
