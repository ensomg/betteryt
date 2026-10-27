import type { Settings } from '../../shared/settings-schema';
import { onNavigate } from '../nav';
import { registry, type Feature } from './registry';

/**
 * Removes YouTube Playables / Games. css/playables.css hides anything linking to /playables;
 * this module adds title-based detection for shelves whose links are not rendered yet, and the
 * optional redirect of /playables URLs to Home.
 */

const ID = 'playables';
const root = document.documentElement;
const SHELVES =
  'ytd-rich-shelf-renderer, ytd-rich-section-renderer, ytd-shelf-renderer, grid-shelf-view-model, ytd-reel-shelf-renderer';
const TITLE = '#title, #title-text, h2, .yt-shelf-header-layout__title, .ytShelfHeaderLayoutTitle';
/** "Playables" is a brand name and is not translated in most locales. */
const PLAYABLES_TITLE = /\bplayables\b/i;

let settings: Settings | null = null;
let offNav: (() => void) | null = null;
let observer: MutationObserver | null = null;
let idle = 0;

export function isPlayablesPath(pathname: string): boolean {
  return /^\/playables(\/|$|\?)/.test(pathname) || pathname === '/playables';
}

function maybeRedirect(): void {
  if (settings?.playables.redirect && isPlayablesPath(location.pathname)) location.replace('/');
}

function markShelves(): void {
  idle = 0;
  if (!settings?.playables.hide) return;
  for (const shelf of document.querySelectorAll<HTMLElement>(`:is(${SHELVES}):not([by-playables-checked])`)) {
    const title = shelf.querySelector(TITLE)?.textContent ?? '';
    if (!title.trim()) continue; // not rendered yet: check again later
    shelf.setAttribute('by-playables-checked', '');
    if (PLAYABLES_TITLE.test(title)) shelf.setAttribute('by-playables', '');
  }
}

const scheduleMark = (): void => {
  if (idle) return;
  const run = registry.guard(ID, markShelves);
  idle = requestIdleCallback(run, { timeout: 1500 });
};

function startObserving(): void {
  const pages = document.querySelector('ytd-page-manager');
  if (!pages || observer) return;
  // childList only: shelves are inserted as new nodes; attribute churn is ignored.
  observer = new MutationObserver(scheduleMark);
  observer.observe(pages, { childList: true, subtree: true });
}

const onPage = registry.guard(ID, () => {
  maybeRedirect();
  if (!settings?.playables.hide) return;
  startObserving();
  scheduleMark();
});

function apply(s: Settings): void {
  root.toggleAttribute('by-hide-playables', s.playables.hide);
  if (!s.playables.hide) {
    observer?.disconnect();
    observer = null;
  }
}

export const playables: Feature = {
  id: ID,
  enabled: (s) => s.playables.hide || s.playables.redirect,
  init(s) {
    settings = s;
    apply(s);
    offNav = onNavigate(onPage);
    onPage();
  },
  update(s) {
    settings = s;
    apply(s);
    onPage();
  },
  destroy() {
    settings = null;
    offNav?.();
    offNav = null;
    observer?.disconnect();
    observer = null;
    if (idle) cancelIdleCallback(idle);
    idle = 0;
    root.removeAttribute('by-hide-playables');
    for (const el of document.querySelectorAll('[by-playables], [by-playables-checked]')) {
      el.removeAttribute('by-playables');
      el.removeAttribute('by-playables-checked');
    }
  },
};
