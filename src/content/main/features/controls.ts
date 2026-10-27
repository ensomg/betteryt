import { svgIcon } from '../../../shared/dom';
import { STRINGS } from '../../../shared/strings';
import {
  keyCombo,
  normalizeBinding,
  type ControlButton,
  type ShortcutAction,
} from '../../../shared/player-options';
import { registry, type Feature } from '../../features/registry';
import { ctx, runAction } from '../context';
import { getVideo, isTyping, isWatchPage, onNewVideo } from '../player';
import { abState } from './tools';
import { currentRate } from './playback';

/**
 * Custom control-bar buttons (in the user's order) inside YouTube's right controls, and the
 * rebindable keyboard shortcuts. Buttons reuse YouTube's .ytp-button class so they look native.
 */

const ID = 'controls';
const T = STRINGS.playerUi;
const MARK = 'data-betteryt-btn';

const ICONS: Readonly<Record<Exclude<ControlButton, 'speed' | 'boost'>, string>> = {
  screenshot:
    'M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 4.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  loop: 'M7 7h10v3l4-4-4-4v3H5v6h2V7Zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4Z',
  ab: 'M4 18 8.5 6h2L15 18h-2.2l-1-3H7.2l-1 3H4Zm3.9-5h3.2L9.5 8.6 7.9 13ZM16 6h3.5a2.8 2.8 0 0 1 1.7 5 3 3 0 0 1-1.7 5.5V18H16V6Zm2 2v3h1.4a1.5 1.5 0 0 0 0-3H18Zm0 5v3h1.6a1.5 1.5 0 0 0 0-3H18Z',
  pip: 'M19 7h-8v6h8V7Zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H3V5h18v14Z',
  popup:
    'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7ZM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7Z',
  stats: 'M3 13h2v8H3v-8Zm4-6h2v14H7V7Zm4 3h2v11h-2V10Zm4-7h2v18h-2V3Zm4 9h2v9h-2v-9Z',
  cinema: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2v14a7 7 0 0 1 0-14Z',
};

const ACTION_FOR: Readonly<Record<ControlButton, string>> = {
  speed: 'speedReset',
  screenshot: 'screenshot',
  loop: 'loop',
  ab: 'abRepeat',
  pip: 'pip',
  popup: 'popup',
  boost: 'boost',
  stats: 'stats',
  cinema: 'cinema',
};

const off: Array<() => void> = [];

function label(btn: ControlButton): string {
  return T.buttons[btn];
}

function buildButton(kind: ControlButton): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ytp-button betteryt-ctrl';
  b.setAttribute(MARK, kind);
  b.setAttribute('aria-label', label(kind));
  b.title = label(kind);
  if (kind === 'speed' || kind === 'boost') {
    b.classList.add('betteryt-ctrl--text');
  } else {
    b.append(svgIcon(ICONS[kind], 24));
  }
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    runAction(ACTION_FOR[kind]);
    refresh();
  });
  return b;
}

/** Updates labels / pressed states without rebuilding. */
function refresh(): void {
  const v = getVideo();
  for (const b of document.querySelectorAll<HTMLButtonElement>(`[${MARK}]`)) {
    const kind = b.getAttribute(MARK) as ControlButton;
    if (kind === 'speed') {
      const txt = `${currentRate()}×`;
      if (b.textContent !== txt) b.textContent = txt;
    } else if (kind === 'boost') {
      const txt = `${ctx.settings.player.boost}%`;
      if (b.textContent !== txt) b.textContent = txt;
      b.setAttribute('aria-pressed', String(ctx.settings.player.boost > 100));
    } else if (kind === 'loop') b.setAttribute('aria-pressed', String(!!v?.loop));
    else if (kind === 'ab') b.dataset.state = abState();
  }
}

function ensureButtons(): void {
  // Newer players split the right controls into -left / -right groups; ours go first in -left.
  const host =
    document.querySelector<HTMLElement>('#movie_player .ytp-right-controls-left') ??
    document.querySelector<HTMLElement>('#movie_player .ytp-right-controls');
  if (!host || !isWatchPage()) return;
  const want = ctx.settings.player.buttons;
  const existing = [...host.querySelectorAll<HTMLButtonElement>(`:scope > [${MARK}]`)];
  const current = existing.map((b) => b.getAttribute(MARK));
  if (current.join() !== want.join()) {
    existing.forEach((b) => b.remove());
    // Before YouTube's own buttons, in the user's order.
    host.prepend(...want.map(buildButton));
  }
  refresh();
}

/* ---------- Keyboard shortcuts ---------- */

function bindings(): Map<string, ShortcutAction> {
  const map = new Map<string, ShortcutAction>();
  for (const [action, combo] of Object.entries(ctx.settings.player.shortcuts) as Array<
    [ShortcutAction, string]
  >) {
    const b = normalizeBinding(combo);
    if (b) map.set(b, action);
  }
  return map;
}

function onKey(e: KeyboardEvent): void {
  if (!ctx.settings.player.shortcutsEnabled || !isWatchPage()) return;
  if (isTyping(e.target) || isTyping(document.activeElement)) return;
  const combo = keyCombo(e);
  if (!combo) return;
  const action = bindings().get(normalizeBinding(combo));
  if (!action) return;
  // Holding a key only repeats speed changes; toggles fire once.
  if (e.repeat && !action.startsWith('speed')) return;
  if (runAction(action)) {
    // Keep YouTube from also acting on the same key.
    e.preventDefault();
    e.stopImmediatePropagation();
    refresh();
  }
}

export const controls: Feature = {
  id: ID,
  enabled: (s) => s.player.enabled,
  init() {
    const ensure = registry.guard(ID, ensureButtons);
    off.push(
      onNewVideo(
        registry.guard(ID, ({ video }) => {
          ensureButtons();
          video.addEventListener('ratechange', refresh);
        }),
      ),
    );
    document.addEventListener('yt-navigate-finish', ensure);
    document.addEventListener('betteryt-controls-refresh', refresh);
    const key = registry.guard(ID, onKey);
    // Capture phase on window: runs before YouTube's own document-level hotkey handler.
    window.addEventListener('keydown', key, true);
    off.push(() => {
      document.removeEventListener('yt-navigate-finish', ensure);
      document.removeEventListener('betteryt-controls-refresh', refresh);
      window.removeEventListener('keydown', key, true);
      getVideo()?.removeEventListener('ratechange', refresh);
    });
    ensureButtons();
  },
  update() {
    ensureButtons();
  },
  destroy() {
    for (const f of off.splice(0)) f();
    document.querySelectorAll(`[${MARK}]`).forEach((b) => b.remove());
  },
};
