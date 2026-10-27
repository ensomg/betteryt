import type { Settings } from '../../shared/settings-schema';
import { LAYOUT_OPTIONS, layoutAttr, type LayoutKey } from '../../shared/layout-options';
import { STRINGS } from '../../shared/strings';
import { h } from '../../shared/dom';
import { onNavigate, rafThrottle, waitFor } from '../nav';
import { registry, type Feature } from './registry';

/**
 * Layout cleanup: toggles html[by-*] attributes matched by css/layout.css, plus the few options
 * that need DOM work (focus page, "Load comments" button, description auto-expand, tagging the
 * Thanks/Clip/Download buttons which have no stable selectors).
 */

const ID = 'layout';
const root = document.documentElement;

let settings: Settings | null = null;
let offNav: (() => void) | null = null;
let actionsObserver: MutationObserver | null = null;
let clockTimer: ReturnType<typeof setTimeout> | undefined;
const pendingWaits: Array<() => void> = [];
let expandedFor = '';

export function effectiveLayout(s: Settings): Set<LayoutKey> {
  const on = new Set<LayoutKey>();
  for (const o of LAYOUT_OPTIONS) {
    if (s.layout[o.key] || (s.layout.distractionFree && o.preset)) on.add(o.key);
  }
  return on;
}

function applyAttributes(s: Settings): void {
  const on = effectiveLayout(s);
  for (const o of LAYOUT_OPTIONS) root.toggleAttribute(layoutAttr(o.key), on.has(o.key));
  const cols = s.layout.homeColumns;
  root.toggleAttribute('by-home-columns', cols > 0);
  if (cols > 0) root.style.setProperty('--by-home-columns', String(cols));
  else root.style.removeProperty('--by-home-columns');
}

/* ---------- Focus page (Home feed hidden) ---------- */

const QUOTES: ReadonlyArray<[string, string]> = [
  ['Well begun is half done.', 'Aristotle'],
  ['While we are postponing, life speeds by.', 'Seneca'],
  ['A journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
  ['The happiness of your life depends upon the quality of your thoughts.', 'Marcus Aurelius'],
];

function buildFocus(): HTMLElement {
  const input = h('input', {
    class: 'betteryt-focus__input',
    type: 'search',
    name: 'search_query',
    placeholder: STRINGS.layoutUi.focusSearch,
    'aria-label': STRINGS.layoutUi.focusSearch,
    autocomplete: 'off',
  });
  // A real GET form to /results: YouTube's router picks it up like a normal search.
  const form = h(
    'form',
    { class: 'betteryt-focus__form', action: '/results', method: 'get', role: 'search' },
    input,
  );
  const [quote, author] = QUOTES[new Date().getDate() % QUOTES.length]!;
  return h(
    'section',
    { class: 'betteryt-focus', 'data-betteryt-focus': '' },
    h('div', { class: 'betteryt-focus__clock', 'aria-hidden': 'true' }),
    h('div', { class: 'betteryt-focus__date' }),
    form,
    h('p', { class: 'betteryt-focus__quote' }, `“${quote}” — ${author}`),
  );
}

function tickClock(): void {
  clearTimeout(clockTimer);
  const panel = document.querySelector<HTMLElement>('[data-betteryt-focus]');
  if (!panel || !settings) return;
  const now = new Date();
  const clock = panel.querySelector<HTMLElement>('.betteryt-focus__clock')!;
  const date = panel.querySelector<HTMLElement>('.betteryt-focus__date')!;
  clock.hidden = date.hidden = !settings.layout.focusClock;
  clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  date.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  panel.querySelector<HTMLElement>('.betteryt-focus__quote')!.hidden = !settings.layout.focusQuote;
  // Next update exactly at the start of the next minute (no polling loop).
  if (settings.layout.focusClock)
    clockTimer = setTimeout(
      registry.guard(ID, tickClock),
      60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50,
    );
}

function ensureFocus(want: boolean): void {
  const existing = document.querySelector('[data-betteryt-focus]');
  if (!want) {
    existing?.remove();
    clearTimeout(clockTimer);
    return;
  }
  const primary = document.querySelector(
    'ytd-browse[page-subtype="home"] ytd-two-column-browse-results-renderer > #primary',
  );
  if (!primary) return;
  if (!existing || existing.parentElement !== primary) primary.prepend(existing ?? buildFocus());
  tickClock();
}

/* ---------- Watch page helpers ---------- */

function ensureLoadComments(want: boolean): void {
  const existing = document.querySelector('.betteryt-load-comments');
  if (!want) {
    existing?.remove();
    return;
  }
  const comments = document.querySelector('ytd-watch-flexy ytd-comments#comments');
  if (!comments?.parentElement || existing?.nextElementSibling === comments) return;
  const btn =
    (existing as HTMLButtonElement | null) ??
    h(
      'button',
      {
        type: 'button',
        class: 'betteryt-load-comments',
        onclick: () => root.setAttribute('by-comments-revealed', ''),
      },
      STRINGS.layoutUi.loadComments,
    );
  comments.before(btn);
}

/** Localized label fragments for buttons without stable selectors. Fragile by nature. */
const ACTION_WORDS: ReadonlyArray<[string, RegExp]> = [
  ['thanks', /thanks|teşekkür|danke|gracias|merci|grazie|obrigad|спасибо/i],
  ['clip', /^(clip|klip|clipe|clipe?r|клип|clips?)$/i],
  ['download', /download|indir|İndir|herunterladen|descargar|télécharger|scarica|baixar|скачать/i],
];

function tagActionButtons(): void {
  const host = document.querySelector('ytd-watch-metadata #flexible-item-buttons');
  if (!host) return;
  for (const el of Array.from(host.children)) {
    const btn = el.querySelector('button');
    const label = `${btn?.getAttribute('aria-label') ?? ''} ${el.textContent ?? ''}`.trim();
    const match = ACTION_WORDS.find(([, re]) => label.split(/\s+/).some((w) => re.test(w)) || re.test(label));
    if (match) el.setAttribute('by-action', match[0]);
    else el.removeAttribute('by-action');
  }
}

const retag = rafThrottle(registry.guard(ID, tagActionButtons));

function watchActionButtons(want: boolean): void {
  if (!want) {
    actionsObserver?.disconnect();
    actionsObserver = null;
    return;
  }
  const host = document.querySelector('ytd-watch-metadata #flexible-item-buttons');
  if (!host) return;
  if (!actionsObserver) actionsObserver = new MutationObserver(() => retag.schedule());
  actionsObserver.disconnect();
  actionsObserver.observe(host, { childList: true, subtree: true, characterData: true });
  retag.schedule();
}

function expandDescription(want: boolean): void {
  if (!want || location.pathname !== '/watch') return;
  const vid = new URLSearchParams(location.search).get('v') ?? '';
  if (!vid || vid === expandedFor) return;
  const w = waitFor<HTMLElement>(
    'ytd-watch-metadata #description-inline-expander #expand',
    document.documentElement,
    10_000,
  );
  pendingWaits.push(w.cancel);
  w.promise
    .then((btn) => {
      if (!settings || expandedFor === vid) return;
      expandedFor = vid;
      if (btn.offsetParent !== null) btn.click();
    })
    .catch(() => undefined);
}

/* ---------- Lifecycle ---------- */

function onPage(): void {
  if (!settings) return;
  const on = effectiveLayout(settings);
  for (const cancel of pendingWaits.splice(0)) cancel();
  ensureFocus(on.has('homeHideFeed'));
  const isWatch = location.pathname === '/watch';
  ensureLoadComments(isWatch && on.has('watchHideComments'));
  watchActionButtons(
    isWatch && (on.has('watchHideThanks') || on.has('watchHideClip') || on.has('watchHideDownload')),
  );
  if (isWatch && on.has('watchHideComments')) {
    // Comments render late; place the button once they exist.
    const w = waitFor('ytd-watch-flexy ytd-comments#comments', document.documentElement, 15_000);
    pendingWaits.push(w.cancel);
    w.promise
      .then(
        registry.guard(ID, () =>
          ensureLoadComments(!!settings && effectiveLayout(settings).has('watchHideComments')),
        ),
      )
      .catch(() => undefined);
  }
  expandDescription(on.has('watchExpandDescription'));
}

const onNavigated = registry.guard(ID, () => {
  root.removeAttribute('by-comments-revealed'); // "Load comments" is per video
  onPage();
});

export const layout: Feature = {
  id: ID,
  enabled: () => true,
  init(s) {
    settings = s;
    applyAttributes(s);
    offNav = onNavigate(onNavigated);
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
    clearTimeout(clockTimer);
    for (const cancel of pendingWaits.splice(0)) cancel();
    actionsObserver?.disconnect();
    actionsObserver = null;
    retag.cancel();
    for (const o of LAYOUT_OPTIONS) root.removeAttribute(layoutAttr(o.key));
    root.removeAttribute('by-home-columns');
    root.removeAttribute('by-comments-revealed');
    root.style.removeProperty('--by-home-columns');
    for (const el of document.querySelectorAll('[data-betteryt-focus], .betteryt-load-comments')) el.remove();
    for (const el of document.querySelectorAll('[by-action]')) el.removeAttribute('by-action');
  },
};
