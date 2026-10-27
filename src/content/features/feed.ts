import { setPath, type Settings } from '../../shared/settings-schema';
import { loadSettings, saveSettings } from '../../shared/storage';
import { STRINGS } from '../../shared/strings';
import { h, svgIcon } from '../../shared/dom';
import { absoluteDate, dateGroup, fillAges, type DateGroup } from '../../shared/feed-time';
import {
  compileKeywords,
  filterReason,
  isWatched,
  reorder,
  stripChannels,
  tabCounts,
  type FeedItemData,
  type FeedTab,
  type FilterContext,
  type KeywordRule,
} from '../../shared/feed-filter';
import { getState, loadState, onStateChange, touchVisit, updateState } from '../../shared/watched-store';
import { animate, STAGGER_CAP } from '../../shared/motion';
import { feedContainer, pageKind, parseItem, type PageKind, type ParsedItem } from '../feed/parse';
import { ChannelStrip } from '../feed/strip';
import { FeedToolbar } from '../feed/toolbar';
import { showToast, destroyToasts } from '../ui/toast';
import { onNavigate, rafThrottle } from '../nav';
import { registry, type Feature } from './registry';

/**
 * Subscriptions overhaul + feed layout. Never removes or reorders YouTube's nodes: items only get
 * attributes (by-type, by-watched, by-filtered...) that css/feed.css acts on, and BetterYT's own
 * UI (strip, toolbar, date headers, card buttons) is inserted alongside.
 */

const ID = 'feed';
const T = STRINGS.subsUi;
const root = document.documentElement;

const EYE_ICON =
  'M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9Zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z';
const HIDE_ICON =
  'M3.3 2 2 3.3l3.2 3.2C3.6 7.8 2.5 9.6 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3l4.1 4.1 1.3-1.3L3.3 2ZM12 16.5A4.5 4.5 0 0 1 7.5 12c0-.8.2-1.5.5-2.1l6.1 6.1c-.6.3-1.3.5-2.1.5Zm0-11.5c5 0 9 4.5 10 7-.4 1.1-1.3 2.5-2.6 3.8l-3.1-3.1c.1-.2.1-.5.1-.7A4.5 4.5 0 0 0 12 7.5c-.2 0-.5 0-.7.1L8.9 5.2C9.9 5.1 11 5 12 5Z';

let settings: Settings | null = null;
let kind: PageKind = 'other';
let offNav: (() => void) | null = null;
let offState: (() => void) | null = null;
let observer: MutationObserver | null = null;
let boundRoot: HTMLElement | null = null;
let prevVisit: number | null = null;
let keywords: KeywordRule[] = [];
let keywordSource = '';

const cache = new WeakMap<HTMLElement, ParsedItem>();
/** Cards whose subtree changed since they were parsed (lazy overlays, text, re-used elements). */
const dirty = new WeakSet<HTMLElement>();
const seen = new WeakSet<HTMLElement>();
let initialPass = true;

/** Transient (per tab) filter state. */
let tab: FeedTab = 'all';
const selected = new Set<string>();

let strip: ChannelStrip | null = null;
let toolbar: FeedToolbar | null = null;
let uiHost: HTMLElement | null = null;

const schedule = rafThrottle(registry.guard(ID, () => pass()));

/* ------------------------------------------------------------------------------------------------
 * Scope + html attributes
 * ---------------------------------------------------------------------------------------------- */

function feedOn(s: Settings): boolean {
  return (s.feed.applyTo as string[]).includes(kind);
}

function subsOn(s: Settings): boolean {
  return kind === 'subscriptions' && s.subs.enabled;
}

function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function applyRootAttributes(s: Settings): void {
  const on = feedOn(s);
  const f = s.feed;
  setAttr(root, 'by-feed-on', on ? '' : null);
  setAttr(root, 'by-subs-on', subsOn(s) ? '' : null);
  setAttr(root, 'by-feed-watched', on ? f.watched : null);
  setAttr(root, 'by-show-hidden', on && f.showHidden ? '' : null);
  setAttr(root, 'by-feed-columns', on && f.columns > 0 && !f.listMode ? String(f.columns) : null);
  setAttr(root, 'by-feed-compact', on && f.density === 'compact' ? '' : null);
  setAttr(root, 'by-feed-list', on && f.listMode ? '' : null);
  setAttr(root, 'by-feed-no-avatars', on && f.hideAvatars ? '' : null);
  setAttr(root, 'by-feed-duration', on && f.durationStyle !== 'default' ? f.durationStyle : null);
  setAttr(root, 'by-feed-thick-progress', on && f.thickProgress ? '' : null);
  setAttr(root, 'by-feed-preview', on && f.preview !== 'default' ? f.preview : null);
  if (on && f.columns > 0) root.style.setProperty('--by-feed-columns', String(f.columns));
  else root.style.removeProperty('--by-feed-columns');
  root.style.setProperty('--by-list-thumb', `${f.listThumb}px`);
  root.style.setProperty('--by-preview-delay', `${f.previewDelay}ms`);
}

const ROOT_ATTRS = [
  'by-feed-on',
  'by-subs-on',
  'by-feed-watched',
  'by-show-hidden',
  'by-feed-columns',
  'by-feed-compact',
  'by-feed-list',
  'by-feed-no-avatars',
  'by-feed-duration',
  'by-feed-thick-progress',
  'by-feed-preview',
];

/* ------------------------------------------------------------------------------------------------
 * Card action buttons (mark watched / hide)
 * ---------------------------------------------------------------------------------------------- */

function stop(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
}

function ensureCardActions(item: ParsedItem, watched: boolean, hidden: boolean): void {
  const host = item.thumbEl;
  if (!host) return;
  let box = host.querySelector<HTMLElement>(':scope > .betteryt-card-actions');
  if (!box) {
    const mark = h(
      'button',
      { type: 'button', class: 'betteryt-card-actions__btn', 'data-act': 'watch' },
      svgIcon(EYE_ICON, 18),
    );
    const hide = h(
      'button',
      { type: 'button', class: 'betteryt-card-actions__btn', 'data-act': 'hide' },
      svgIcon(HIDE_ICON, 18),
    );
    box = h('div', { class: 'betteryt-card-actions', 'data-betteryt-ui': 'card' }, mark, hide);
    // Stop the thumbnail link from navigating; act on click only.
    for (const b of [mark, hide]) {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    box.addEventListener('click', (e) => {
      stop(e);
      const btn = (e.target as Element).closest<HTMLElement>('[data-act]');
      const vid = box!.dataset.vid;
      if (!btn || !vid) return;
      void onCardAction(vid, btn.dataset.act === 'hide' ? 'hide' : 'watch');
    });
    host.append(box);
  }
  box.dataset.vid = item.vid;
  const [mark, hide] = box.children as unknown as [HTMLElement, HTMLElement];
  const markLabel = watched ? T.markUnwatched : T.markWatched;
  const hideLabel = hidden ? T.unhide : T.hide;
  setAttr(mark, 'aria-label', markLabel);
  setAttr(mark, 'title', markLabel);
  setAttr(mark, 'aria-pressed', String(watched));
  setAttr(hide, 'aria-label', hideLabel);
  setAttr(hide, 'title', hideLabel);
  setAttr(hide, 'aria-pressed', String(hidden));
}

async function onCardAction(vid: string, act: 'watch' | 'hide'): Promise<void> {
  if (!settings) return;
  const before = getState(vid);
  if (act === 'hide') {
    const nowHidden = !before?.h;
    await updateState(vid, { h: nowHidden ? 1 : undefined });
    if (nowHidden)
      showToast(T.hiddenToast, {
        action: { label: T.undo, run: () => void updateState(vid, { h: before?.h }) },
      });
    return;
  }
  const item = currentItems.find((i) => i.vid === vid);
  const watchedNow = item ? isWatched(item, before, settings.feed.watchedThreshold) : !!before?.w;
  if (watchedNow) {
    await updateState(vid, { w: undefined, p: undefined });
  } else {
    await updateState(vid, { w: 1 });
    showToast(T.watchedToast, {
      action: { label: T.undo, run: () => void updateState(vid, { w: before?.w, p: before?.p }) },
    });
  }
}

/* ------------------------------------------------------------------------------------------------
 * Subscriptions UI (strip + toolbar)
 * ---------------------------------------------------------------------------------------------- */

async function writeSettings(mut: (s: Settings) => Settings): Promise<void> {
  const fresh = await loadSettings();
  await saveSettings(mut(fresh));
}

function crossFade(): void {
  if (boundRoot) animate(boundRoot, [{ opacity: 0.35 }, { opacity: 1 }], 'base');
}

function ensureUi(gridRoot: HTMLElement, s: Settings): void {
  const grid = gridRoot.closest('ytd-rich-grid-renderer') as HTMLElement | null;
  if (!subsOn(s) || !grid) {
    uiHost?.remove();
    uiHost = null;
    return;
  }
  if (!strip) {
    strip = new ChannelStrip({
      select: (key, multi) => {
        if (multi) {
          if (selected.has(key)) selected.delete(key);
          else selected.add(key);
        } else if (selected.size === 1 && selected.has(key)) selected.clear();
        else {
          selected.clear();
          selected.add(key);
        }
        crossFade();
        schedule.schedule();
      },
      clear: () => {
        if (!selected.size) return;
        selected.clear();
        crossFade();
        schedule.schedule();
      },
      togglePin: (key) =>
        void writeSettings((cur) => {
          const pinned = cur.subs.pinned.includes(key)
            ? cur.subs.pinned.filter((k) => k !== key)
            : [...cur.subs.pinned, key];
          return setPath(cur, 'subs.pinned', pinned);
        }).catch((e: unknown) => registry.report(ID, e)),
      reorder: (key, beforeKey) =>
        void writeSettings((cur) => {
          const visible = lastStripKeys.filter((k) => !cur.subs.pinned.includes(k));
          return setPath(cur, 'subs.order', reorder(visible, key, beforeKey));
        }).catch((e: unknown) => registry.report(ID, e)),
    });
  }
  if (!toolbar) {
    toolbar = new FeedToolbar({
      tab: (t) => {
        if (t === tab) return;
        tab = t;
        crossFade();
        schedule.schedule();
      },
      toggleHidden: () =>
        void writeSettings((cur) => setPath(cur, 'feed.showHidden', !cur.feed.showHidden)).catch(
          (e: unknown) => registry.report(ID, e),
        ),
      refresh: () => {
        const link = document.querySelector<HTMLElement>(
          'ytd-guide-entry-renderer a[href="/feed/subscriptions"], ytd-mini-guide-entry-renderer a[href="/feed/subscriptions"]',
        );
        if (link) link.click();
        else location.reload();
      },
    });
  }
  if (!uiHost)
    uiHost = h('div', { class: 'betteryt-feed-ui', 'data-betteryt-ui': 'feed' }, strip.el, toolbar.el);
  if (uiHost.nextElementSibling !== grid) grid.before(uiHost);
  strip.el.hidden = !s.subs.channelStrip;
}

let lastStripKeys: string[] = [];

/* ------------------------------------------------------------------------------------------------
 * Main pass
 * ---------------------------------------------------------------------------------------------- */

let currentItems: ParsedItem[] = [];

function bind(): void {
  const c = feedContainer(kind);
  const next = c?.root ?? null;
  if (next === boundRoot) return;
  observer?.disconnect();
  boundRoot = next;
  initialPass = true;
  if (next) {
    // childList only: new cards and lazily rendered card content (overlays render near the
    // viewport). Each mutation marks its card dirty so exactly that card is re-parsed. Our own
    // attribute writes don't trigger it, and our own inserted UI is ignored.
    const itemSel = c!.items;
    observer = new MutationObserver((records) => {
      let relevant = false;
      for (const r of records) {
        const nodes = [...r.addedNodes, ...r.removedNodes];
        if (
          nodes.length &&
          nodes.every(
            (n) =>
              n instanceof HTMLElement &&
              (n.dataset.betterytUi || n.classList.contains('betteryt-date-header')),
          )
        )
          continue;
        relevant = true;
        const target = r.target instanceof Element ? r.target : r.target.parentElement;
        const card = target?.closest<HTMLElement>(itemSel);
        if (card) dirty.add(card);
      }
      if (relevant) schedule.schedule();
    });
    observer.observe(next, { childList: true, subtree: true });
  }
}

function parseAll(container: HTMLElement, selector: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  for (const el of container.querySelectorAll<HTMLElement>(selector)) {
    const hit = cache.get(el);
    if (hit && !dirty.has(el)) {
      out.push(hit);
      continue;
    }
    dirty.delete(el);
    const item = parseItem(el);
    if (!item) {
      cache.delete(el);
      continue;
    }
    cache.set(el, item);
    out.push(item);
  }
  return out;
}

function ensureHeader(before: HTMLElement, group: DateGroup): void {
  const prev = before.previousElementSibling as HTMLElement | null;
  if (prev?.classList.contains('betteryt-date-header') && prev.dataset.group === group) return;
  before.before(
    h(
      'div',
      { class: 'betteryt-date-header', 'data-group': group, role: 'heading', 'aria-level': '2' },
      T.groups[group],
    ),
  );
}

function pass(): void {
  const s = settings;
  if (!s) return;
  bind();
  const container = feedContainer(kind);
  const on = feedOn(s);
  const subs = subsOn(s);
  if (!container || (!on && !subs)) return;

  const items = parseAll(container.root, container.items);
  currentItems = items;
  const now = new Date();
  const threshold = s.feed.watchedThreshold;

  if (s.subs.keywords !== keywordSource) {
    keywordSource = s.subs.keywords;
    keywords = compileKeywords(keywordSource);
  }
  const ctx: FilterContext = {
    subsPage: subs,
    subs: s.subs,
    feed: s.feed,
    tab,
    channels: selected,
    keywords,
  };

  // Fill unknown ages from neighbours (feed is newest-first); shorts shelves carry no ages.
  const regular = items.filter((i) => i.type !== 'short');
  const filled = new Map<ParsedItem, number | null>();
  // Live and scheduled items have no upload age; group them under "Today" (they're now / upcoming).
  const groupAge = (i: ParsedItem): number | null =>
    i.age ?? (i.type === 'live' || i.type === 'upcoming' || i.type === 'premiere' ? 0 : null);
  fillAges(regular.map(groupAge)).forEach((a, idx) => filled.set(regular[idx]!, a));

  const freshCutoff = prevVisit !== null ? (now.getTime() - prevVisit) / 60_000 : 24 * 60;
  let hiddenCount = 0;
  let enterIndex = 0;

  for (const item of items) {
    const el = item.el;
    const local = getState(item.vid);
    const watched = isWatched(item, local, threshold);
    const userHidden = !!local?.h;
    const reason = filterReason(item, ctx);
    if ((watched && s.feed.watched === 'hide') || userHidden) hiddenCount++;

    setAttr(el, 'by-type', item.type);
    setAttr(el, 'by-watched', on && watched ? '' : null);
    setAttr(el, 'by-user-hidden', on && userHidden ? '' : null);
    setAttr(el, 'by-filtered', reason);

    if (item.ageEl) {
      if (on && s.feed.absoluteDates && item.age !== null) {
        if (!item.ageEl.dataset.byOrig) item.ageEl.dataset.byOrig = item.ageEl.textContent?.trim() ?? '';
        setAttr(item.ageEl, 'by-abs', absoluteDate(item.age, now));
        setAttr(item.ageEl, 'title', T.estimated(item.ageEl.dataset.byOrig));
      } else if (item.ageEl.hasAttribute('by-abs')) {
        item.ageEl.removeAttribute('by-abs');
        item.ageEl.removeAttribute('title');
      }
    }

    if (on && s.feed.markButtons && item.type !== 'short') ensureCardActions(item, watched, userHidden);
    else item.thumbEl?.querySelector(':scope > .betteryt-card-actions')?.remove();

    if (!seen.has(el)) {
      seen.add(el);
      if (!initialPass && subs && s.subs.staggerFadeIn && enterIndex <= STAGGER_CAP) {
        el.style.setProperty('--by-i', String(enterIndex++));
        el.setAttribute('by-enter', '');
        el.addEventListener('animationend', () => el.removeAttribute('by-enter'), { once: true });
      }
    }
  }

  // Shorts shelves / sections: hide when the tab excludes Shorts or nothing inside survives.
  if (subs) {
    for (const section of container.root.querySelectorAll<HTMLElement>(
      ':scope > ytd-rich-section-renderer',
    )) {
      const inner = items.filter((i) => section.contains(i.el));
      const tabHides = tab !== 'all' && tab !== 'shorts';
      const empty = inner.length > 0 && inner.every((i) => i.el.hasAttribute('by-filtered'));
      setAttr(section, 'by-filtered', tabHides ? 'tab' : empty ? 'empty' : null);
    }
  }

  // Date headers (top-level cards only, in DOM order).
  const wantHeaders = subs && s.subs.dateGroups && !(on && s.feed.watched === 'bottom') && !s.feed.listMode;
  const keep = new Set<Element>();
  if (wantHeaders) {
    let last: DateGroup | null = null;
    for (const item of regular) {
      if (item.el.parentElement !== container.root) continue;
      if (item.el.hasAttribute('by-filtered')) continue;
      const hiddenByWatch =
        on &&
        !s.feed.showHidden &&
        (item.el.hasAttribute('by-user-hidden') ||
          (s.feed.watched === 'hide' && item.el.hasAttribute('by-watched')));
      if (hiddenByWatch) continue;
      const age = filled.get(item);
      if (age === null || age === undefined) continue;
      const g = dateGroup(age, now);
      if (g !== last) {
        ensureHeader(item.el, g);
        keep.add(item.el.previousElementSibling!);
        last = g;
      }
    }
  }
  for (const hdr of container.root.querySelectorAll(':scope > .betteryt-date-header'))
    if (!keep.has(hdr)) hdr.remove();

  if (subs) {
    const gridRoot = container.root;
    ensureUi(gridRoot, s);
    const channelScoped = items.filter((i) => !selected.size || (i.channelKey && selected.has(i.channelKey)));
    const stripData = stripChannels(
      items.filter((i) => i.type !== 'short'),
      s.subs,
      (i: FeedItemData) => i.age !== null && i.age < freshCutoff && !isWatched(i, getState(i.vid), threshold),
    );
    lastStripKeys = stripData.map((c) => c.key);
    strip?.update(stripData, selected);
    toolbar?.update({
      tab,
      counts: tabCounts(channelScoped),
      showTabs: s.subs.typeTabs,
      hiddenCount,
      showHidden: s.feed.showHidden,
      refresh: s.subs.refreshButton,
    });
  } else {
    uiHost?.remove();
    uiHost = null;
  }
  initialPass = false;
}

/* ------------------------------------------------------------------------------------------------
 * Lifecycle
 * ---------------------------------------------------------------------------------------------- */

const onPage = registry.guard(ID, () => {
  const nextKind = pageKind();
  if (nextKind !== kind) {
    kind = nextKind;
    if (kind === 'subscriptions') void touchVisit().then((p) => (prevVisit = p));
  }
  if (settings) applyRootAttributes(settings);
  bind();
  schedule.schedule();
});

function cleanup(): void {
  for (const a of ROOT_ATTRS) root.removeAttribute(a);
  for (const p of ['--by-feed-columns', '--by-list-thumb', '--by-preview-delay'])
    root.style.removeProperty(p);
  for (const el of document.querySelectorAll(
    '[data-betteryt-ui="feed"], [data-betteryt-ui="card"], .betteryt-date-header',
  ))
    el.remove();
  for (const el of document.querySelectorAll(
    '[by-type], [by-watched], [by-user-hidden], [by-filtered], [by-abs], [by-enter]',
  )) {
    for (const a of ['by-type', 'by-watched', 'by-user-hidden', 'by-filtered', 'by-abs', 'by-enter'])
      el.removeAttribute(a);
  }
}

export const feed: Feature = {
  id: ID,
  enabled: (s) => s.subs.enabled || s.feed.applyTo.length > 0,
  init(s) {
    settings = s;
    kind = pageKind();
    if (kind === 'subscriptions') void touchVisit().then((p) => (prevVisit = p));
    applyRootAttributes(s);
    void loadState().then(() => schedule.schedule());
    offState = onStateChange(() => schedule.schedule());
    offNav = onNavigate(onPage);
    bind();
    schedule.schedule();
  },
  update(s) {
    settings = s;
    applyRootAttributes(s);
    schedule.schedule();
  },
  destroy() {
    settings = null;
    schedule.cancel();
    observer?.disconnect();
    observer = null;
    boundRoot = null;
    offNav?.();
    offNav = null;
    offState?.();
    offState = null;
    destroyToasts();
    strip = null;
    toolbar = null;
    uiHost = null;
    selected.clear();
    tab = 'all';
    cleanup();
  },
};
