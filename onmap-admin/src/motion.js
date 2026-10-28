export const reducedMotion = () =>
  typeof window === 'undefined' ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const motionDuration = (kind = 'control') =>
  ({ control: 150, panel: 180, dialog: 220 })[kind] ?? 150;
/** Animations are called on explicit transitions, never by preview text updates. */
export function enter(node, kind = 'panel') {
  if (!node || reducedMotion() || !node.animate) return;
  node.animate(
    [
      { opacity: 0, transform: `translateY(${kind === 'dialog' ? 7 : 4}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: motionDuration(kind), easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
}
export async function exit(node, kind = 'panel') {
  if (!node || reducedMotion() || !node.animate) return;
  const animation = node.animate(
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(4px)' },
    ],
    {
      duration: motionDuration(kind),
      easing: 'cubic-bezier(.4,0,1,1)',
      fill: 'forwards',
    },
  );
  await animation.finished.catch(() => {});
}
export function move(node, offset) {
  if (!offset || reducedMotion() || !node.animate) return;
  node.animate(
    [{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }],
    { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
}
