/**
 * SponsorBlock data model (own implementation of the public API; read-only in v1). Categories are
 * data-driven so new ones only need an entry here. Submission is out of scope but the segment
 * model keeps the UUID so voting/submitting can be added later.
 */

export const SB_API = 'https://sponsor.ajay.app/api';

export const SB_ACTIONS = ['skip', 'button', 'timeline', 'off'] as const;
export type SbAction = (typeof SB_ACTIONS)[number];

export interface SbCategoryDef {
  id: string;
  /** Default action and color (SponsorBlock's conventional palette). */
  action: SbAction;
  color: string;
  /** Segment kinds: normal ranges, a single point (highlight) or the whole video. */
  kind: 'range' | 'point' | 'full';
}

export const SB_CATEGORIES = [
  { id: 'sponsor', action: 'skip', color: '#00d400', kind: 'range' },
  { id: 'selfpromo', action: 'button', color: '#ffff00', kind: 'range' },
  { id: 'interaction', action: 'button', color: '#cc00ff', kind: 'range' },
  { id: 'intro', action: 'button', color: '#00ffff', kind: 'range' },
  { id: 'outro', action: 'button', color: '#0202ed', kind: 'range' },
  { id: 'preview', action: 'timeline', color: '#008fd6', kind: 'range' },
  { id: 'hook', action: 'timeline', color: '#395699', kind: 'range' },
  { id: 'filler', action: 'timeline', color: '#7300ff', kind: 'range' },
  { id: 'music_offtopic', action: 'button', color: '#ff9900', kind: 'range' },
  { id: 'poi_highlight', action: 'timeline', color: '#ff1684', kind: 'point' },
  { id: 'exclusive_access', action: 'timeline', color: '#008a5c', kind: 'full' },
] as const satisfies readonly SbCategoryDef[];

export type SbCategory = (typeof SB_CATEGORIES)[number]['id'];

export interface SbSegment {
  category: SbCategory;
  actionType: 'skip' | 'mute' | 'full' | 'poi' | 'chapter';
  start: number;
  end: number;
  UUID: string;
  votes: number;
  locked: boolean;
}

/** API response item for the hash-prefix endpoint. */
interface ApiVideo {
  videoID?: unknown;
  segments?: Array<{
    category?: unknown;
    actionType?: unknown;
    segment?: unknown;
    UUID?: unknown;
    votes?: unknown;
    locked?: unknown;
  }>;
}

const KNOWN = new Set<string>(SB_CATEGORIES.map((c) => c.id));

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Builds the privacy-preserving request URL: only a 4-char hash prefix leaves the device. */
export function segmentsUrl(hashPrefix: string, categories: readonly string[]): string {
  const params = new URLSearchParams({
    categories: JSON.stringify(categories),
    actionTypes: JSON.stringify(['skip', 'mute', 'full', 'poi']),
  });
  return `${SB_API}/skipSegments/${hashPrefix}?${params}`;
}

/** Picks the exact video out of a hash-prefix response and validates every field. */
export function parseSegments(body: unknown, videoId: string): SbSegment[] {
  if (!Array.isArray(body)) return [];
  const video = (body as ApiVideo[]).find((v) => v && v.videoID === videoId);
  if (!video || !Array.isArray(video.segments)) return [];
  const out: SbSegment[] = [];
  for (const s of video.segments) {
    const cat = typeof s.category === 'string' ? s.category : '';
    const seg = Array.isArray(s.segment) ? s.segment : [];
    const start = Number(seg[0]);
    const end = Number(seg[1]);
    if (!KNOWN.has(cat) || !Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const actionType = s.actionType;
    out.push({
      category: cat as SbCategory,
      actionType:
        actionType === 'mute' || actionType === 'full' || actionType === 'poi' || actionType === 'chapter'
          ? actionType
          : 'skip',
      start,
      end,
      UUID: typeof s.UUID === 'string' ? s.UUID.slice(0, 80) : '',
      votes: Number.isFinite(Number(s.votes)) ? Number(s.votes) : 0,
      locked: s.locked === 1 || s.locked === true,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Merges overlapping/adjacent skip ranges so one skip clears back-to-back segments. */
export function mergeRanges(
  segs: ReadonlyArray<Pick<SbSegment, 'start' | 'end'>>,
  gap = 0.5,
): Array<{ start: number; end: number }> {
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + gap) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

/* ---------- Return YouTube Dislike ---------- */

export const RYD_API = 'https://returnyoutubedislikeapi.com';

export interface Votes {
  likes: number;
  dislikes: number;
  rating: number;
  viewCount: number;
}

export function parseVotes(body: unknown): Votes | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const n = (k: string): number => (Number.isFinite(Number(b[k])) ? Number(b[k]) : NaN);
  const v = { likes: n('likes'), dislikes: n('dislikes'), rating: n('rating'), viewCount: n('viewCount') };
  return Number.isFinite(v.dislikes) && Number.isFinite(v.likes) ? v : null;
}

/** YouTube-style counts: "1.2K", "3.4M" (compact) or "1,234" (full), locale-aware. */
export function formatCount(n: number, compact: boolean, locale?: string): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(
    locale,
    compact ? { notation: 'compact', maximumFractionDigits: 1 } : {},
  ).format(n);
}
