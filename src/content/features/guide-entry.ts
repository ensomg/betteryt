import { setPath, type Settings } from '../../shared/settings-schema';
import { loadSettings, saveSettings } from '../../shared/storage';
import { STRINGS } from '../../shared/strings';
import { FOCUS_ICON, GEAR_ICON, h, svgIcon } from '../../shared/dom';
import { sendMessage } from '../../shared/messages';
import { anySelector, closestAny, queryAll, queryFirst } from '../selectors';
import { onNavigate, rafThrottle, waitFor } from '../nav';
import { ripple } from '../ui/ripple';
import { registry, type Feature } from './registry';

/**
 * "BetterYT Settings" entry in YouTube's expanded guide (hamburger drawer) and a gear entry in
 * the collapsed mini-guide. Both are our own elements styled to match YouTube's native items
 * (see ui/guide-entry.css); cloning ytd-* elements is avoided because Polymer state breaks.
 */

const ID = 'guide-entry';
const MARKER = 'data-betteryt-entry';

let settings: Settings | null = null;
let observers: MutationObserver[] = [];
let waiters: Array<() => void> = [];
let offNav: (() => void) | null = null;
const ensure = rafThrottle(registry.guard(ID, () => ensureEntries()));

function openSettings(): void {
  sendMessage({ type: 'openOptions' }).catch((e: unknown) => registry.report(ID, e));
}

function activate(el: HTMLElement): void {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation(); // keep YouTube's drawer handlers from treating this as a guide navigation
    openSettings();
  });
  el.addEventListener('pointerdown', (e) => ripple(el, e));
}

/** Quick toggle for the Distraction-free preset, next to the settings entry. */
async function toggleDistractionFree(): Promise<void> {
  const current = await loadSettings();
  await saveSettings(setPath(current, 'layout.distractionFree', !current.layout.distractionFree));
}

function buildGuideEntry(): HTMLElement {
  const button = h(
    'button',
    { type: 'button', class: 'betteryt-guide-entry__button', title: STRINGS.menu.settings },
    h('span', { class: 'betteryt-guide-entry__icon' }, svgIcon(GEAR_ICON)),
    h('span', { class: 'betteryt-guide-entry__label' }, STRINGS.menu.settings),
  );
  activate(button);
  const focus = h(
    'button',
    {
      type: 'button',
      class: 'betteryt-guide-entry__toggle',
      'data-betteryt-focus-toggle': '',
      'aria-pressed': 'false',
      'aria-label': STRINGS.menu.distractionFree,
      title: STRINGS.menu.distractionFree,
    },
    svgIcon(FOCUS_ICON, 20),
  );
  focus.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleDistractionFree().catch((err: unknown) => registry.report(ID, err));
  });
  focus.addEventListener('pointerdown', (e) => ripple(focus, e));
  return h('div', { class: 'betteryt-guide-entry', [MARKER]: 'guide', role: 'none' }, button, focus);
}

function buildMiniEntry(): HTMLElement {
  const button = h(
    'button',
    {
      type: 'button',
      class: 'betteryt-mini-entry__button',
      'aria-label': STRINGS.menu.settings,
      title: STRINGS.menu.settings,
    },
    h('span', { class: 'betteryt-mini-entry__icon' }, svgIcon(GEAR_ICON)),
    h('span', { class: 'betteryt-mini-entry__label' }, STRINGS.menu.settingsShort),
  );
  activate(button);
  return h('div', { class: 'betteryt-mini-entry', [MARKER]: 'mini', role: 'none' }, button);
}

/** The guide entry we should sit after, or null to append at the end of `items`. */
function findGuideAnchor(): { items: Element; after: Element | null } | null {
  const renderer = queryFirst('guideRenderer');
  if (!renderer) return null;
  // Logged in, the bottom section has Settings; logged out it may only have Report history.
  const link = queryFirst('guideSettingsLink', renderer) ?? queryFirst('guideReportHistoryLink', renderer);
  if (link) {
    const entry = closestAny('guideEntry', link);
    const items = entry?.parentElement;
    if (entry && items) return { items, after: entry };
  }
  // Fallback: end of the last section with native items (the Settings/Help section is last).
  const sections = queryAll('guideSection', renderer);
  for (let i = sections.length - 1; i >= 0; i--) {
    const items = queryFirst('guideSectionItems', sections[i]!);
    const natives = items ? Array.from(items.children).filter((c) => !c.hasAttribute(MARKER)) : [];
    if (items && natives.length) return { items, after: natives[natives.length - 1]! };
  }
  return null;
}

function ensureGuide(want: boolean): void {
  const existing = document.querySelector<HTMLElement>(`[${MARKER}="guide"]`);
  if (!want) {
    existing?.remove();
    return;
  }
  const anchor = findGuideAnchor();
  if (!anchor) return;
  const el = existing ?? buildGuideEntry();
  const pressed = String(settings?.layout.distractionFree === true);
  const toggle = el.querySelector('[data-betteryt-focus-toggle]');
  if (toggle && toggle.getAttribute('aria-pressed') !== pressed) toggle.setAttribute('aria-pressed', pressed);
  const inPlace =
    el.parentElement === anchor.items &&
    (anchor.after ? el.previousElementSibling === anchor.after : el === anchor.items.firstElementChild);
  if (inPlace) return;
  if (anchor.after && anchor.after !== el) anchor.after.after(el);
  else anchor.items.prepend(el);
}

function ensureMini(want: boolean): void {
  const existing = document.querySelector<HTMLElement>(`[${MARKER}="mini"]`);
  if (!want) {
    existing?.remove();
    return;
  }
  const items = queryFirst('miniGuideItems');
  if (!items) return;
  if (existing?.parentElement === items && existing === items.lastElementChild) return;
  items.append(existing ?? buildMiniEntry());
}

function ensureEntries(): void {
  if (!settings) return;
  ensureGuide(settings.menu.guideEntry);
  ensureMini(settings.menu.miniGuideEntry);
}

/** Observe one container (childList+subtree, no attributes) and re-check on change. */
function watch(selectorKey: 'guideDrawer' | 'miniGuide'): void {
  const w = waitFor(anySelector(selectorKey));
  waiters.push(w.cancel);
  w.promise
    .then((root) => {
      if (!settings) return;
      const mo = new MutationObserver(() => ensure.schedule());
      mo.observe(root, { childList: true, subtree: true });
      observers.push(mo);
      ensure.schedule();
    })
    .catch(() => undefined);
}

export const guideEntry: Feature = {
  id: ID,
  ignoresMasterSwitch: true, // the entry point to settings must stay reachable
  enabled: (s) => s.menu.guideEntry || s.menu.miniGuideEntry,
  init(s) {
    settings = s;
    watch('guideDrawer');
    watch('miniGuide');
    offNav = onNavigate(() => ensure.schedule());
    ensure.schedule();
  },
  update(s) {
    settings = s;
    ensure.schedule();
  },
  destroy() {
    settings = null;
    ensure.cancel();
    for (const mo of observers) mo.disconnect();
    for (const cancel of waiters) cancel();
    observers = [];
    waiters = [];
    offNav?.();
    offNav = null;
    for (const el of document.querySelectorAll(`[${MARKER}]`)) el.remove();
  },
};
