import type { Settings } from '../../shared/settings-schema';
import { STRINGS } from '../../shared/strings';
import { h } from '../../shared/dom';
import { sendMessage } from '../../shared/messages';
import { formatCount, type Votes } from '../../shared/sponsorblock';
import { onNavigate, rafThrottle } from '../nav';
import { registry, type Feature } from './registry';

/**
 * Return YouTube Dislike (own implementation): estimated dislike count on the dislike button,
 * like/dislike ratio bar with raw counts and rating in the tooltip, on watch pages and Shorts.
 * Data comes from the service worker (cached 30 min); missing data shows "—".
 */

const ID = 'dislikes';
const T = STRINGS.rydUi;

const WATCH_DISLIKE = [
  'ytd-watch-metadata dislike-button-view-model button',
  'ytd-watch-metadata #segmented-dislike-button button',
  'ytd-menu-renderer.ytd-watch-metadata #top-level-buttons-computed > ytd-toggle-button-renderer:nth-of-type(2) button',
];
const WATCH_SEGMENTED = [
  'ytd-watch-metadata segmented-like-dislike-button-view-model',
  'ytd-watch-metadata #segmented-like-dislike-button',
];
const SHORTS_DISLIKE = [
  'ytd-reel-video-renderer[is-active] dislike-button-view-model button',
  'ytd-reel-video-renderer[is-active] #dislike-button button',
];

let settings: Settings | null = null;
let offNav: (() => void) | null = null;
let observer: MutationObserver | null = null;
let current: { id: string; votes: Votes | null } | null = null;
let pending = '';

const q = (sels: readonly string[]): HTMLElement | null => {
  for (const s of sels) {
    const el = document.querySelector<HTMLElement>(s);
    if (el) return el;
  }
  return null;
};

function videoIdFromUrl(): { id: string; shorts: boolean } | null {
  if (location.pathname === '/watch') {
    const id = new URLSearchParams(location.search).get('v');
    return id ? { id, shorts: false } : null;
  }
  const m = /^\/shorts\/([\w-]{11})/.exec(location.pathname);
  return m ? { id: m[1]!, shorts: true } : null;
}

function tooltip(v: Votes | null): string {
  if (!v) return T.unavailable;
  const total = v.likes + v.dislikes;
  const pct = total ? Math.round((v.likes / total) * 1000) / 10 : 0;
  return T.tooltip(
    v.likes.toLocaleString(),
    v.dislikes.toLocaleString(),
    pct,
    Math.round(v.rating * 100) / 100,
  );
}

function render(): void {
  const s = settings;
  if (!s || !current) return;
  const shorts = location.pathname.startsWith('/shorts/');
  if (shorts && !s.dislikes.shorts) return;
  const v = current.votes;
  const text = v ? formatCount(v.dislikes, s.dislikes.compact) : '—';

  if (shorts) {
    // Shorts show a label under each action; replace the dislike's ("Dislike") with the count.
    const btn = q(SHORTS_DISLIKE);
    const host = btn?.closest('dislike-button-view-model, #dislike-button') ?? btn?.parentElement;
    const lbl = host?.querySelector<HTMLElement>(
      '.yt-spec-button-shape-with-label__label span, .ytSpecButtonShapeWithLabelLabel span, span[role="text"]',
    );
    if (lbl && lbl.textContent !== text) {
      lbl.textContent = text;
      lbl.setAttribute('data-betteryt-ryd', '');
    }
    if (btn) {
      btn.title = tooltip(v);
      return;
    }
    // The desktop Shorts action bar currently has no dislike button: add our own label under Like.
    const like = document.querySelector('ytd-shorts reel-action-bar-view-model like-button-view-model');
    if (!like) return;
    let pill = like.parentElement?.querySelector<HTMLElement>(':scope > .betteryt-shorts-dislikes') ?? null;
    if (!pill) {
      pill = h('div', { class: 'betteryt-shorts-dislikes', 'data-betteryt-ui': 'ryd' });
      like.after(pill);
    }
    pill.textContent = `👎 ${text}`;
    pill.title = tooltip(v);
    return;
  }

  const btn = q(WATCH_DISLIKE);
  if (!btn) return;
  let count = btn.querySelector<HTMLElement>(':scope .betteryt-dislike-count');
  if (!count) {
    count = h('span', { class: 'betteryt-dislike-count', 'data-betteryt-ui': 'ryd' });
    btn.append(count);
    btn.classList.add('betteryt-has-dislikes');
  }
  if (count.textContent !== text) count.textContent = text;
  btn.title = tooltip(v);

  const seg = q(WATCH_SEGMENTED);
  let bar = seg?.querySelector<HTMLElement>(':scope > .betteryt-ratio') ?? null;
  if (!s.dislikes.ratioBar || !v || !seg) {
    bar?.remove();
    return;
  }
  if (!bar) {
    bar = h(
      'div',
      { class: 'betteryt-ratio', 'data-betteryt-ui': 'ryd', role: 'img' },
      h('span', { class: 'betteryt-ratio__likes' }),
    );
    seg.append(bar);
  }
  const total = v.likes + v.dislikes;
  const pct = total ? (v.likes / total) * 100 : 50;
  (bar.firstElementChild as HTMLElement).style.width = `${pct}%`;
  bar.title = tooltip(v);
  bar.setAttribute('aria-label', tooltip(v));
}

const scheduleRender = rafThrottle(registry.guard(ID, render));

async function refresh(): Promise<void> {
  const target = videoIdFromUrl();
  if (!target) return;
  if (target.shorts && !settings?.dislikes.shorts) return;
  if (current?.id === target.id) {
    scheduleRender.schedule();
    return;
  }
  if (pending === target.id) return;
  pending = target.id;
  current = { id: target.id, votes: null };
  try {
    const res = await sendMessage({ type: 'dislikes', videoId: target.id });
    if (current?.id !== target.id) return;
    current.votes = res.ok ? res.votes : null;
  } catch {
    // Offline / API down: render "—".
  } finally {
    pending = '';
  }
  scheduleRender.schedule();
}

function observe(): void {
  observer?.disconnect();
  // YouTube re-renders the like/dislike buttons after you vote; re-apply when they change.
  const host = document.querySelector('ytd-watch-metadata #actions, ytd-shorts');
  if (!host) return;
  observer = new MutationObserver((records) => {
    if (
      records.every((r) =>
        [...r.addedNodes].every((n) => n instanceof HTMLElement && n.dataset.betterytUi === 'ryd'),
      )
    )
      return;
    scheduleRender.schedule();
  });
  observer.observe(host, { childList: true, subtree: true });
}

const onPage = registry.guard(ID, () => {
  observe();
  void refresh();
});

export const dislikes: Feature = {
  id: ID,
  enabled: (s) => s.dislikes.enabled,
  init(s) {
    settings = s;
    offNav = onNavigate(onPage);
    onPage();
  },
  update(s) {
    settings = s;
    scheduleRender.schedule();
  },
  destroy() {
    settings = null;
    offNav?.();
    offNav = null;
    observer?.disconnect();
    observer = null;
    scheduleRender.cancel();
    current = null;
    document.querySelectorAll('[data-betteryt-ui="ryd"]').forEach((e) => e.remove());
    document
      .querySelectorAll('.betteryt-has-dislikes')
      .forEach((e) => e.classList.remove('betteryt-has-dislikes'));
  },
};
