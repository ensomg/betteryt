/**
 * Single source of truth for BetterYT settings: types, defaults, validation and migrations.
 *
 * Validation is shape-driven: any stored value is deep-merged onto DEFAULTS, keeping only keys
 * that exist in DEFAULTS and whose runtime type matches the default's type. Extra constraints
 * (enums, numeric ranges) live in CONSTRAINTS keyed by dotted path.
 */

import { LAYOUT_OPTIONS, type LayoutKey } from './layout-options';
import { SB_ACTIONS, SB_CATEGORIES, type SbAction, type SbCategory } from './sponsorblock';
import {
  CONTROL_BUTTONS,
  DEFAULT_SHORTCUTS,
  QUALITY_CHOICES,
  SHORTCUT_ACTIONS,
  type ControlButton,
  type QualityChoice,
  type ShortcutAction,
} from './player-options';

export const SCHEMA_VERSION = 1;

export const ANIMATION_LEVELS = ['off', 'reduced', 'standard', 'expressive'] as const;
export type AnimationLevel = (typeof ANIMATION_LEVELS)[number];

export interface GeneralSettings {
  /** Master switch: when false every feature is destroyed and all html attributes are removed. */
  enabled: boolean;
  /** Trades visual effects for lower CPU/GPU usage. */
  performanceMode: boolean;
  animationLevel: AnimationLevel;
  /** Store settings in chrome.storage.sync (true) or chrome.storage.local (false). */
  sync: boolean;
  /** Daily update check (see shared/update.ts). */
  checkUpdates: boolean;
}

export interface MenuSettings {
  /** "BetterYT Settings" entry in the expanded guide drawer. */
  guideEntry: boolean;
  /** Gear entry in the collapsed mini-guide. */
  miniGuideEntry: boolean;
}

export const THEME_MODES = ['fixed', 'system', 'schedule'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const FONTS = ['youtube', 'system', 'inter'] as const;
export type FontChoice = (typeof FONTS)[number];

export const HEADER_MODES = ['sticky', 'scroll'] as const;
export type HeaderMode = (typeof HEADER_MODES)[number];

/** A user-made theme. Same color roles as built-ins; validated by sanitizeTheme() in themes.ts. */
export interface CustomTheme {
  id: string;
  name: string;
  scheme: 'dark' | 'light';
  colors: {
    bg: string;
    surface: string;
    elevated: string;
    text: string;
    text2: string;
    accent: string;
    divider: string;
    scrollbar: string;
    selection: string;
  };
}

export interface ThemeSettings {
  mode: ThemeMode;
  /** Theme id used in "fixed" mode ('default' = YouTube's own colors). */
  theme: string;
  /** Used by "system" and "schedule" modes. */
  darkTheme: string;
  lightTheme: string;
  /** Dark theme is active from scheduleStart until scheduleEnd (24h "HH:MM", may wrap midnight). */
  scheduleStart: string;
  scheduleEnd: string;
  custom: CustomTheme[];
  radiusOverride: boolean;
  /** 0–24 px. */
  radius: number;
  glass: boolean;
  accentProgress: boolean;
  accentScrollbar: boolean;
  thinScrollbars: boolean;
  hideCountryCode: boolean;
  compactHeader: boolean;
  header: HeaderMode;
  font: FontChoice;
}

export type LayoutSettings = Record<LayoutKey, boolean> & {
  /** Master switch applying every option marked `preset` in LAYOUT_OPTIONS. */
  distractionFree: boolean;
  /** Videos per row on Home (0 = YouTube's automatic layout). */
  homeColumns: number;
  /** Show a clock on the focus page when the Home feed is hidden. */
  focusClock: boolean;
  /** Show a short quote on the focus page. */
  focusQuote: boolean;
};

export interface PlayablesSettings {
  hide: boolean;
  redirect: boolean;
}

export interface AnimationSettings {
  thumbnails: boolean;
  menus: boolean;
}

export const WATCHED_MODES = ['show', 'dim', 'hide', 'bottom'] as const;
export type WatchedMode = (typeof WATCHED_MODES)[number];

export const FEED_PAGES = ['subscriptions', 'home', 'channel', 'search'] as const;
export type FeedPage = (typeof FEED_PAGES)[number];

export const DENSITIES = ['comfortable', 'compact'] as const;
export const DURATION_STYLES = ['default', 'pill', 'hidden'] as const;
export const PREVIEW_MODES = ['default', 'delayed', 'off'] as const;

/** Subscriptions-page-only features (/feed/subscriptions). */
export interface SubscriptionsSettings {
  enabled: boolean;
  channelStrip: boolean;
  /** Channel keys ('/@handle' or '/channel/UC…') pinned to the front of the strip. */
  pinned: string[];
  /** Custom strip order from drag-and-drop; channels not listed keep feed order after these. */
  order: string[];
  typeTabs: boolean;
  dateGroups: boolean;
  hideMembersOnly: boolean;
  /** Minutes; 0 = no limit. */
  minDuration: number;
  maxDuration: number;
  /** One rule per line: plain words (case-insensitive) or /regex/flags. */
  keywords: string;
  refreshButton: boolean;
  staggerFadeIn: boolean;
}

/** Feed grid + watched handling, applied on every page listed in `applyTo`. */
export interface FeedSettings {
  applyTo: FeedPage[];
  watched: WatchedMode;
  /** Percent watched at which a video counts as watched. */
  watchedThreshold: number;
  showHidden: boolean;
  markButtons: boolean;
  /** Videos per row; 0 = YouTube automatic. */
  columns: number;
  density: (typeof DENSITIES)[number];
  listMode: boolean;
  /** Thumbnail width in list mode, px. */
  listThumb: number;
  hideAvatars: boolean;
  absoluteDates: boolean;
  durationStyle: (typeof DURATION_STYLES)[number];
  thickProgress: boolean;
  preview: (typeof PREVIEW_MODES)[number];
  /** Extra delay before the hover preview shows (preview: 'delayed'), ms. */
  previewDelay: number;
}

export const SPEED_MEMORY = ['off', 'global', 'channel'] as const;
export const CODECS = ['auto', 'h264', 'vp9', 'av1'] as const;

export interface PlayerSettings {
  enabled: boolean;
  /** Playback */
  defaultSpeed: number;
  rememberSpeed: (typeof SPEED_MEMORY)[number];
  speedStep: number;
  wheelSpeed: boolean;
  /** Quality */
  quality: QualityChoice;
  qualityFullscreen: QualityChoice | 'same';
  premiumBitrate: boolean;
  /** Advanced: codec / frame-rate preference (needs a page reload). */
  codec: (typeof CODECS)[number];
  max30fps: boolean;
  /** Audio */
  wheelVolume: boolean;
  volumeStep: number;
  /** 100 = off; up to 400 %. */
  boost: number;
  limiter: boolean;
  normalize: boolean;
  rememberVolume: boolean;
  muteOnStart: boolean;
  /** Automation */
  autoplayOff: boolean;
  autoTheater: boolean;
  pauseOnHidden: boolean;
  resumeOnVisible: boolean;
  pauseOtherTabs: boolean;
  skipStillWatching: boolean;
  /** Captions */
  captions: boolean;
  captionLang: string;
  /** Tools */
  loopByDefault: boolean;
  screenshotTarget: 'download' | 'clipboard';
  screenshotTimestamp: boolean;
  /** Local watch-time statistics (never leaves the device). */
  watchStats: boolean;
  /** Control bar (order = array order; listed = shown). */
  buttons: ControlButton[];
  /** Keyboard */
  shortcutsEnabled: boolean;
  shortcuts: Record<ShortcutAction, string>;
}

export interface Settings {
  version: number;
  general: GeneralSettings;
  menu: MenuSettings;
  theme: ThemeSettings;
  layout: LayoutSettings;
  playables: PlayablesSettings;
  animations: AnimationSettings;
  subs: SubscriptionsSettings;
  feed: FeedSettings;
  player: PlayerSettings;
  sponsorblock: SponsorBlockSettings;
  dislikes: DislikeSettings;
  shorts: ShortsSettings;
  ambient: AmbientSettings;
  ads: AdSettings;
}

export interface AdSettings {
  enabled: boolean;
  /** Network rules + player-response cleaning + runtime skip fallback. */
  blockVideoAds: boolean;
  hideFeedAds: boolean;
  hidePremium: boolean;
  dismissWarning: boolean;
}

export interface AmbientSettings {
  enabled: boolean;
  /** Glow opacity 0–1. */
  intensity: number;
  /** Blur radius, px. */
  blur: number;
  /** Saturation multiplier. */
  saturation: number;
  /** Glow size relative to the player (1 = same size). */
  spread: number;
  /** Sampling rate (battery saver: lower). */
  fps: number;
  /** Color smoothing time constant, ms. */
  transition: number;
  onlyDark: boolean;
  fadeOnPause: boolean;
  applyWatch: boolean;
  applyShorts: boolean;
  applyTheater: boolean;
  /** Cinema mode: how dark the rest of the page gets (0–1). */
  cinemaDim: number;
  cinemaOnPlay: boolean;
}

export const SHORTS_MODES = ['improved', 'hide', 'default'] as const;

export interface ShortsSettings {
  mode: (typeof SHORTS_MODES)[number];
  /** Open /shorts/ID as a normal /watch?v=ID page. */
  redirect: boolean;
  /** Hide mode: where Shorts disappear. */
  hideHome: boolean;
  hideSearch: boolean;
  hideSubscriptions: boolean;
  hideChannel: boolean;
  hideChannelTab: boolean;
  hideWatch: boolean;
  hideGuide: boolean;
  /** Improved mode. */
  extraControls: boolean;
  autoAdvance: boolean;
  keys: boolean;
  wheelDebounce: boolean;
  arrows: boolean;
}

export interface SponsorBlockSettings {
  enabled: boolean;
  categories: Record<SbCategory, { action: SbAction; color: string }>;
  /** Wait before auto-skipping, ms. */
  skipDelay: number;
  /** Ignore segments shorter than this, seconds. */
  minLength: number;
  /** Only auto-skip segments with at least this many votes (locked segments always qualify). */
  minVotes: number;
  /** Don't auto-skip a segment you seeked into yourself. */
  respectSeek: boolean;
  /** Mute "mute" segments instead of ignoring them. */
  muteSegments: boolean;
  skipKey: string;
  showToast: boolean;
  /** Channel keys and video ids where nothing is skipped. */
  whitelistChannels: string[];
  whitelistVideos: string[];
}

export interface DislikeSettings {
  enabled: boolean;
  ratioBar: boolean;
  shorts: boolean;
  compact: boolean;
}

const sbDefaults = Object.fromEntries(
  SB_CATEGORIES.map((c) => [c.id, { action: c.action, color: c.color }]),
) as Record<SbCategory, { action: SbAction; color: string }>;

const layoutDefaults = Object.fromEntries(LAYOUT_OPTIONS.map((o) => [o.key, false])) as Record<
  LayoutKey,
  boolean
>;

export const DEFAULTS: Settings = {
  version: SCHEMA_VERSION,
  general: {
    enabled: true,
    performanceMode: false,
    animationLevel: 'standard',
    sync: true,
    checkUpdates: true,
  },
  menu: {
    guideEntry: true,
    miniGuideEntry: true,
  },
  theme: {
    mode: 'fixed',
    theme: 'default',
    darkTheme: 'amoled',
    lightTheme: 'light-clean',
    scheduleStart: '20:00',
    scheduleEnd: '07:00',
    custom: [],
    radiusOverride: false,
    radius: 12,
    glass: false,
    accentProgress: false,
    accentScrollbar: false,
    thinScrollbars: false,
    hideCountryCode: false,
    compactHeader: false,
    header: 'sticky',
    font: 'youtube',
  },
  layout: {
    ...layoutDefaults,
    distractionFree: false,
    homeColumns: 0,
    focusClock: true,
    focusQuote: true,
  },
  playables: {
    hide: true,
    redirect: false,
  },
  animations: {
    thumbnails: true,
    menus: true,
  },
  subs: {
    enabled: true,
    channelStrip: true,
    pinned: [],
    order: [],
    typeTabs: true,
    dateGroups: false,
    hideMembersOnly: false,
    minDuration: 0,
    maxDuration: 0,
    keywords: '',
    refreshButton: true,
    staggerFadeIn: true,
  },
  feed: {
    applyTo: ['subscriptions'],
    watched: 'dim',
    watchedThreshold: 80,
    showHidden: false,
    markButtons: true,
    columns: 0,
    density: 'comfortable',
    listMode: false,
    listThumb: 240,
    hideAvatars: false,
    absoluteDates: false,
    durationStyle: 'default',
    thickProgress: false,
    preview: 'default',
    previewDelay: 600,
  },
  player: {
    enabled: true,
    defaultSpeed: 1,
    rememberSpeed: 'off',
    speedStep: 0.25,
    wheelSpeed: true,
    quality: 'auto',
    qualityFullscreen: 'same',
    premiumBitrate: false,
    codec: 'auto',
    max30fps: false,
    wheelVolume: false,
    volumeStep: 5,
    boost: 100,
    limiter: true,
    normalize: false,
    rememberVolume: false,
    muteOnStart: false,
    autoplayOff: false,
    autoTheater: false,
    pauseOnHidden: false,
    resumeOnVisible: false,
    pauseOtherTabs: false,
    skipStillWatching: true,
    captions: false,
    captionLang: '',
    loopByDefault: false,
    screenshotTarget: 'download',
    screenshotTimestamp: false,
    watchStats: true,
    // YouTube now ships its own PiP button, so ours is opt-in.
    buttons: ['speed', 'screenshot', 'loop'],
    shortcutsEnabled: true,
    shortcuts: { ...DEFAULT_SHORTCUTS },
  },
  sponsorblock: {
    enabled: true,
    categories: sbDefaults,
    skipDelay: 0,
    minLength: 0,
    minVotes: 0,
    respectSeek: true,
    muteSegments: true,
    skipKey: 'Enter',
    showToast: true,
    whitelistChannels: [],
    whitelistVideos: [],
  },
  dislikes: {
    enabled: true,
    ratioBar: true,
    shorts: true,
    compact: true,
  },
  shorts: {
    mode: 'improved',
    redirect: false,
    hideHome: true,
    hideSearch: true,
    hideSubscriptions: true,
    hideChannel: true,
    hideChannelTab: false,
    hideWatch: true,
    hideGuide: true,
    extraControls: true,
    autoAdvance: false,
    keys: true,
    wheelDebounce: true,
    arrows: true,
  },
  ambient: {
    enabled: true,
    intensity: 0.55,
    blur: 70,
    saturation: 1.4,
    spread: 1.12,
    fps: 15,
    transition: 600,
    onlyDark: true,
    fadeOnPause: true,
    applyWatch: true,
    applyShorts: true,
    applyTheater: false,
    cinemaDim: 0.9,
    cinemaOnPlay: false,
  },
  ads: {
    enabled: true,
    blockVideoAds: true,
    hideFeedAds: true,
    hidePremium: true,
    dismissWarning: true,
  },
};

interface Constraint {
  enum?: readonly string[];
  min?: number;
  max?: number;
  integer?: boolean;
  pattern?: RegExp;
  /** Validates/normalizes each array item; return null to drop the item. */
  item?: (value: unknown) => Json | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

function customThemeItem(v: unknown): Json | null {
  if (!isPlainObject(v)) return null;
  const { id, name, scheme, colors } = v;
  if (typeof id !== 'string' || !/^custom-[\w-]{1,40}$/.test(id)) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (scheme !== 'dark' && scheme !== 'light') return null;
  if (!isPlainObject(colors)) return null;
  const keys = ['bg', 'surface', 'elevated', 'text', 'text2', 'accent', 'divider', 'scrollbar', 'selection'];
  const out: JsonObject = {};
  for (const k of keys) {
    const c = colors[k];
    if (typeof c !== 'string' || !HEX.test(c)) return null;
    out[k] = c.toLowerCase();
  }
  return { id, name: name.trim().slice(0, 40), scheme, colors: out };
}

/** Channel keys are site-relative paths like '/@handle' or '/channel/UC…'. */
function channelKeyItem(v: unknown): Json | null {
  return typeof v === 'string' &&
    /^\/(@[\w.-]{1,100}|channel\/[\w-]{1,64}|c\/[^/\s]{1,100}|user\/[^/\s]{1,100})$/.test(v)
    ? v
    : null;
}

export const CONSTRAINTS: Readonly<Record<string, Constraint>> = {
  'general.animationLevel': { enum: ANIMATION_LEVELS },
  'theme.mode': { enum: THEME_MODES },
  'theme.font': { enum: FONTS },
  'theme.header': { enum: HEADER_MODES },
  'theme.scheduleStart': { pattern: TIME },
  'theme.scheduleEnd': { pattern: TIME },
  'theme.radius': { min: 0, max: 24, integer: true },
  'theme.custom': { item: customThemeItem },
  'layout.homeColumns': { min: 0, max: 8, integer: true },
  'subs.pinned': { item: channelKeyItem },
  'subs.order': { item: channelKeyItem },
  'subs.minDuration': { min: 0, max: 600, integer: true },
  'subs.maxDuration': { min: 0, max: 600, integer: true },
  'feed.applyTo': { item: (v) => (FEED_PAGES.includes(v as FeedPage) ? (v as string) : null) },
  'feed.watched': { enum: WATCHED_MODES },
  'feed.watchedThreshold': { min: 5, max: 100, integer: true },
  'feed.columns': { min: 0, max: 8, integer: true },
  'feed.density': { enum: DENSITIES },
  'feed.listThumb': { min: 120, max: 400, integer: true },
  'feed.durationStyle': { enum: DURATION_STYLES },
  'feed.preview': { enum: PREVIEW_MODES },
  'feed.previewDelay': { min: 0, max: 3000, integer: true },
  'player.defaultSpeed': { min: 0.1, max: 16 },
  'player.rememberSpeed': { enum: SPEED_MEMORY },
  'player.speedStep': { min: 0.05, max: 1 },
  'player.quality': { enum: QUALITY_CHOICES },
  'player.qualityFullscreen': { enum: [...QUALITY_CHOICES, 'same'] },
  'player.codec': { enum: CODECS },
  'player.volumeStep': { min: 1, max: 20, integer: true },
  'player.boost': { min: 100, max: 400, integer: true },
  'player.captionLang': { pattern: /^([a-z]{2,3}(-[A-Za-z0-9]{2,8})?)?$/ },
  'player.screenshotTarget': { enum: ['download', 'clipboard'] },
  ...Object.fromEntries(
    SB_CATEGORIES.flatMap((c) => [
      [`sponsorblock.categories.${c.id}.action`, { enum: SB_ACTIONS }],
      [`sponsorblock.categories.${c.id}.color`, { pattern: HEX }],
    ]),
  ),
  'sponsorblock.skipDelay': { min: 0, max: 5000, integer: true },
  'sponsorblock.minLength': { min: 0, max: 600 },
  'sponsorblock.minVotes': { min: -10, max: 100, integer: true },
  'sponsorblock.skipKey': {
    pattern: /^((Ctrl|Alt|Meta|Shift)\+){0,4}([^\s+]|Enter|Space|Tab|Arrow(Up|Down|Left|Right)|F\d{1,2})$/,
  },
  'sponsorblock.whitelistChannels': { item: channelKeyItem },
  'shorts.mode': { enum: SHORTS_MODES },
  'ambient.intensity': { min: 0, max: 1 },
  'ambient.blur': { min: 0, max: 200, integer: true },
  'ambient.saturation': { min: 0.5, max: 3 },
  'ambient.spread': { min: 1, max: 1.6 },
  'ambient.fps': { min: 5, max: 30, integer: true },
  'ambient.transition': { min: 0, max: 3000, integer: true },
  'ambient.cinemaDim': { min: 0.3, max: 1 },
  'sponsorblock.whitelistVideos': {
    item: (v) => (typeof v === 'string' && /^[\w-]{11}$/.test(v) ? v : null),
  },
  'player.buttons': {
    item: (v) => (CONTROL_BUTTONS.includes(v as ControlButton) ? (v as string) : null),
  },
};

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkConstraint(path: string, value: unknown): boolean {
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  const c = CONSTRAINTS[path];
  if (!c) return true;
  if (c.enum && !c.enum.includes(value as string)) return false;
  if (c.pattern && (typeof value !== 'string' || !c.pattern.test(value))) return false;
  if (typeof value === 'number') {
    if (c.min !== undefined && value < c.min) return false;
    if (c.max !== undefined && value > c.max) return false;
    if (c.integer && !Number.isInteger(value)) return false;
  }
  return true;
}

const BINDING =
  /^((Ctrl|Alt|Meta|Shift)\+){0,4}([^\s+]|Space|Arrow(Up|Down|Left|Right)|F\d{1,2}|Home|End|PageUp|PageDown|Enter|Escape|Backspace|Delete|Insert|Tab|\+)$/;

function mergeOnto(def: Json, raw: unknown, path: string): Json {
  if (path === 'player.shortcuts' && isPlainObject(def)) {
    // Fixed key set (actions); each binding is '' (unbound) or a valid combo.
    const src = isPlainObject(raw) ? raw : {};
    const out: JsonObject = {};
    for (const action of SHORTCUT_ACTIONS) {
      const v = src[action];
      out[action] = typeof v === 'string' && (v === '' || BINDING.test(v)) ? v : (def[action] as Json);
    }
    return out;
  }
  if (isPlainObject(def)) {
    const out: JsonObject = {};
    const src = isPlainObject(raw) ? raw : {};
    for (const key of Object.keys(def)) {
      out[key] = mergeOnto(def[key] as Json, src[key], path ? `${path}.${key}` : key);
    }
    return out;
  }
  if (Array.isArray(def)) {
    // Arrays hold user data (themes, channel lists, keywords...): deep-copied, items validated
    // by the path's `item` constraint when one exists.
    if (!Array.isArray(raw)) return structuredClone(def);
    const item = CONSTRAINTS[path]?.item;
    const copy = structuredClone(raw) as Json[];
    return item ? copy.map(item).filter((x): x is Json => x !== null) : copy;
  }
  if (raw === undefined || typeof raw !== typeof def || !checkConstraint(path, raw)) return def;
  return raw as Json;
}

/** Returns a fully-populated, type-correct Settings object. Never throws. */
export function validate(raw: unknown): Settings {
  const merged = mergeOnto(DEFAULTS as unknown as Json, raw, '') as unknown as Settings;
  merged.version = SCHEMA_VERSION;
  return merged;
}

/**
 * Migrations, keyed by the version they upgrade FROM. Each receives the raw stored object and
 * returns the shape of version + 1. Keep them pure; they run in the service worker and in tests.
 */
export const MIGRATIONS: Readonly<Record<number, (s: Record<string, unknown>) => Record<string, unknown>>> = {
  // v0 = unversioned pre-release builds, which stored a flat `enabled` flag at the root.
  0: (s) => {
    const { enabled, ...rest } = s;
    const general: Record<string, unknown> = isPlainObject(rest.general) ? { ...rest.general } : {};
    if (typeof enabled === 'boolean' && general.enabled === undefined) general.enabled = enabled;
    return { ...rest, general };
  },
};

/** Upgrades any stored value (any version, or garbage) to a valid current Settings object. */
export function migrate(raw: unknown): Settings {
  if (!isPlainObject(raw)) return validate(undefined);
  let current: Record<string, unknown> = { ...raw };
  let from = typeof current.version === 'number' ? current.version : 0;
  while (from < SCHEMA_VERSION) {
    const step = MIGRATIONS[from];
    try {
      if (step) current = step(current);
    } catch {
      // A broken migration must never brick the extension; validation fills in defaults.
    }
    from += 1;
    current.version = from;
  }
  return validate(current);
}

/** Read a value by dotted path, e.g. getPath(s, 'general.enabled'). */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Immutable set by dotted path; returns a validated copy (invalid values fall back to defaults). */
export function setPath(settings: Settings, path: string, value: unknown): Settings {
  const copy = structuredClone(settings) as unknown as JsonObject;
  const keys = path.split('.');
  const last = keys.pop();
  let cur: JsonObject = copy;
  for (const key of keys) {
    const next = cur[key];
    if (!isPlainObject(next)) return settings;
    cur = next;
  }
  if (last === undefined) return settings;
  cur[last] = value as Json;
  return validate(copy);
}
