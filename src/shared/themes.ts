/**
 * Theme model shared by the content script and the options page: built-in palettes, color math,
 * contrast checks and the automatic theme resolver. Pure functions only (unit-tested).
 */
import type { CustomTheme, Settings } from './settings-schema';

export type ThemeColors = CustomTheme['colors'];
export type Scheme = CustomTheme['scheme'];

export interface Theme {
  id: string;
  name: string;
  scheme: Scheme;
  colors: ThemeColors;
  builtIn: boolean;
}

/** 'default' means "leave YouTube's own colors alone". */
export const DEFAULT_THEME_ID = 'default';

type BuiltIn = Omit<Theme, 'builtIn'>;

const BUILT_INS: BuiltIn[] = [
  {
    id: 'amoled',
    name: 'AMOLED Black',
    scheme: 'dark',
    colors: {
      bg: '#000000',
      surface: '#0c0c0c',
      elevated: '#181818',
      text: '#f1f1f1',
      text2: '#a8a8a8',
      accent: '#ff4e45',
      divider: '#262626',
      scrollbar: '#3a3a3a',
      selection: '#ff4e4566',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    scheme: 'dark',
    colors: {
      bg: '#0b1020',
      surface: '#121a30',
      elevated: '#1a2440',
      text: '#e6ebff',
      text2: '#9ea9cb',
      accent: '#6ea8ff',
      divider: '#243052',
      scrollbar: '#2f3d66',
      selection: '#6ea8ff55',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    scheme: 'dark',
    colors: {
      bg: '#1c1d20',
      surface: '#24262a',
      elevated: '#2d3035',
      text: '#ececee',
      text2: '#abaeb4',
      accent: '#9fb4ff',
      divider: '#36393f',
      scrollbar: '#474a51',
      selection: '#9fb4ff55',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    scheme: 'dark',
    colors: {
      bg: '#0e1612',
      surface: '#14201a',
      elevated: '#1b2a22',
      text: '#e4f1e8',
      text2: '#9fbdaa',
      accent: '#5fd38d',
      divider: '#22362b',
      scrollbar: '#2f4a3b',
      selection: '#5fd38d4d',
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    scheme: 'dark',
    colors: {
      bg: '#1a1015',
      surface: '#24161d',
      elevated: '#2e1c26',
      text: '#f8e8ef',
      text2: '#cfa9ba',
      accent: '#ff7aa8',
      divider: '#3a2430',
      scrollbar: '#4d3040',
      selection: '#ff7aa84d',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    scheme: 'dark',
    colors: {
      bg: '#1b120e',
      surface: '#261913',
      elevated: '#312119',
      text: '#fbeee6',
      text2: '#d2b09c',
      accent: '#ff9a4d',
      divider: '#3d2a20',
      scrollbar: '#53392b',
      selection: '#ff9a4d4d',
    },
  },
  {
    id: 'light-clean',
    name: 'Light Clean',
    scheme: 'light',
    colors: {
      bg: '#fafafa',
      surface: '#ffffff',
      elevated: '#ffffff',
      text: '#111318',
      text2: '#545964',
      accent: '#2563eb',
      divider: '#e3e5e9',
      scrollbar: '#c5c9d0',
      selection: '#2563eb33',
    },
  },
];

export const BUILTIN_THEMES: readonly Theme[] = BUILT_INS.map((t) => ({ ...t, builtIn: true }));

/** Stand-in shown in the gallery for "Default (YouTube)"; never applied as overrides. */
export const YOUTUBE_PREVIEW: Theme = {
  id: DEFAULT_THEME_ID,
  name: 'Default (YouTube)',
  scheme: 'dark',
  builtIn: true,
  colors: {
    bg: '#0f0f0f',
    surface: '#212121',
    elevated: '#282828',
    text: '#f1f1f1',
    text2: '#aaaaaa',
    accent: '#ff0033',
    divider: '#3f3f3f',
    scrollbar: '#717171',
    selection: '#3ea6ff55',
  },
};

export function allThemes(settings: Settings): Theme[] {
  return [...BUILTIN_THEMES, ...settings.theme.custom.map((t) => ({ ...t, builtIn: false }))];
}

/** Theme for an id, or null for 'default' / unknown ids (= no overrides). */
export function findTheme(settings: Settings, id: string): Theme | null {
  if (id === DEFAULT_THEME_ID) return null;
  return allThemes(settings).find((t) => t.id === id) ?? null;
}

/* ------------------------------------------------------------------------------------------------
 * Automatic theme selection
 * ---------------------------------------------------------------------------------------------- */

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True when `now` lies in [start, end), wrapping midnight when start > end. */
export function inDarkWindow(start: string, end: string, now: Date): boolean {
  const s = minutes(start);
  const e = minutes(end);
  const n = now.getHours() * 60 + now.getMinutes();
  if (s === e) return true;
  return s < e ? n >= s && n < e : n >= s || n < e;
}

export function resolveThemeId(settings: Settings, now: Date, prefersDark: boolean): string {
  const t = settings.theme;
  switch (t.mode) {
    case 'system':
      return prefersDark ? t.darkTheme : t.lightTheme;
    case 'schedule':
      return inDarkWindow(t.scheduleStart, t.scheduleEnd, now) ? t.darkTheme : t.lightTheme;
    default:
      return t.theme;
  }
}

/** Milliseconds until the next schedule boundary (start or end), or null if not scheduling. */
export function msUntilNextSwitch(settings: Settings, now: Date): number | null {
  if (settings.theme.mode !== 'schedule') return null;
  const n = now.getHours() * 60 + now.getMinutes();
  const candidates = [minutes(settings.theme.scheduleStart), minutes(settings.theme.scheduleEnd)].map(
    (b) => (b - n + 1440) % 1440 || 1440,
  );
  const mins = Math.min(...candidates);
  return mins * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
}

/* ------------------------------------------------------------------------------------------------
 * Color math
 * ---------------------------------------------------------------------------------------------- */

export type Rgba = [number, number, number, number];

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(). Returns null on anything else. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let hex = m[1]!;
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i: number): number => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return null;
    return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
  }
  return null;
}

export function toHex([r, g, b]: Rgba): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function rgba([r, g, b]: Rgba, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/** Linear blend of a toward b by t (0..1), alpha ignored. */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return a;
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t, 1]);
}

function luminance(c: Rgba): number {
  const ch = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}

/** WCAG 2.x contrast ratio (1..21). */
export function contrast(fg: string, bg: string): number {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return 1;
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

export function schemeOf(bg: string): Scheme {
  const c = parseColor(bg);
  return c && luminance(c) > 0.4 ? 'light' : 'dark';
}

/**
 * Builds a full palette from the four colors the custom-theme editor exposes. Secondary text is
 * pushed toward the text color until it reaches WCAG AA (4.5:1) on both background and surface.
 */
export function deriveColors(base: Pick<ThemeColors, 'bg' | 'surface' | 'text' | 'accent'>): ThemeColors {
  const scheme = schemeOf(base.bg);
  let text2 = mix(base.text, base.bg, 0.38);
  for (
    let t = 0.38;
    t > 0 && Math.min(contrast(text2, base.bg), contrast(text2, base.surface)) < 4.5;
    t -= 0.04
  ) {
    text2 = mix(base.text, base.bg, t);
  }
  const accentRgb = parseColor(base.accent) ?? [255, 0, 51, 1];
  return {
    bg: base.bg,
    surface: base.surface,
    elevated: mix(base.surface, base.text, scheme === 'dark' ? 0.06 : 0),
    text: base.text,
    text2,
    accent: base.accent,
    divider: mix(base.bg, base.text, scheme === 'dark' ? 0.14 : 0.1),
    scrollbar: mix(base.bg, base.text, scheme === 'dark' ? 0.24 : 0.25),
    selection: `${toHex(accentRgb)}55`,
  };
}

/** Accessibility report used by tests and the theme editor's warning badge. */
export function contrastIssues(colors: ThemeColors): string[] {
  const issues: string[] = [];
  for (const surface of ['bg', 'surface', 'elevated'] as const) {
    if (contrast(colors.text, colors[surface]) < 4.5) issues.push(`text on ${surface}`);
    if (contrast(colors.text2, colors[surface]) < 4.5) issues.push(`secondary text on ${surface}`);
  }
  if (contrast(colors.accent, colors.bg) < 3) issues.push('accent on bg');
  return issues;
}

export function newCustomId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
