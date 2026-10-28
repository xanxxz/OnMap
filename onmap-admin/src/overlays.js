import { el } from './dom.js';
import { enter, exit } from './motion.js';
import { popupRect } from './control-model.js';
let popupClose = null;
export function closePopups() {
  popupClose?.(false);
  document.dispatchEvent(new Event('onmap:hide-tooltip'));
}
export function popup(
  anchor,
  panel,
  { width = 280, onClose = () => {}, trap = false } = {},
) {
  closePopups();
  let closed = false;
  // Menus are reused after exit; remove the previous animation and inert state.
  panel.getAnimations().forEach(animation => animation.cancel());
  panel.inert = false;
  delete panel.dataset.state;
  panel.classList.add('ui-popup');
  panel.style.visibility = 'hidden';
  document.body.append(panel);
  function position() {
    if (!anchor.isConnected) {
      close(false);
      return;
    }
    const r = popupRect(
      anchor.getBoundingClientRect(),
      { width, height: Math.min(panel.scrollHeight || 320, 520) },
      { width: innerWidth, height: innerHeight },
    );
    panel.style.left = r.left + 'px';
    panel.style.top = r.top + 'px';
    panel.style.width = r.width + 'px';
    panel.style.maxHeight = r.height + 'px';
    panel.dataset.direction = r.up ? 'up' : 'down';
  }
  // Set width before measuring wrapping and clipping.
  panel.style.width = Math.min(width, innerWidth - 24) + 'px';
  position();
  panel.style.visibility = '';
  enter(panel);
  function close(restore = true, immediate = false) {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('focusin', focus, true);
    document.removeEventListener('keydown', keyboard, true);
    document.removeEventListener('scroll', scroll, true);
    window.removeEventListener('resize', position);
    document.removeEventListener('onmap:page-change', pageChange);
    observer.disconnect();
    if (popupClose === close) popupClose = null;
    anchor.setAttribute('aria-expanded', 'false');
    const remove = () => {
      panel.remove();
      onClose();
    };
    panel.dataset.state = 'closing';
    panel.inert = true;
    if (immediate) remove();
    else void exit(panel).then(remove);
    if (restore && anchor.isConnected) anchor.focus({ preventScroll: true });
  }
  function outside(event) {
    if (!panel.contains(event.target) && !anchor.contains(event.target))
      close(false);
  }
  function focus(event) {
    if (
      !trap &&
      !panel.contains(event.target) &&
      !anchor.contains(event.target)
    )
      close(false);
  }
  function keyboard(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab' && trap) {
      const controls = [
        ...panel.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),[tabindex="0"]',
        ),
      ];
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  function scroll(event) {
    if (panel.contains(event.target)) return;
    const r = anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) close(false);
    else position();
  }
  function pageChange() {
    close(false, true);
  }
  const observer = new MutationObserver(() => {
    if (!anchor.isConnected) close(false);
  });
  observer.observe(document.body, { subtree: true, childList: true });
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('focusin', focus, true);
  document.addEventListener('keydown', keyboard, true);
  document.addEventListener('scroll', scroll, true);
  window.addEventListener('resize', position);
  document.addEventListener('onmap:page-change', pageChange);
  popupClose = close;
  return { close, position, panel };
}
export function lockBackground() {
  const root = document.documentElement,
    previous = root.style.overflow;
  root.style.overflow = 'hidden';
  return () => {
    root.style.overflow = previous;
  };
}
export function enhanceMenu(details) {
  const trigger = details.querySelector('summary'),
    menu = details.querySelector('.menu-popover');
  if (!trigger || !menu) return;
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  menu.setAttribute('role', 'menu');
  let overlay,
    restoring = false;
  const buttons = () => [...menu.querySelectorAll('button:not([disabled])')];
  for (const b of menu.querySelectorAll('button')) {
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;
  }
  function close() {
    if (restoring) return;
    restoring = true;
    overlay = null;
    details.open = false;
    trigger.setAttribute('aria-expanded', 'false');
    details.append(menu);
    restoring = false;
  }
  function open(focusIndex) {
    if (overlay) return;
    details.open = true;
    trigger.setAttribute('aria-expanded', 'true');
    overlay = popup(trigger, menu, { width: 240, onClose: close });
    if (focusIndex !== undefined) buttons().at(focusIndex)?.focus();
  }
  trigger.addEventListener('click', event => {
    event.preventDefault();
    if (overlay) overlay.close();
    else open();
  });
  trigger.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      open(event.key === 'ArrowUp' ? -1 : 0);
    }
  });
  menu.addEventListener('keydown', event => {
    const list = buttons(),
      index = list.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      list[
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? list.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) %
              list.length
      ]?.focus();
    }
    if (event.key === 'Tab') overlay?.close(false);
  });
  menu.addEventListener('click', event => {
    if (event.target.closest('button')) overlay?.close(false);
  });
  new MutationObserver(() => {
    if (!details.open && overlay) overlay.close(false);
  }).observe(details, { attributes: true, attributeFilter: ['open'] });
}
let tooltipReady = false;
export function setupTooltips() {
  if (tooltipReady) return;
  tooltipReady = true;
  let timer, tip, target;
  function hide() {
    clearTimeout(timer);
    if (tip) {
      const id = tip.id;
      if (target) {
        const described = (target.getAttribute('aria-describedby') || '')
          .split(' ')
          .filter(v => v && v !== id);
        if (described.length)
          target.setAttribute('aria-describedby', described.join(' '));
        else target.removeAttribute('aria-describedby');
      }
      tip.remove();
    }
    tip = null;
    target = null;
  }
  function show(node) {
    hide();
    if (!node || node.disabled) return;
    target = node;
    timer = setTimeout(() => {
      if (!node.isConnected) return;
      tip = el(
        'div',
        {
          class: 'tooltip',
          role: 'tooltip',
          id: 'tooltip-' + crypto.randomUUID(),
        },
        node.dataset.tooltip,
      );
      document.body.append(tip);
      const r = node.getBoundingClientRect();
      tip.style.left =
        Math.max(
          8,
          Math.min(
            r.left + r.width / 2 - tip.offsetWidth / 2,
            innerWidth - tip.offsetWidth - 8,
          ),
        ) + 'px';
      tip.style.top =
        (r.top > tip.offsetHeight + 16
          ? r.top - tip.offsetHeight - 8
          : r.bottom + 8) + 'px';
      node.setAttribute(
        'aria-describedby',
        ((node.getAttribute('aria-describedby') || '') + ' ' + tip.id).trim(),
      );
      enter(tip, 'control');
    }, 400);
  }
  document.addEventListener('pointerover', event => {
    const node =
      event.target instanceof Element
        ? event.target.closest('[data-tooltip]')
        : null;
    if (node && node !== target) show(node);
  });
  document.addEventListener('pointerout', event => {
    if (target && !target.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('focusin', event =>
    show(
      event.target instanceof Element
        ? event.target.closest('[data-tooltip]')
        : null,
    ),
  );
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
  });
  document.addEventListener('onmap:page-change', hide);
  document.addEventListener('onmap:hide-tooltip', hide);
}
export async function dismissNotice(node) {
  if (!node.isConnected) return;
  await exit(node);
  node.remove();
}
