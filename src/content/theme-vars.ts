/**
 * Discovers YouTube's color variables and assigns each one a BetterYT color role.
 *
 * YouTube ships obfuscated custom-property names (e.g. --tffc2fd3a644f6275) that change between
 * builds, next to a few semantic ones (--yt-sys-color-baseline--*). Every palette variable has a
 * value in dark mode and one in light mode; that (dark, light) pair identifies its role. So we:
 *   1. read the semantic anchors' dark/light values (or fall back to known defaults),
 *   2. compute every candidate variable's dark/light value with two probe elements
 *      (<div dark> and <div light>, which YouTube's own selectors style),
 *   3. map each variable whose RGB pair matches an anchor (alpha is preserved) to that role.
 * The result is cached so the next page load can apply a theme before YouTube's CSS settles.
 */
import { parseColor, type Rgba } from '../shared/themes';

export type Role =
  | 'bg'
  | 'surface'
  | 'elevated'
  | 'text'
  | 'text2'
  | 'textDisabled'
  | 'accent'
  /** pure white (dark) / pure black (light) overlays → theme text color at the same alpha */
  | 'textOverlay'
  /** pure black (dark) / pure white (light) overlays → theme background at the same alpha */
  | 'bgOverlay';

export interface VarEntry {
  name: string;
  role: Role;
  /** Alpha of the variable in dark and light mode (applied to the role color). */
  da: number;
  la: number;
}

const ANCHORS: ReadonlyArray<[Exclude<Role, 'textOverlay' | 'bgOverlay'>, string, [string, string]]> = [
  ['bg', '--yt-sys-color-baseline--base-background', ['#0f0f0f', '#ffffff']],
  ['surface', '--yt-sys-color-baseline--raised-background', ['#212121', '#ffffff']],
  ['elevated', '--yt-sys-color-baseline--menu-background', ['#282828', '#ffffff']],
  ['text', '--yt-sys-color-baseline--text-primary', ['#f1f1f1', '#0f0f0f']],
  ['text2', '--yt-sys-color-baseline--text-secondary', ['#aaaaaa', '#606060']],
  ['textDisabled', '--yt-sys-color-baseline--text-disabled', ['#717171', '#909090']],
  ['accent', '--yt-sys-color-baseline--call-to-action', ['#3ea6ff', '#065fd4']],
];

const rgbKey = (c: Rgba): string => `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}`;

/** Selectors whose custom properties are candidates (palette scopes, not component styles). */
const SCOPE = /\[(dark|light)\]|^\s*(html|:root)\b/;

function candidateNames(): Set<string> {
  const names = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule) || !SCOPE.test(rule.selectorText)) continue;
      const style = rule.style;
      for (let i = 0; i < style.length; i++) {
        const p = style.item(i);
        if (p.startsWith('--') && !p.startsWith('--by-')) names.add(p);
      }
    }
  }
  return names;
}

/**
 * Runs discovery. `ownStyles` are our override <style> elements, disabled during measurement so
 * the probes see YouTube's values rather than ours. Synchronous: nothing paints in between.
 */
export function discoverVars(ownStyles: HTMLStyleElement[]): VarEntry[] {
  const names = candidateNames();
  if (!names.size) return [];
  const dark = document.createElement('div');
  const light = document.createElement('div');
  dark.setAttribute('dark', '');
  light.setAttribute('light', '');
  dark.hidden = light.hidden = true;
  const disabled = ownStyles.filter((s) => s.sheet && !s.sheet.disabled);
  for (const s of disabled) s.sheet!.disabled = true;
  const host = document.body ?? document.documentElement;
  host.append(dark, light);
  try {
    const cd = getComputedStyle(dark);
    const cl = getComputedStyle(light);

    const anchorPairs = new Map<string, Role>();
    for (const [role, name, fallback] of ANCHORS) {
      const d = parseColor(cd.getPropertyValue(name)) ?? parseColor(fallback[0]);
      const l = parseColor(cl.getPropertyValue(name)) ?? parseColor(fallback[1]);
      if (d && l) {
        const key = `${rgbKey(d)}|${rgbKey(l)}`;
        if (!anchorPairs.has(key)) anchorPairs.set(key, role);
      }
    }

    const out: VarEntry[] = [];
    for (const name of names) {
      const d = parseColor(cd.getPropertyValue(name));
      const l = parseColor(cl.getPropertyValue(name));
      if (!d || !l) continue;
      const dk = rgbKey(d);
      const lk = rgbKey(l);
      if (dk === lk && d[3] === l[3]) continue; // static color, not part of the palette
      if (d[3] === 0 && l[3] === 0) continue;
      let role = anchorPairs.get(`${dk}|${lk}`);
      if (!role && dk === '255,255,255' && lk === '0,0,0') role = 'textOverlay';
      if (!role && dk === '0,0,0' && lk === '255,255,255') role = 'bgOverlay';
      if (role) out.push({ name, role, da: d[3], la: l[3] });
    }
    return out;
  } finally {
    dark.remove();
    light.remove();
    for (const s of disabled) s.sheet!.disabled = false;
  }
}

/** Cheap fingerprint to decide whether a re-scan is worthwhile. */
export function styleFingerprint(): number {
  return document.styleSheets.length;
}
