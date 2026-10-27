/**
 * Local watch-time statistics (seconds watched per day and per channel). Stored only in
 * chrome.storage.local; viewable and exportable as CSV from the options page.
 */

const KEY = 'watchStats';
const MAX_CHANNELS = 500;
const MAX_DAYS = 400;

export interface WatchStats {
  days: Record<string, number>;
  channels: Record<string, { name: string; secs: number }>;
}

export function emptyStats(): WatchStats {
  return { days: {}, channels: {} };
}

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pure merge of watched seconds into stats, with caps. */
export function addWatch(
  stats: WatchStats,
  secs: number,
  channel: { key: string; name: string } | null,
  day = dayKey(),
): WatchStats {
  if (!(secs > 0)) return stats;
  const days = { ...stats.days, [day]: (stats.days[day] ?? 0) + secs };
  const dayKeys = Object.keys(days).sort();
  while (dayKeys.length > MAX_DAYS) delete days[dayKeys.shift()!];
  const channels = { ...stats.channels };
  if (channel) {
    const prev = channels[channel.key];
    channels[channel.key] = {
      name: channel.name || prev?.name || channel.key,
      secs: (prev?.secs ?? 0) + secs,
    };
    const keys = Object.keys(channels);
    if (keys.length > MAX_CHANNELS) {
      keys.sort((a, b) => channels[a]!.secs - channels[b]!.secs);
      for (const k of keys.slice(0, keys.length - MAX_CHANNELS)) delete channels[k];
    }
  }
  return { days, channels };
}

export function summarize(
  stats: WatchStats,
  now = new Date(),
): { today: number; week: number; top: Array<{ key: string; name: string; secs: number }> } {
  let week = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    week += stats.days[dayKey(d)] ?? 0;
  }
  const top = Object.entries(stats.channels)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.secs - a.secs)
    .slice(0, 10);
  return { today: stats.days[dayKey(now)] ?? 0, week, top };
}

export function toCsv(stats: WatchStats): string {
  const esc = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ['type,key,name,seconds'];
  for (const [day, secs] of Object.entries(stats.days).sort()) lines.push(`day,${day},,${Math.round(secs)}`);
  for (const [key, v] of Object.entries(stats.channels))
    lines.push(`channel,${esc(key)},${esc(v.name)},${Math.round(v.secs)}`);
  return lines.join('\n');
}

export async function loadStats(): Promise<WatchStats> {
  try {
    const r = await chrome.storage.local.get(KEY);
    const v = r[KEY] as WatchStats | undefined;
    return v && typeof v === 'object' && v.days && v.channels ? v : emptyStats();
  } catch {
    return emptyStats();
  }
}

export async function saveStats(stats: WatchStats): Promise<void> {
  await chrome.storage.local.set({ [KEY]: stats });
}

export async function clearStats(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
