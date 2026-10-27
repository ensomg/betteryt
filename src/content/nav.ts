/** YouTube SPA navigation helpers. No polling: everything is event- or observer-driven. */

const NAV_EVENTS = ['yt-navigate-finish', 'yt-page-data-updated'] as const;

/** Calls `cb` after every SPA navigation / page-data refresh. Returns an unsubscribe fn. */
export function onNavigate(cb: () => void): () => void {
  for (const ev of NAV_EVENTS) document.addEventListener(ev, cb);
  return () => {
    for (const ev of NAV_EVENTS) document.removeEventListener(ev, cb);
  };
}

/**
 * Resolves with the first element matching `selector` under `root`, observing only childList
 * changes, and disconnects as soon as it is found. Rejects after `timeoutMs` (0 = never).
 */
export function waitFor<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode & Node = document.documentElement,
  timeoutMs = 0,
): { promise: Promise<E>; cancel: () => void } {
  let cancel = (): void => undefined;
  const promise = new Promise<E>((resolve, reject) => {
    const existing = root.querySelector<E>(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver(() => {
      const el = root.querySelector<E>(selector);
      if (el) {
        cleanup();
        resolve(el);
      }
    });
    const cleanup = (): void => {
      mo.disconnect();
      if (timer) clearTimeout(timer);
    };
    cancel = () => {
      cleanup();
      reject(new Error('cancelled'));
    };
    mo.observe(root, { childList: true, subtree: true });
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timeout waiting for ${selector}`));
      }, timeoutMs);
    }
  });
  // Avoid unhandled-rejection noise when callers cancel without awaiting.
  promise.catch(() => undefined);
  return { promise, cancel: () => cancel() };
}

/** Coalesces bursts of calls into one per animation frame. */
export function rafThrottle(fn: () => void): { schedule: () => void; cancel: () => void } {
  let id = 0;
  return {
    schedule() {
      if (id) return;
      id = requestAnimationFrame(() => {
        id = 0;
        fn();
      });
    },
    cancel() {
      if (id) cancelAnimationFrame(id);
      id = 0;
    },
  };
}
