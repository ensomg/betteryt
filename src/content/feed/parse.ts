/**
 * Reads a feed item's facts straight from the rendered DOM. Supports both renderers YouTube ships:
 * the classic ytd-rich-grid-media / ytd-video-renderer and the newer yt-lockup-view-model, plus
 * Shorts lockups. Locale-independent signals are preferred (duration badge, progress bar width,
 * /shorts/ links, overlay styles); only the upload age needs text parsing.
 */
import { parseDuration, parseRelativeAge } from '../../shared/feed-time';
import type { FeedItemData, FeedType } from '../../shared/feed-filter';
import { SELECTORS } from '../selectors';

export interface ParsedItem extends FeedItemData {
  el: HTMLElement;
  /** Element holding the "3 days ago" text (target for absolute dates). */
  ageEl: HTMLElement | null;
  /** Thumbnail container (target for the hover action buttons). */
  thumbEl: HTMLElement | null;
  /** Link the parse is based on; a change means the element was re-used for another video. */
  href: string;
}

const q = <E extends Element = HTMLElement>(root: ParentNode, selectors: readonly string[]): E | null => {
  for (const s of selectors) {
    const el = root.querySelector<E>(s);
    if (el) return el;
  }
  return null;
};

const S = SELECTORS;

function videoIdFrom(href: string): string | null {
  const shorts = /\/shorts\/([\w-]{6,})/.exec(href);
  if (shorts) return shorts[1]!;
  const v = /[?&]v=([\w-]{6,})/.exec(href);
  return v ? v[1]! : null;
}

function channelKeyFrom(href: string | null): string | null {
  if (!href) return null;
  const m =
    /^(?:https?:\/\/(?:www\.)?youtube\.com)?(\/(?:@[^/?#]+|channel\/[\w-]+|c\/[^/?#]+|user\/[^/?#]+))/.exec(
      href,
    );
  return m ? decodeURIComponent(m[1]!) : null;
}

function progressOf(item: Element): number {
  const bar = q(item, S.feedProgress);
  if (!bar) return 0;
  const w = parseFloat(bar.style.width);
  return Number.isFinite(w) ? Math.min(100, Math.max(0, w)) : 0;
}

function durationOf(item: Element): number | null {
  for (const sel of S.feedDurationText) {
    for (const el of item.querySelectorAll<HTMLElement>(sel)) {
      const d = parseDuration(el.textContent ?? '');
      if (d !== null) return d;
    }
  }
  return null;
}

const LIVE_TEXT = /^(live|en direct|en vivo|ao vivo|canlı|in diretta|live now|прямой эфир)$/i;
/** "Premiere", "Première", "Premiere", "Premier"... (most languages share the stem). */
const PREMIERE_TEXT = /premi/i;
/** Non-duration badges that are neither live nor scheduled (e.g. "SHORTS", "NEW"). */
const NEUTRAL_BADGE = /^(shorts|new|nuevo|neu|nouveau|yeni|4k|hd|cc|vr|360°?)$/i;

function typeOf(item: Element, href: string, duration: number | null): FeedType {
  if (href.includes('/shorts/') || item.querySelector(S.feedShortsMarker.join(','))) return 'short';
  if (item.querySelector(S.feedLiveMarker.join(','))) return 'live';
  const marked = !!item.querySelector(S.feedUpcomingMarker.join(','));
  // Thumbnail badge text that isn't a duration: "LIVE", "Upcoming", "Premiere" (localized).
  const badgeText = Array.from(item.querySelectorAll<HTMLElement>(S.feedBadge.join(',')))
    .map((e) => (e.textContent ?? '').trim())
    .find((t) => t && parseDuration(t) === null && !NEUTRAL_BADGE.test(t));
  if (badgeText && LIVE_TEXT.test(badgeText)) return 'live';
  if (badgeText && PREMIERE_TEXT.test(badgeText)) return 'premiere';
  if (marked || (badgeText && duration === null)) {
    // A scheduled premiere already has its final duration; a scheduled stream has none.
    return duration !== null ? 'premiere' : 'upcoming';
  }
  return 'video';
}

/** Parses one feed item element; null when it isn't a video (ads, posts, empty placeholders). */
export function parseItem(el: HTMLElement): ParsedItem | null {
  const link = q<HTMLAnchorElement>(el, S.feedVideoLink);
  const href = link?.getAttribute('href') ?? '';
  const vid = videoIdFrom(href);
  if (!vid) return null;

  const title = (q(el, S.feedTitle)?.textContent ?? link?.getAttribute('title') ?? '').trim();
  const channelLink = q<HTMLAnchorElement>(el, S.feedChannelLink);
  const channelKey = channelKeyFrom(channelLink?.getAttribute('href') ?? null);
  const channelName = (q(el, S.feedChannelName)?.textContent ?? channelLink?.textContent ?? '').trim();
  const avatarImg = q<HTMLImageElement>(el, S.feedAvatar);
  const avatar = avatarImg?.getAttribute('src') || null;
  const duration = durationOf(el);

  // The age is the last parseable metadata text: earlier ones are the channel name and views,
  // and a channel called "24 Hour Cooking" must not be read as an age.
  let age: number | null = null;
  let ageEl: HTMLElement | null = null;
  for (const sel of S.feedMetaText) {
    for (const m of el.querySelectorAll<HTMLElement>(sel)) {
      const a = parseRelativeAge(m.textContent ?? '');
      if (a !== null) {
        age = a;
        ageEl = m;
      }
    }
    if (ageEl) break;
  }

  return {
    el,
    href,
    vid,
    type: typeOf(el, href, duration),
    title,
    channelKey,
    channelName,
    avatar: avatar && !avatar.startsWith('data:') ? avatar : null,
    duration,
    age,
    ageEl,
    progress: progressOf(el),
    members: !!el.querySelector(S.feedMembersMarker.join(',')),
    thumbEl: q(el, S.feedThumb),
  };
}

/** Current page kind, from the URL (cheap and synchronous). */
export type PageKind = 'subscriptions' | 'home' | 'channel' | 'search' | 'watch' | 'other';

export function pageKind(pathname = location.pathname): PageKind {
  if (pathname === '/feed/subscriptions') return 'subscriptions';
  if (pathname === '/') return 'home';
  if (pathname === '/results') return 'search';
  if (pathname === '/watch') return 'watch';
  if (/^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/.test(pathname)) return 'channel';
  return 'other';
}

/** The visible results container for a page, and the item selector inside it. */
export function feedContainer(kind: PageKind): { root: HTMLElement; items: string } | null {
  if (kind === 'search') {
    const root = q(document, S.searchResults);
    return root ? { root, items: S.searchItem.join(',') } : null;
  }
  const browse = q(document, S.activeBrowse);
  const root = browse ? q(browse, S.richGridContents) : null;
  return root ? { root, items: S.richItem.join(',') } : null;
}
