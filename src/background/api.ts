/**
 * Network proxy for the only two external APIs BetterYT talks to (SponsorBlock, Return YouTube
 * Dislike). Runs in the service worker so content scripts never make cross-origin requests.
 * Responses are cached in memory and in chrome.storage.session (survives worker restarts, cleared
 * when the browser closes), with LRU eviction.
 */
import { loadSettings } from '../shared/storage';
import {
  parseSegments,
  parseVotes,
  RYD_API,
  segmentsUrl,
  sha256Hex,
  type SbSegment,
  type Votes,
} from '../shared/sponsorblock';
import type { ApiLogEntry } from '../shared/messages';

interface Entry<T> {
  at: number;
  value: T;
}

class TtlCache<T> {
  private readonly mem = new Map<string, Entry<T>>();
  constructor(
    private readonly name: string,
    private readonly ttlMs: number,
    private readonly max: number,
  ) {}

  async get(key: string): Promise<T | undefined> {
    let e = this.mem.get(key);
    if (!e) {
      try {
        const r = await chrome.storage.session.get(`${this.name}:${key}`);
        e = r[`${this.name}:${key}`] as Entry<T> | undefined;
      } catch {}
    }
    if (!e || Date.now() - e.at > this.ttlMs) return undefined;
    // Refresh LRU position.
    this.mem.delete(key);
    this.mem.set(key, e);
    return e.value;
  }

  async set(key: string, value: T): Promise<void> {
    const e = { at: Date.now(), value };
    this.mem.delete(key);
    this.mem.set(key, e);
    while (this.mem.size > this.max) {
      const oldest = this.mem.keys().next().value as string;
      this.mem.delete(oldest);
      void chrome.storage.session.remove(`${this.name}:${oldest}`).catch(() => undefined);
    }
    await chrome.storage.session.set({ [`${this.name}:${key}`]: e }).catch(() => undefined);
  }
}

const sbCache = new TtlCache<SbSegment[]>('sb', 60 * 60_000, 500);
const rydCache = new TtlCache<Votes | null>('ryd', 30 * 60_000, 500);

/** Last requests, for the diagnostics view on the Data & Privacy page. */
const log: ApiLogEntry[] = [];
function record(api: ApiLogEntry['api'], status: ApiLogEntry['status'], detail: string): void {
  log.unshift({ api, at: Date.now(), status, detail });
  log.length = Math.min(log.length, 50);
}

export function apiLog(): ApiLogEntry[] {
  return [...log];
}

const VIDEO_ID = /^[\w-]{11}$/;

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  // SponsorBlock answers 404 when no video in the prefix bucket has segments.
  if (res.status === 404) return { status: 404, body: [] };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { status: res.status, body: await res.json() };
}

export async function getSegments(videoId: string, categories: string[]): Promise<SbSegment[]> {
  if (!VIDEO_ID.test(videoId)) return [];
  const settings = await loadSettings();
  if (!settings.general.enabled || !settings.sponsorblock.enabled) return [];
  const cats = [...new Set(categories)].filter((c) => /^[a-z_]{2,30}$/.test(c)).sort();
  if (!cats.length) return [];
  const key = `${videoId}:${cats.join(',')}`;
  const cached = await sbCache.get(key);
  if (cached) {
    record('sponsorblock', 'cache', videoId);
    return cached;
  }
  try {
    const prefix = (await sha256Hex(videoId)).slice(0, 4);
    const { body } = await fetchJson(segmentsUrl(prefix, cats));
    const segments = parseSegments(body, videoId);
    await sbCache.set(key, segments);
    record('sponsorblock', 'network', `${videoId} → ${segments.length} segments (prefix ${prefix})`);
    return segments;
  } catch (e) {
    record('sponsorblock', 'error', `${videoId}: ${String(e)}`);
    throw e;
  }
}

export async function getVotes(videoId: string): Promise<Votes | null> {
  if (!VIDEO_ID.test(videoId)) return null;
  const settings = await loadSettings();
  if (!settings.general.enabled || !settings.dislikes.enabled) return null;
  const cached = await rydCache.get(videoId);
  if (cached !== undefined) {
    record('ryd', 'cache', videoId);
    return cached;
  }
  try {
    const { status, body } = await fetchJson(`${RYD_API}/votes?videoId=${encodeURIComponent(videoId)}`);
    const votes = status === 404 ? null : parseVotes(body);
    await rydCache.set(videoId, votes);
    record('ryd', 'network', `${videoId} → ${votes ? `${votes.dislikes} dislikes` : 'no data'}`);
    return votes;
  } catch (e) {
    record('ryd', 'error', `${videoId}: ${String(e)}`);
    throw e;
  }
}
