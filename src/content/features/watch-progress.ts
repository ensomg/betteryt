import { recordProgress } from '../../shared/watched-store';
import { addWatch, loadStats, saveStats } from '../../shared/watch-stats';
import type { Settings } from '../../shared/settings-schema';
import { onNavigate } from '../nav';
import { registry, type Feature } from './registry';

/**
 * Records how far you watched each video (locally only) so feeds can treat it as watched even
 * when YouTube's own progress bar is missing (signed out, history paused, Shorts...).
 * Event-driven: samples at most every 15 s on timeupdate, plus on pause/ended/leave.
 */

const ID = 'watch-progress';
const SAMPLE_MS = 15_000;

let video: HTMLVideoElement | null = null;
let lastSample = 0;
let offNav: (() => void) | null = null;

function currentVid(): string | null {
  if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v');
  const shorts = /^\/shorts\/([\w-]+)/.exec(location.pathname);
  return shorts ? shorts[1]! : null;
}

/**
 * Last observed {video, percent}. Updated on every timeupdate (no storage cost) and flushed on a
 * throttle, so a flush after SPA navigation still credits the video that was actually playing
 * (by then the URL already points at the next one).
 */
let lastKnown: { vid: string; pct: number } | null = null;
let settings: Settings | null = null;

/* ---------- Watch-time statistics (local only) ---------- */

/** Wall-clock seconds watched since the last flush, per channel key ('' = unknown). */
const pending = new Map<string, { name: string; secs: number }>();
let lastTick = 0;

function currentChannel(): { key: string; name: string } | null {
  const a = document.querySelector<HTMLAnchorElement>(
    'ytd-watch-metadata ytd-channel-name a[href], ytd-reel-player-overlay-renderer a[href^="/@"]',
  );
  const m = /^(\/(?:@[^/?#]+|channel\/[\w-]+))/.exec(a?.getAttribute('href') ?? '');
  return m ? { key: decodeURIComponent(m[1]!), name: (a?.textContent ?? '').trim() } : null;
}

function tickWatchTime(v: HTMLVideoElement): void {
  const now = performance.now();
  const playing = !v.paused && !v.ended && v.readyState > 2;
  if (playing && lastTick) {
    // Cap gaps (sleep, throttled background tabs) at 2 s per tick.
    const secs = Math.min(now - lastTick, 2000) / 1000;
    const ch = currentChannel();
    const key = ch?.key ?? '';
    const entry = pending.get(key) ?? { name: ch?.name ?? '', secs: 0 };
    entry.secs += secs;
    pending.set(key, entry);
  }
  lastTick = playing ? now : 0;
}

async function flushWatchTime(): Promise<void> {
  if (!pending.size || settings?.player.watchStats === false) {
    pending.clear();
    return;
  }
  const batch = [...pending.entries()];
  pending.clear();
  let stats = await loadStats();
  for (const [key, v] of batch) stats = addWatch(stats, v.secs, key ? { key, name: v.name } : null);
  await saveStats(stats).catch(() => undefined);
}

function observe(): void {
  const v = video;
  if (v) tickWatchTime(v);
  const vid = currentVid();
  if (!v || !vid || !Number.isFinite(v.duration) || v.duration <= 0) return; // live streams have no duration
  // An ended video counts as fully watched even if the last second wasn't reported.
  lastKnown = { vid, pct: v.ended ? 100 : (v.currentTime / v.duration) * 100 };
}

function sample(force = false): void {
  if (!force) observe();
  const now = Date.now();
  if (!lastKnown || (!force && now - lastSample < SAMPLE_MS)) return;
  lastSample = now;
  if (lastKnown.pct >= 1 && settings?.feed.applyTo.length !== 0)
    void recordProgress(lastKnown.vid, lastKnown.pct);
  void flushWatchTime();
}

const onTime = registry.guard(ID, () => sample());
const onFlush = registry.guard(ID, () => {
  observe();
  sample(true);
});
const onHidden = registry.guard(ID, () => {
  if (document.visibilityState === 'hidden') {
    observe();
    sample(true);
  }
});

function attach(): void {
  const next = document.querySelector<HTMLVideoElement>(
    '#movie_player video.html5-main-video, ytd-player video, video.html5-main-video',
  );
  if (next === video) return;
  detach();
  video = next;
  if (!video) return;
  video.addEventListener('timeupdate', onTime, { passive: true });
  video.addEventListener('pause', onFlush);
  video.addEventListener('ended', onFlush);
}

function detach(): void {
  if (!video) return;
  video.removeEventListener('timeupdate', onTime);
  video.removeEventListener('pause', onFlush);
  video.removeEventListener('ended', onFlush);
  video = null;
}

const onNav = registry.guard(ID, () => {
  // Flush the previous video (lastKnown), then start fresh for the new one.
  sample(true);
  lastKnown = null;
  lastSample = 0;
  attach();
});

export const watchProgress: Feature = {
  id: ID,
  enabled: (s) => s.subs.enabled || s.feed.applyTo.length > 0 || s.player.watchStats,
  init(s) {
    settings = s;
    offNav = onNavigate(onNav);
    document.addEventListener('visibilitychange', onHidden);
    attach();
  },
  update(s) {
    settings = s;
    attach();
  },
  destroy() {
    sample(true);
    detach();
    offNav?.();
    offNav = null;
    document.removeEventListener('visibilitychange', onHidden);
  },
};
