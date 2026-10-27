/**
 * Player option catalogs shared by the schema, the MAIN-world player features and the options page:
 * quality ladder, control-bar buttons and keyboard actions with default bindings.
 */

/** YouTube quality ids, best first. */
export const QUALITY_LADDER = [
  'highres',
  'hd2880',
  'hd2160',
  'hd1440',
  'hd1080',
  'hd720',
  'large',
  'medium',
  'small',
  'tiny',
] as const;
export type QualityId = (typeof QUALITY_LADDER)[number];

export const QUALITY_CHOICES = [
  'auto',
  'highest',
  'hd2160',
  'hd1440',
  'hd1080',
  'hd720',
  'large',
  'medium',
  'small',
] as const;
export type QualityChoice = (typeof QUALITY_CHOICES)[number];

/** Picks the best available quality not above `want` (fallback ladder). */
export function pickQuality(want: QualityChoice, available: readonly string[]): string | null {
  if (want === 'auto' || !available.length) return null;
  const avail = available.filter((q) => q !== 'auto');
  if (!avail.length) return null;
  if (want === 'highest') return [...avail].sort((a, b) => rank(a) - rank(b))[0] ?? null;
  const cap = rank(want);
  const ok = avail.filter((q) => rank(q) >= cap).sort((a, b) => rank(a) - rank(b));
  // Nothing at or below the cap (e.g. a 360p-only video and want=1080p is fine; want=tiny on HD-only is not): take the lowest.
  return ok[0] ?? [...avail].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

function rank(q: string): number {
  const i = (QUALITY_LADDER as readonly string[]).indexOf(q);
  return i === -1 ? QUALITY_LADDER.length : i;
}

export const CONTROL_BUTTONS = [
  'speed',
  'screenshot',
  'loop',
  'ab',
  'pip',
  'popup',
  'boost',
  'stats',
  'cinema',
] as const;
export type ControlButton = (typeof CONTROL_BUTTONS)[number];

export const SHORTCUT_ACTIONS = [
  'speedUp',
  'speedDown',
  'speedReset',
  'loop',
  'abRepeat',
  'screenshot',
  'pip',
  'stats',
  'copyTimestamp',
  'boost',
  'cinema',
] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

/** Defaults avoid YouTube's own keys (k j l f m c t i , . < > 0-9 / arrows space). */
export const DEFAULT_SHORTCUTS: Readonly<Record<ShortcutAction, string>> = {
  speedUp: ']',
  speedDown: '[',
  speedReset: '\\',
  loop: 'r',
  abRepeat: 'b',
  screenshot: 'Shift+S',
  pip: 'p',
  stats: 'Shift+D',
  copyTimestamp: 'Shift+T',
  boost: 'Shift+V',
  cinema: 'Shift+C',
};

/** Keys YouTube already uses on the watch page; binding them triggers a conflict warning. */
export const YOUTUBE_KEYS: ReadonlySet<string> = new Set([
  'k',
  'j',
  'l',
  'f',
  'm',
  'c',
  't',
  'i',
  ',',
  '.',
  'Shift+<',
  'Shift+>',
  'Shift+N',
  'Shift+P',
  ' ',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '/',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'Escape',
  '+',
  '-',
  'w',
  'o',
]);

/** Normalizes a KeyboardEvent into "Ctrl+Alt+Shift+Key" form (letters lowercase unless shifted letter). */
export function keyCombo(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
): string {
  let key = e.key;
  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return '';
  if (key.length === 1) key = key.toLowerCase();
  if (key === ' ') key = 'Space';
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.metaKey) mods.push('Meta');
  // Shift is implied by symbols like "{" or "?"; only record it for letters and named keys.
  if (e.shiftKey && (/^[a-z]$/.test(key) || key.length > 1)) mods.push('Shift');
  const k = /^[a-z]$/.test(key) && e.shiftKey ? key.toUpperCase() : key;
  return [...mods, k].join('+');
}

/** Canonical display/compare form of a stored binding. */
export function normalizeBinding(b: string): string {
  const parts = b.split('+').filter(Boolean);
  if (!parts.length) return '';
  const key = parts.pop()!;
  const mods = new Set(parts.map((p) => p[0]!.toUpperCase() + p.slice(1).toLowerCase()));
  const order = ['Ctrl', 'Alt', 'Meta', 'Shift'].filter((m) => mods.has(m));
  const k =
    key.length === 1
      ? mods.has('Shift') && /[a-z]/i.test(key)
        ? key.toUpperCase()
        : key.toLowerCase()
      : key;
  return [...order, k].join('+');
}

/** Returns actions whose bindings collide with another action or with YouTube's own keys. */
export function shortcutConflicts(bindings: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const [action, raw] of Object.entries(bindings)) {
    const b = normalizeBinding(raw);
    if (!b) continue;
    const plain = b.replace(/^Shift\+([A-Z])$/, 'Shift+$1');
    if (YOUTUBE_KEYS.has(plain) || YOUTUBE_KEYS.has(b.toLowerCase())) out[action] = 'youtube';
    const other = seen.get(b);
    if (other) {
      out[action] = other;
      out[other] = action;
    } else seen.set(b, action);
  }
  return out;
}
