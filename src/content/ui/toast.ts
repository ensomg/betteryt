import { h } from '../../shared/dom';
import { animate, SPRING } from '../../shared/motion';

/** Small bottom-left toast with an optional action (e.g. Undo). One at a time; newer replaces older. */

interface ToastOptions {
  action?: { label: string; run: () => void };
  /** ms; default 5000. */
  duration?: number;
}

let current: { el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;

function dismiss(): void {
  if (!current) return;
  const { el, timer } = current;
  clearTimeout(timer);
  current = null;
  const anim = animate(
    el,
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateY(8px)' },
    ],
    'fast',
  );
  if (anim) {
    anim.addEventListener('finish', () => el.remove());
    anim.addEventListener('cancel', () => el.remove());
  } else el.remove();
}

export function showToast(message: string, opts: ToastOptions = {}): void {
  if (current) {
    clearTimeout(current.timer);
    current.el.remove();
    current = null;
  }
  const el = h(
    'div',
    { class: 'betteryt-toast', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'betteryt-toast__text' }, message),
  );
  if (opts.action) {
    const { label, run } = opts.action;
    el.append(
      h(
        'button',
        {
          type: 'button',
          class: 'betteryt-toast__action',
          onclick: () => {
            run();
            dismiss();
          },
        },
        label,
      ),
    );
  }
  document.body.append(el);
  animate(
    el,
    [
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'none' },
    ],
    'base',
    SPRING,
  );
  current = { el, timer: setTimeout(dismiss, opts.duration ?? 5000) };
}

export function destroyToasts(): void {
  if (current) {
    clearTimeout(current.timer);
    current.el.remove();
    current = null;
  }
}
