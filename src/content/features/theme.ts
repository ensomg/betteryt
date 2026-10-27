import type { Settings } from '../../shared/settings-schema';
import { findTheme, msUntilNextSwitch, resolveThemeId } from '../../shared/themes';
import { themeCss } from '../theme-css';
import { onNavigate } from '../nav';
import { discoverVars, styleFingerprint, type VarEntry } from '../theme-vars';
import { registry, type Feature } from './registry';

/**
 * Theming + global polish. A theme is applied by (a) defining --by-* tokens and (b) remapping
 * YouTube's own palette variables (see theme-vars.ts) in a generated <style>, plus the static
 * backstop rules in css/theme.css. Everything is keyed on html[betteryt-theme] so it switches live.
 */

const ID = 'theme';
const CACHE_KEY = 'themeVarMap';
const CACHE_VERSION = 1;
const root = document.documentElement;
const prefersDark = matchMedia('(prefers-color-scheme: dark)');

let settings: Settings | null = null;
let styleEl: HTMLStyleElement | null = null;
let fontEl: HTMLStyleElement | null = null;
let varMap: VarEntry[] = [];
let scannedFingerprint = -1;
let switchTimer: ReturnType<typeof setTimeout> | undefined;
let offNav: (() => void) | null = null;
let idleHandle = 0;

const POLISH_ATTRS = [
  'by-radius',
  'by-glass',
  'by-accent-progress',
  'by-accent-scrollbar',
  'by-thin-scrollbars',
  'by-hide-country-code',
  'by-compact-header',
  'by-header-scroll',
  'by-font',
] as const;

/* ------------------------------------------------------------------------------------------------
 * Application
 * ---------------------------------------------------------------------------------------------- */

function ensureStyle(): HTMLStyleElement {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'betteryt-theme';
    // documentElement exists at document_start even before <head>.
    (document.head ?? root).append(styleEl);
  }
  return styleEl;
}

function applyFont(s: Settings): void {
  if (s.theme.font !== 'inter') {
    fontEl?.remove();
    fontEl = null;
    return;
  }
  if (fontEl) return;
  fontEl = document.createElement('style');
  fontEl.id = 'betteryt-font';
  const url = chrome.runtime.getURL('fonts/inter-latin-wght-normal.woff2');
  fontEl.textContent = `@font-face { font-family: 'BetterYT Inter'; font-style: normal; font-display: swap; font-weight: 100 900; src: url('${url}') format('woff2-variations'), url('${url}') format('woff2'); }`;
  (document.head ?? root).append(fontEl);
}

function applyPolish(s: Settings): void {
  const t = s.theme;
  root.toggleAttribute('by-radius', t.radiusOverride);
  if (t.radiusOverride) root.style.setProperty('--by-radius', `${t.radius}px`);
  else root.style.removeProperty('--by-radius');
  root.toggleAttribute('by-glass', t.glass);
  root.toggleAttribute('by-accent-progress', t.accentProgress);
  root.toggleAttribute('by-accent-scrollbar', t.accentScrollbar);
  root.toggleAttribute('by-thin-scrollbars', t.thinScrollbars);
  root.toggleAttribute('by-hide-country-code', t.hideCountryCode);
  root.toggleAttribute('by-compact-header', t.compactHeader);
  root.toggleAttribute('by-header-scroll', t.header === 'scroll');
  if (t.font === 'youtube') root.removeAttribute('by-font');
  else root.setAttribute('by-font', t.font);
  applyFont(s);
}

function applyTheme(): void {
  if (!settings) return;
  const id = resolveThemeId(settings, new Date(), prefersDark.matches);
  const theme = findTheme(settings, id);
  if (!theme) {
    root.removeAttribute('betteryt-theme');
    if (styleEl) styleEl.textContent = '';
  } else {
    ensureStyle().textContent = themeCss(theme, varMap);
    root.setAttribute('betteryt-theme', theme.id);
  }
  scheduleSwitch();
}

function scheduleSwitch(): void {
  clearTimeout(switchTimer);
  if (!settings) return;
  const ms = msUntilNextSwitch(settings, new Date());
  if (ms !== null) switchTimer = setTimeout(registry.guard(ID, applyTheme), Math.max(1000, ms + 500));
}

const onSchemeChange = registry.guard(ID, () => {
  if (settings?.theme.mode === 'system') applyTheme();
});

/* ------------------------------------------------------------------------------------------------
 * Variable discovery (idle, once per page load + when YouTube adds stylesheets)
 * ---------------------------------------------------------------------------------------------- */

function sameMap(a: readonly VarEntry[], b: readonly VarEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (x, i) => x.name === b[i]?.name && x.role === b[i]?.role && x.da === b[i]?.da && x.la === b[i]?.la,
    )
  );
}

function rescan(): void {
  const fp = styleFingerprint();
  if (fp === scannedFingerprint) return;
  scannedFingerprint = fp;
  const found = discoverVars([styleEl].filter((s): s is HTMLStyleElement => s !== null));
  if (!found.length || sameMap(found, varMap)) return;
  varMap = found;
  applyTheme();
  void chrome.storage.local.set({ [CACHE_KEY]: { v: CACHE_VERSION, vars: found } }).catch(() => undefined);
}

function scheduleRescan(): void {
  if (idleHandle) return;
  const run = registry.guard(ID, () => {
    idleHandle = 0;
    rescan();
  });
  idleHandle =
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback(run, { timeout: 3000 })
      : (setTimeout(run, 500) as unknown as number);
}

async function loadCache(): Promise<void> {
  try {
    const r = await chrome.storage.local.get(CACHE_KEY);
    const c = r[CACHE_KEY] as { v?: number; vars?: VarEntry[] } | undefined;
    if (c?.v === CACHE_VERSION && Array.isArray(c.vars) && !varMap.length) {
      varMap = c.vars.filter((x) => typeof x?.name === 'string' && x.name.startsWith('--'));
      applyTheme();
    }
  } catch {}
}

const onLoad = (): void => scheduleRescan();

export const theme: Feature = {
  id: ID,
  enabled: () => true, // polish toggles and auto-theme live here; 'default' theme applies nothing
  init(s) {
    settings = s;
    applyPolish(s);
    applyTheme();
    void loadCache();
    prefersDark.addEventListener('change', onSchemeChange);
    if (document.readyState === 'complete') scheduleRescan();
    else window.addEventListener('load', onLoad, { once: true });
    offNav = onNavigate(scheduleRescan);
  },
  update(s) {
    settings = s;
    applyPolish(s);
    applyTheme();
  },
  destroy() {
    settings = null;
    clearTimeout(switchTimer);
    prefersDark.removeEventListener('change', onSchemeChange);
    window.removeEventListener('load', onLoad);
    offNav?.();
    offNav = null;
    if (idleHandle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle);
    idleHandle = 0;
    styleEl?.remove();
    styleEl = null;
    fontEl?.remove();
    fontEl = null;
    root.removeAttribute('betteryt-theme');
    for (const a of POLISH_ATTRS) root.removeAttribute(a);
    root.style.removeProperty('--by-radius');
  },
};
