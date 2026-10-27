import { describe, expect, it } from 'vitest';
import {
  formatCount,
  mergeRanges,
  parseSegments,
  parseVotes,
  segmentsUrl,
  sha256Hex,
} from '../src/shared/sponsorblock';
import { DEFAULTS, setPath, validate } from '../src/shared/settings-schema';

describe('SponsorBlock hash prefix', () => {
  it('hashes the video id with SHA-256 and sends only 4 hex chars', async () => {
    const hash = await sha256Hex('dQw4w9WgXcQ');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const url = segmentsUrl(hash.slice(0, 4), ['sponsor', 'intro']);
    expect(url).toMatch(/^https:\/\/sponsor\.ajay\.app\/api\/skipSegments\/[0-9a-f]{4}\?/);
    expect(url).not.toContain('dQw4w9WgXcQ');
    expect(decodeURIComponent(url)).toContain('categories=["sponsor","intro"]');
  });
});

describe('parseSegments', () => {
  const body = [
    { videoID: 'otherVideo1', segments: [{ category: 'sponsor', segment: [1, 2], UUID: 'x' }] },
    {
      videoID: 'dQw4w9WgXcQ',
      segments: [
        { category: 'intro', actionType: 'skip', segment: [0, 10], UUID: 'b', votes: 3, locked: 0 },
        { category: 'sponsor', actionType: 'skip', segment: [30.5, 61], UUID: 'a', votes: 12, locked: 1 },
        { category: 'sponsor', actionType: 'skip', segment: [70, 65], UUID: 'bad-order' },
        { category: 'unknown_cat', segment: [1, 2], UUID: 'c' },
        { category: 'poi_highlight', actionType: 'poi', segment: [100, 100], UUID: 'd' },
        { category: 'sponsor', segment: ['x', 5], UUID: 'nan' },
      ],
    },
  ];

  it('keeps only the exact video and valid, known segments, sorted', () => {
    const segs = parseSegments(body, 'dQw4w9WgXcQ');
    expect(segs.map((s) => s.UUID)).toEqual(['b', 'a', 'd']);
    expect(segs[1]).toMatchObject({ category: 'sponsor', start: 30.5, end: 61, votes: 12, locked: true });
    expect(segs[2]).toMatchObject({ actionType: 'poi', start: 100, end: 100 });
  });

  it('returns nothing for other ids or garbage', () => {
    expect(parseSegments(body, 'nope')).toEqual([]);
    expect(parseSegments({ not: 'array' }, 'dQw4w9WgXcQ')).toEqual([]);
  });

  it('merges adjacent skip ranges', () => {
    expect(
      mergeRanges([
        { start: 0, end: 10 },
        { start: 10.3, end: 20 },
        { start: 40, end: 50 },
      ]),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 40, end: 50 },
    ]);
  });
});

describe('Return YouTube Dislike', () => {
  it('parses votes defensively', () => {
    expect(parseVotes({ likes: 10, dislikes: 2, rating: 4.3, viewCount: 99 })).toEqual({
      likes: 10,
      dislikes: 2,
      rating: 4.3,
      viewCount: 99,
    });
    expect(parseVotes({ likes: 'x' })).toBeNull();
    expect(parseVotes(null)).toBeNull();
  });

  it('formats counts like YouTube', () => {
    expect(formatCount(1234, true, 'en-US')).toBe('1.2K');
    expect(formatCount(3_400_000, true, 'en-US')).toBe('3.4M');
    expect(formatCount(1234, false, 'en-US')).toBe('1,234');
    expect(formatCount(NaN, true, 'en-US')).toBe('—');
  });
});

describe('SponsorBlock settings', () => {
  it('validates per-category actions and colors', () => {
    const s = validate({
      sponsorblock: {
        categories: {
          sponsor: { action: 'explode', color: 'red' },
          intro: { action: 'skip', color: '#123456' },
        },
      },
    });
    expect(s.sponsorblock.categories.sponsor).toEqual(DEFAULTS.sponsorblock.categories.sponsor);
    expect(s.sponsorblock.categories.intro).toEqual({ action: 'skip', color: '#123456' });
  });

  it('validates whitelist entries', () => {
    const s = setPath(DEFAULTS, 'sponsorblock.whitelistVideos', ['dQw4w9WgXcQ', 'too-short', '<script>']);
    expect(s.sponsorblock.whitelistVideos).toEqual(['dQw4w9WgXcQ']);
  });
});
