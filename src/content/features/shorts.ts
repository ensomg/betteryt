import type { Settings } from '../../shared/settings-schema';
import { STRINGS } from '../../shared/strings';
import { h, svgIcon } from '../../shared/dom';
import { isTyping } from '../main/player';
import { onNavigate } from '../nav';
import { showToast } from '../ui/toast';
import { registry, type Feature } from './registry';

/**
 * Shorts, two modes:
 *  - hide: granular html[by-shorts-hide-*] attributes (css/shorts.css) + optional redirect;
 *  - improved: layers on top of YouTube's own Shorts player (never removes its elements): extra
 *    controls (speed, loop, Picture-in-Picture, open in normal player), auto-advance, keyboard
 *    (J/K next/previous, ←/→ seek, L like, C comments), wheel debounce against trackpad inertia.
 * Redirect works in either mode.
 */

const ID = 'shorts';
const T = STRINGS.shortsUi;
const root = document.documentElement;
const HIDE_KEYS = [
  'hideHome',
  'hideSearch',
  'hideSubscriptions',
  'hideChannel',
  'hideChannelTab',
  'hideWatch',
  'hideGuide',
] as const;
const SPEEDS = [1, 1.25, 1.5, 2, 3, 0.25, 0.5, 0.75];

const ICON = {
  loop: 'M7 7h10v3l4-4-4-4v3H5v6h2V7Zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4Z',
  pip: 'M19 7h-8v6h8V7Zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H3V5h18v14Z',
  open: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7ZM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7Z',
};

let settings: Settings | null = null;
let offNav: (() => void) | null = null;
let observer: MutationObserver | null = null;
let boundVideo: HTMLVideoElement | null = null;
let wheelLockUntil = 0;
let wheelAccum = 0;

const isShorts = (): boolean => location.pathname.startsWith('/shorts/');
const shortId = (): string | null => /^\/shorts\/([\w-]{11})/.exec(location.pathname)?.[1] ?? null;

function shortsVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('#shorts-player video, ytd-shorts video.html5-main-video');
}

/* ---------- Mode attributes & redirect ---------- */

function applyAttributes(s: Settings): void {
  const hide = s.shorts.mode === 'hide';
  for (const k of HIDE_KEYS) {
    root.toggleAttribute(
      `by-shorts-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
      hide && s.shorts[k],
    );
  }
  const improved = s.shorts.mode === 'improved';
  root.toggleAttribute('by-shorts-improved', improved);
  root.toggleAttribute('by-shorts-no-arrows', improved && !s.shorts.arrows);
}

function maybeRedirect(): boolean {
  const id = shortId();
  if (!settings?.shorts.redirect || !id) return false;
  location.replace(`/watch?v=${id}`);
  return true;
}

/* ---------- Navigation helpers ---------- */

function go(dir: 1 | -1): void {
  const id = dir === 1 ? '#navigation-button-down' : '#navigation-button-up';
  // Query the inner button on its own: a combined "X button, X" selector would return the
  // outer wrapper first (document order), and clicking that does nothing.
  const btn =
    document.querySelector<HTMLElement>(`${id} ytd-button-renderer button`) ??
    document.querySelector<HTMLElement>(`${id} button`);
  if (btn) {
    btn.click();
    return;
  }
  // Fallback: YouTube's own arrow-key navigation (scrolling the container does not navigate).
  const key = dir === 1 ? 'ArrowDown' : 'ArrowUp';
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, code: key, keyCode: dir === 1 ? 40 : 38, bubbles: true }),
  );
}

function clickAction(match: (b: HTMLElement) => boolean): boolean {
  const bar = document.querySelector('ytd-shorts reel-action-bar-view-model, ytd-shorts #actions');
  const btn = [...(bar?.querySelectorAll<HTMLElement>('button') ?? [])].find(match);
  btn?.click();
  return !!btn;
}

/* ---------- Extra controls ---------- */

function controlsHost(): HTMLElement | null {
  // Right-hand group of YouTube's desktop Shorts controls (captions, more, fullscreen).
  return (
    document.querySelector<HTMLElement>('ytd-shorts-player-controls .ytdShortsPlayerControlsRightControls') ??
    document.querySelector<HTMLElement>('ytd-shorts-player-controls [class*="RightControls"]') ??
    document.querySelector<HTMLElement>('ytd-shorts-player-controls')
  );
}

function button(kind: string, label: string, icon: string | null, onClick: () => void): HTMLButtonElement {
  const b = h('button', {
    type: 'button',
    class: 'betteryt-shorts-btn',
    'data-betteryt-shorts': kind,
    'aria-label': label,
    title: label,
  });
  if (icon) b.append(svgIcon(icon, 22));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
    syncControls();
  });
  return b;
}

function syncControls(): void {
  const v = shortsVideo();
  const speed = document.querySelector<HTMLElement>('[data-betteryt-shorts="speed"]');
  if (speed && v) speed.textContent = `${v.playbackRate}×`;
  document.querySelector('[data-betteryt-shorts="loop"]')?.setAttribute('aria-pressed', String(!!v?.loop));
}

function ensureControls(): void {
  const s = settings;
  const host = controlsHost();
  const existing = document.querySelector('[data-betteryt-ui="shorts-controls"]');
  if (!s || s.shorts.mode !== 'improved' || !s.shorts.extraControls || !isShorts() || !host) {
    existing?.remove();
    return;
  }
  if (existing && host.contains(existing)) {
    syncControls();
    return;
  }
  existing?.remove();
  const speed = button('speed', T.speed, null, () => {
    const v = shortsVideo();
    if (!v) return;
    const i = SPEEDS.indexOf(v.playbackRate);
    v.playbackRate = SPEEDS[(i + 1) % SPEEDS.length]!;
  });
  speed.classList.add('betteryt-shorts-btn--text');
  speed.addEventListener('wheel', (e) => {
    const v = shortsVideo();
    if (!v) return;
    e.preventDefault();
    e.stopPropagation();
    v.playbackRate = Math.min(
      3,
      Math.max(0.25, Math.round((v.playbackRate + (e.deltaY < 0 ? 0.25 : -0.25)) * 100) / 100),
    );
    syncControls();
  });
  const box = h(
    'div',
    { class: 'betteryt-shorts-controls', 'data-betteryt-ui': 'shorts-controls' },
    speed,
    button('loop', T.loop, ICON.loop, () => {
      const v = shortsVideo();
      if (!v) return;
      v.loop = !v.loop;
      showToast(v.loop ? T.loopOn : T.loopOff, { duration: 1500 });
    }),
    button('pip', T.pip, ICON.pip, () => {
      const v = shortsVideo();
      if (!v) return;
      const p = document.pictureInPictureElement
        ? document.exitPictureInPicture()
        : v.requestPictureInPicture();
      void p.catch(() => showToast(STRINGS.playerUi.pipUnavailable));
    }),
    button('open', T.openNormal, ICON.open, () => {
      const id = shortId();
      if (!id) return;
      const t = Math.floor(shortsVideo()?.currentTime ?? 0);
      shortsVideo()?.pause();
      location.href = `/watch?v=${id}${t > 1 ? `&t=${t}s` : ''}`;
    }),
  );
  host.prepend(box);
  syncControls();
}

/* ---------- Auto-advance ---------- */

function onEnded(): void {
  if (settings?.shorts.mode === 'improved' && settings.shorts.autoAdvance && isShorts()) go(1);
}

function onPlay(): void {
  // YouTube loops Shorts by default; auto-advance needs the "ended" event.
  const v = boundVideo;
  if (v && settings?.shorts.mode === 'improved' && settings.shorts.autoAdvance) v.loop = false;
  syncControls();
}

function bindVideo(): void {
  const v = shortsVideo();
  if (v === boundVideo) return;
  boundVideo?.removeEventListener('ended', onEnded);
  boundVideo?.removeEventListener('play', onPlay);
  boundVideo?.removeEventListener('ratechange', syncControls);
  boundVideo = v;
  v?.addEventListener('ended', onEnded);
  v?.addEventListener('play', onPlay);
  v?.addEventListener('ratechange', syncControls);
  if (v && !v.paused) onPlay();
}

/* ---------- Keyboard & wheel ---------- */

function onKey(e: KeyboardEvent): void {
  const s = settings;
  if (!s || s.shorts.mode !== 'improved' || !s.shorts.keys || !isShorts()) return;
  if (isTyping(e.target) || isTyping(document.activeElement) || e.ctrlKey || e.altKey || e.metaKey) return;
  const v = shortsVideo();
  let handled = true;
  switch (e.key) {
    case 'j':
    case 'J':
      go(1);
      break;
    case 'k':
    case 'K':
      go(-1);
      break;
    case 'ArrowLeft':
      if (v) v.currentTime = Math.max(0, v.currentTime - 5);
      break;
    case 'ArrowRight':
      if (v) v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 5);
      break;
    case 'l':
    case 'L':
      handled = clickAction((b) => b.closest('like-button-view-model') !== null);
      break;
    case 'c':
    case 'C':
      handled = clickAction(
        (b) => /comment/i.test(b.getAttribute('aria-label') ?? '') || b.closest('[id*="comments"]') !== null,
      );
      break;
    default:
      handled = false;
  }
  if (handled) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

/**
 * One wheel gesture = one Short. Trackpads emit a long tail of inertial events; after a
 * navigation we ignore wheel input until it has been quiet for 300 ms.
 */
function onWheel(e: WheelEvent): void {
  const s = settings;
  if (!s || s.shorts.mode !== 'improved' || !s.shorts.wheelDebounce || !isShorts()) return;
  const target = e.target as Element;
  // Leave scrolling alone in the comments / description panels.
  if (target.closest('ytd-engagement-panel-section-list-renderer, #comments, [data-betteryt-shorts="speed"]'))
    return;
  if (!target.closest('ytd-shorts')) return;
  e.preventDefault();
  e.stopPropagation();
  const now = performance.now();
  if (now < wheelLockUntil) {
    wheelLockUntil = now + 300;
    return;
  }
  wheelAccum += e.deltaY;
  if (Math.abs(wheelAccum) < 40) return;
  go(wheelAccum > 0 ? 1 : -1);
  wheelAccum = 0;
  wheelLockUntil = now + 300;
}

/* ---------- Lifecycle ---------- */

const onPage = registry.guard(ID, () => {
  if (maybeRedirect()) return;
  bindVideo();
  ensureControls();
  observeShorts();
});

function observeShorts(): void {
  const host = document.querySelector('ytd-shorts');
  if (!host || observer) return;
  // The Shorts player swaps its video/controls per Short; re-attach when that happens.
  observer = new MutationObserver(
    registry.guard(ID, (records) => {
      if (
        records.every((r) =>
          [...r.addedNodes].every(
            (n) => n instanceof HTMLElement && n.dataset.betterytUi === 'shorts-controls',
          ),
        )
      )
        return;
      bindVideo();
      ensureControls();
    }),
  );
  observer.observe(host, { childList: true, subtree: true });
}

const key = registry.guard(ID, onKey);
const wheel = registry.guard(ID, onWheel);

export const shorts: Feature = {
  id: ID,
  enabled: (s) => s.shorts.mode !== 'default' || s.shorts.redirect,
  init(s) {
    settings = s;
    applyAttributes(s);
    offNav = onNavigate(onPage);
    window.addEventListener('keydown', key, true);
    window.addEventListener('wheel', wheel, { capture: true, passive: false });
    onPage();
  },
  update(s) {
    settings = s;
    applyAttributes(s);
    onPage();
  },
  destroy() {
    settings = null;
    offNav?.();
    offNav = null;
    observer?.disconnect();
    observer = null;
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('wheel', wheel, { capture: true });
    boundVideo?.removeEventListener('ended', onEnded);
    boundVideo?.removeEventListener('play', onPlay);
    boundVideo?.removeEventListener('ratechange', syncControls);
    boundVideo = null;
    for (const a of root.getAttributeNames()) if (a.startsWith('by-shorts-')) root.removeAttribute(a);
    document.querySelector('[data-betteryt-ui="shorts-controls"]')?.remove();
  },
};
