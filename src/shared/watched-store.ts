/**
 * Local per-video state (watched progress, manual "watched" / "hidden" marks) in
 * chrome.storage.local. Never synced, never sent anywhere. Capped to the most recent entries.
 */
import { pruneState, type LocalState } from './feed-filter';

const KEY = 'feedState';
const VISIT_KEY = 'subsVisit';
const MAX_ENTRIES = 5000;

let cache: Record<string, LocalState> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export async function loadState(): Promise<Record<string, LocalState>> {
  if (cache) return cache;
  try {
    const r = await chrome.storage.local.get(KEY);
    const v = r[KEY];
    cache = v && typeof v === 'object' ? (v as Record<string, LocalState>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function getState(vid: string): LocalState | undefined {
  return cache?.[vid];
}

function scheduleWrite(): void {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    if (!cache) return;
    cache = pruneState(cache, MAX_ENTRIES);
    void chrome.storage.local.set({ [KEY]: cache }).catch(() => undefined);
  }, 400);
}

/** Merges `patch` into a video's state (undefined fields delete marks). */
export async function updateState(vid: string, patch: Partial<Omit<LocalState, 't'>>): Promise<void> {
  const state = await loadState();
  const next: LocalState = { ...state[vid], ...patch, t: Date.now() };
  for (const k of ['p', 'w', 'h'] as const) if (next[k] === undefined) delete next[k];
  if (next.p === undefined && !next.w && !next.h) delete state[vid];
  else state[vid] = next;
  scheduleWrite();
  for (const l of listeners) l();
}

/** Records locally-watched progress; only ever increases. */
export async function recordProgress(vid: string, percent: number): Promise<void> {
  const state = await loadState();
  const p = Math.round(Math.min(100, Math.max(0, percent)));
  if ((state[vid]?.p ?? 0) >= p) return;
  await updateState(vid, { p });
}

export function onStateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Other tabs / the options page cleared or changed the store. */
if (typeof chrome !== 'undefined')
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY]) return;
    const v = changes[KEY].newValue;
    cache = v && typeof v === 'object' ? (v as Record<string, LocalState>) : {};
    for (const l of listeners) l();
  });

export async function clearState(): Promise<void> {
  cache = {};
  await chrome.storage.local.remove([KEY, VISIT_KEY]);
  for (const l of listeners) l();
}

export async function stateSize(): Promise<number> {
  return Object.keys(await loadState()).length;
}

/**
 * Subscriptions-visit bookkeeping for "new since last visit" badges. Returns the previous visit
 * time. A visit only rolls over after 30 minutes, so SPA back-and-forth doesn't reset badges.
 */
export async function touchVisit(now = Date.now()): Promise<number | null> {
  try {
    const r = await chrome.storage.local.get(VISIT_KEY);
    const v = r[VISIT_KEY] as { prev: number | null; last: number } | undefined;
    if (v && now - v.last < 30 * 60_000) {
      await chrome.storage.local.set({ [VISIT_KEY]: { prev: v.prev, last: now } });
      return v.prev;
    }
    await chrome.storage.local.set({ [VISIT_KEY]: { prev: v?.last ?? null, last: now } });
    return v?.last ?? null;
  } catch {
    return null;
  }
}
