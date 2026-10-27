/**
 * Pure feed logic shared by the content script and tests: item model, filter evaluation,
 * keyword rules, channel-strip ordering and badge counts.
 */
import type { FeedSettings, SubscriptionsSettings } from './settings-schema';

export const FEED_TYPES = ['video', 'short', 'live', 'premiere', 'upcoming'] as const;
export type FeedType = (typeof FEED_TYPES)[number];

export const FEED_TABS = ['all', 'videos', 'shorts', 'live', 'premieres', 'upcoming'] as const;
export type FeedTab = (typeof FEED_TABS)[number];

const TAB_TYPE: Readonly<Record<Exclude<FeedTab, 'all'>, FeedType>> = {
  videos: 'video',
  shorts: 'short',
  live: 'live',
  premieres: 'premiere',
  upcoming: 'upcoming',
};

export interface FeedItemData {
  vid: string;
  type: FeedType;
  title: string;
  channelKey: string | null;
  channelName: string;
  avatar: string | null;
  /** Seconds, or null when unknown (live, upcoming, shorts without badge). */
  duration: number | null;
  /** Minutes since upload, or null when unknown. */
  age: number | null;
  /** 0–100 from YouTube's own resume bar. */
  progress: number;
  members: boolean;
}

export interface LocalState {
  /** Locally recorded progress (0–100). */
  p?: number;
  /** Manually marked as watched. */
  w?: 1;
  /** Manually hidden. */
  h?: 1;
  t: number;
}

export type KeywordRule = (title: string) => boolean;

/** One rule per line; "/expr/flags" is a regex, anything else a case-insensitive substring. */
export function compileKeywords(text: string): KeywordRule[] {
  const rules: KeywordRule[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const re = /^\/(.+)\/([a-z]*)$/.exec(line);
    if (re) {
      try {
        const rx = new RegExp(re[1]!, re[2]!.replace(/[gy]/g, ''));
        rules.push((t) => rx.test(t));
        continue;
      } catch {
        // Invalid regex: treat the line literally.
      }
    }
    const needle = line.toLowerCase();
    rules.push((t) => t.toLowerCase().includes(needle));
  }
  return rules;
}

export function isWatched(item: FeedItemData, local: LocalState | undefined, threshold: number): boolean {
  if (local?.w) return true;
  return Math.max(item.progress, local?.p ?? 0) >= threshold;
}

export interface FilterContext {
  /** Subscriptions-page filters apply only on that page. */
  subsPage: boolean;
  subs: SubscriptionsSettings;
  feed: FeedSettings;
  tab: FeedTab;
  channels: ReadonlySet<string>;
  keywords: readonly KeywordRule[];
}

/** Why an item is filtered out (null = visible). Watched/hidden handling is separate. */
export function filterReason(item: FeedItemData, ctx: FilterContext): string | null {
  if (!ctx.subsPage) return null;
  if (ctx.channels.size && (!item.channelKey || !ctx.channels.has(item.channelKey))) return 'channel';
  if (ctx.tab !== 'all' && item.type !== TAB_TYPE[ctx.tab]) return 'tab';
  if (ctx.subs.hideMembersOnly && item.members) return 'members';
  if (item.duration !== null && item.type === 'video') {
    if (ctx.subs.minDuration > 0 && item.duration < ctx.subs.minDuration * 60) return 'short-duration';
    if (ctx.subs.maxDuration > 0 && item.duration > ctx.subs.maxDuration * 60) return 'long-duration';
  }
  if (ctx.keywords.length && ctx.keywords.some((r) => r(item.title))) return 'keyword';
  return null;
}

export function tabCounts(items: readonly FeedItemData[]): Record<FeedTab, number> {
  const out = { all: items.length, videos: 0, shorts: 0, live: 0, premieres: 0, upcoming: 0 };
  for (const i of items) {
    const tab = (Object.keys(TAB_TYPE) as Array<Exclude<FeedTab, 'all'>>).find((k) => TAB_TYPE[k] === i.type);
    if (tab) out[tab]++;
  }
  return out;
}

export interface StripChannel {
  key: string;
  name: string;
  avatar: string | null;
  /** Unwatched videos newer than the previous visit. */
  fresh: number;
  total: number;
  pinned: boolean;
}

/**
 * Channels in strip order: pinned first (in pinned order), then the user's drag order, then the
 * remaining channels by first appearance in the feed (i.e. most recent upload first).
 */
export function stripChannels(
  items: readonly FeedItemData[],
  subs: Pick<SubscriptionsSettings, 'pinned' | 'order'>,
  isFresh: (item: FeedItemData) => boolean,
): StripChannel[] {
  const byKey = new Map<string, StripChannel>();
  for (const item of items) {
    if (!item.channelKey) continue;
    let c = byKey.get(item.channelKey);
    if (!c) {
      c = {
        key: item.channelKey,
        name: item.channelName,
        avatar: item.avatar,
        fresh: 0,
        total: 0,
        pinned: false,
      };
      byKey.set(item.channelKey, c);
    }
    if (!c.avatar && item.avatar) c.avatar = item.avatar;
    if (!c.name && item.channelName) c.name = item.channelName;
    c.total++;
    if (isFresh(item)) c.fresh++;
  }
  const rank = (key: string): number => {
    const p = subs.pinned.indexOf(key);
    if (p !== -1) return p;
    const o = subs.order.indexOf(key);
    return o !== -1 ? 10_000 + o : Number.POSITIVE_INFINITY;
  };
  const feedOrder = [...byKey.keys()];
  return feedOrder
    .map((key) => ({ ...byKey.get(key)!, pinned: subs.pinned.includes(key) }))
    .sort((a, b) => rank(a.key) - rank(b.key) || feedOrder.indexOf(a.key) - feedOrder.indexOf(b.key));
}

/** New order after dragging `key` before `beforeKey` (null = to the end), for non-pinned channels. */
export function reorder(current: readonly string[], key: string, beforeKey: string | null): string[] {
  const list = current.filter((k) => k !== key);
  const at = beforeKey === null ? -1 : list.indexOf(beforeKey);
  list.splice(at === -1 ? list.length : at, 0, key);
  return list;
}

/** Keeps the most recent `max` entries of a local state map. */
export function pruneState(state: Record<string, LocalState>, max: number): Record<string, LocalState> {
  const entries = Object.entries(state);
  if (entries.length <= max) return state;
  entries.sort((a, b) => b[1].t - a[1].t);
  return Object.fromEntries(entries.slice(0, max));
}
