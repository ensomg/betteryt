/**
 * Update checks.
 *  - Web Store installs: Chrome updates automatically; we additionally call requestUpdateCheck().
 *  - Unpacked / self-hosted installs: once a day the worker fetches UPDATE_MANIFEST_URL
 *    ({"version":"x.y.z","url":"…zip","notes":"…"}) and, if newer, shows a "NEW" badge and a link
 *    on the options page. Set the URL to your own release feed (e.g. a JSON file in your repo).
 */

export const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/ensomg/betteryt/main/update.json';
export const UPDATE_KEY = 'updateInfo';

export interface UpdateInfo {
  checkedAt: number;
  latest: string | null;
  url: string | null;
  notes: string | null;
  available: boolean;
}

/** Numeric dotted-version compare: 1 if a > b, -1 if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function parseUpdateManifest(
  body: unknown,
): { version: string; url: string | null; notes: string | null } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(b.version)) return null;
  const url = typeof b.url === 'string' && /^https:\/\//.test(b.url) ? b.url : null;
  const notes = typeof b.notes === 'string' ? b.notes.slice(0, 500) : null;
  return { version: b.version, url, notes };
}
