import { describe, expect, it } from 'vitest';
import { absoluteDate, dateGroup, fillAges, parseDuration, parseRelativeAge } from '../src/shared/feed-time';
import {
  compileKeywords,
  filterReason,
  isWatched,
  pruneState,
  reorder,
  stripChannels,
  tabCounts,
  type FeedItemData,
  type FilterContext,
} from '../src/shared/feed-filter';
import { DEFAULTS, setPath, validate } from '../src/shared/settings-schema';

const item = (over: Partial<FeedItemData> = {}): FeedItemData => ({
  vid: 'abc123def45',
  type: 'video',
  title: 'A video',
  channelKey: '/@chan',
  channelName: 'Chan',
  avatar: null,
  duration: 600,
  age: 60,
  progress: 0,
  members: false,
  ...over,
});

const ctx = (over: Partial<FilterContext> = {}): FilterContext => ({
  subsPage: true,
  subs: DEFAULTS.subs,
  feed: DEFAULTS.feed,
  tab: 'all',
  channels: new Set(),
  keywords: [],
  ...over,
});

describe('parseDuration', () => {
  it('parses badges', () => {
    expect(parseDuration('12:34')).toBe(754);
    expect(parseDuration(' 1:02:03 ')).toBe(3723);
    expect(parseDuration('0:59')).toBe(59);
  });
  it('rejects non-durations', () => {
    expect(parseDuration('LIVE')).toBeNull();
    expect(parseDuration('12')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });
});

describe('parseRelativeAge', () => {
  it.each([
    ['3 days ago', 3 * 1440],
    ['Streamed 2 hours ago', 120],
    ['1 year ago', 525600],
    ['vor 3 Tagen', 3 * 1440],
    ['hace 2 semanas', 2 * 10080],
    ['il y a 5 minutes', 5],
    ['3 gün önce', 3 * 1440],
    ['2 ay önce', 2 * 43200],
    ['4 giorni fa', 4 * 1440],
    ['há 6 meses', 6 * 43200],
    ['7 uur geleden', 7 * 60],
    ['3 дня назад', 3 * 1440],
    ['il y a 2 ans', 2 * 525600],
  ])('%s', (text, minutes) => {
    expect(parseRelativeAge(text)).toBe(minutes);
  });

  it('ignores view counts and unknown text', () => {
    expect(parseRelativeAge('12K views')).toBeNull();
    expect(parseRelativeAge('Scheduled for 10/30/26')).toBeNull();
  });
});

describe('date groups', () => {
  const now = new Date(2026, 9, 27, 15, 0); // Tue 15:00

  it('groups by calendar day', () => {
    expect(dateGroup(60, now)).toBe('today');
    expect(dateGroup(16 * 60, now)).toBe('yesterday'); // 23:00 the day before
    expect(dateGroup(3 * 1440, now)).toBe('week');
    expect(dateGroup(30 * 1440, now)).toBe('earlier');
  });

  it('fills unknown ages from the item above', () => {
    expect(fillAges([10, null, 30, null, null])).toEqual([10, 10, 30, 30, 30]);
    expect(fillAges([null, 5])).toEqual([null, 5]);
  });

  it('formats estimated absolute dates', () => {
    expect(absoluteDate(3 * 1440, now, 'en-US')).toBe('Oct 24');
    expect(absoluteDate(400 * 1440, now, 'en-US')).toContain('2025');
  });
});

describe('filters', () => {
  it('filters by channel, tab, members, duration and keywords', () => {
    expect(filterReason(item(), ctx())).toBeNull();
    expect(filterReason(item(), ctx({ channels: new Set(['/@other']) }))).toBe('channel');
    expect(filterReason(item({ type: 'short' }), ctx({ tab: 'videos' }))).toBe('tab');
    expect(filterReason(item({ type: 'short' }), ctx({ tab: 'shorts' }))).toBeNull();
    expect(filterReason(item({ type: 'premiere' }), ctx({ tab: 'premieres' }))).toBeNull();
    const subs = { ...DEFAULTS.subs, hideMembersOnly: true, minDuration: 5, maxDuration: 20 };
    expect(filterReason(item({ members: true }), ctx({ subs }))).toBe('members');
    expect(filterReason(item({ duration: 120 }), ctx({ subs }))).toBe('short-duration');
    expect(filterReason(item({ duration: 3600 }), ctx({ subs }))).toBe('long-duration');
    expect(filterReason(item({ type: 'live', duration: null }), ctx({ subs }))).toBeNull();
    expect(
      filterReason(item({ title: 'My REACTION video' }), ctx({ keywords: compileKeywords('reaction') })),
    ).toBe('keyword');
  });

  it('never filters outside the subscriptions page', () => {
    expect(filterReason(item(), ctx({ subsPage: false, channels: new Set(['/@x']) }))).toBeNull();
  });

  it('compiles regex and literal keyword rules safely', () => {
    const rules = compileKeywords('/^\\[live\\]/i\n  \n(unbalanced\n/[bad/');
    expect(rules).toHaveLength(3);
    expect(rules[0]!('[LIVE] now')).toBe(true);
    expect(rules[1]!('so (unbalanced')).toBe(true);
    expect(rules[2]!('a /[bad/ title')).toBe(true);
  });

  it('decides watched from YouTube progress, local progress or manual mark', () => {
    expect(isWatched(item({ progress: 85 }), undefined, 80)).toBe(true);
    expect(isWatched(item({ progress: 10 }), { p: 90, t: 0 }, 80)).toBe(true);
    expect(isWatched(item(), { w: 1, t: 0 }, 80)).toBe(true);
    expect(isWatched(item({ progress: 50 }), undefined, 80)).toBe(false);
  });

  it('counts tabs', () => {
    const c = tabCounts([
      item(),
      item({ type: 'short' }),
      item({ type: 'short' }),
      item({ type: 'upcoming' }),
    ]);
    expect(c).toMatchObject({ all: 4, videos: 1, shorts: 2, upcoming: 1, live: 0 });
  });
});

describe('channel strip', () => {
  const items = [
    item({ channelKey: '/@a', channelName: 'A', age: 10 }),
    item({ channelKey: '/@b', channelName: 'B', age: 20 }),
    item({ channelKey: '/@a', channelName: 'A', age: 30 }),
    item({ channelKey: '/@c', channelName: 'C', age: 5000 }),
  ];

  it('orders pinned, then custom order, then feed order, with fresh counts', () => {
    const out = stripChannels(items, { pinned: ['/@c'], order: ['/@b'] }, (i) => (i.age ?? 0) < 100);
    expect(out.map((c) => c.key)).toEqual(['/@c', '/@b', '/@a']);
    expect(out.find((c) => c.key === '/@a')).toMatchObject({ fresh: 2, total: 2, pinned: false });
    expect(out[0]!.pinned).toBe(true);
  });

  it('reorders by drag target', () => {
    expect(reorder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(reorder(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a']);
  });
});

describe('settings & local state', () => {
  it('validates channel keys and page scopes', () => {
    const s = setPath(DEFAULTS, 'subs.pinned', [
      '/@good',
      '/channel/UC123',
      'javascript:alert(1)',
      '/@bad/../x',
      42,
    ]);
    expect(s.subs.pinned).toEqual(['/@good', '/channel/UC123']);
    const t = validate({
      feed: { applyTo: ['home', 'evil', 'search'], watched: 'explode', watchedThreshold: 0 },
    });
    expect(t.feed.applyTo).toEqual(['home', 'search']);
    expect(t.feed.watched).toBe(DEFAULTS.feed.watched);
    expect(t.feed.watchedThreshold).toBe(DEFAULTS.feed.watchedThreshold);
  });

  it('prunes the oldest local entries', () => {
    const state = { a: { t: 1 }, b: { t: 3 }, c: { t: 2 } };
    expect(Object.keys(pruneState(state, 2)).sort()).toEqual(['b', 'c']);
  });
});
