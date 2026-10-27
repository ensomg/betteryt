import { describe, expect, it } from 'vitest';
import { DEFAULTS, setPath, validate, type Settings } from '../src/shared/settings-schema';
import {
  BUILTIN_THEMES,
  contrast,
  contrastIssues,
  deriveColors,
  findTheme,
  inDarkWindow,
  msUntilNextSwitch,
  parseColor,
  resolveThemeId,
} from '../src/shared/themes';
import { themeCss } from '../src/content/theme-css';

const at = (hh: number, mm = 0): Date => new Date(2026, 0, 1, hh, mm, 0, 0);

function withTheme(patch: Partial<Settings['theme']>): Settings {
  return validate({ ...DEFAULTS, theme: { ...DEFAULTS.theme, ...patch } });
}

describe('built-in themes', () => {
  it.each(BUILTIN_THEMES.map((t) => [t.name, t] as const))('%s meets WCAG AA', (_name, theme) => {
    expect(contrastIssues(theme.colors)).toEqual([]);
  });

  it('have unique ids and valid colors', () => {
    const ids = new Set(BUILTIN_THEMES.map((t) => t.id));
    expect(ids.size).toBe(BUILTIN_THEMES.length);
    for (const t of BUILTIN_THEMES)
      for (const c of Object.values(t.colors)) expect(parseColor(c)).not.toBeNull();
  });
});

describe('color math', () => {
  it('parses hex and rgba forms', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('#00000080')![3]).toBeCloseTo(0.5, 2);
    expect(parseColor('rgba(255, 255, 255, 0.1)')).toEqual([255, 255, 255, 0.1]);
    expect(parseColor('nonsense')).toBeNull();
  });

  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('derives an AA-compliant palette from four colors', () => {
    const c = deriveColors({ bg: '#101418', surface: '#1a2027', text: '#e8edf2', accent: '#ffb020' });
    expect(contrast(c.text2, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.text2, c.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('automatic theme selection', () => {
  it('dark window wraps midnight', () => {
    expect(inDarkWindow('20:00', '07:00', at(23))).toBe(true);
    expect(inDarkWindow('20:00', '07:00', at(6, 59))).toBe(true);
    expect(inDarkWindow('20:00', '07:00', at(7))).toBe(false);
    expect(inDarkWindow('20:00', '07:00', at(12))).toBe(false);
    expect(inDarkWindow('09:00', '17:00', at(10))).toBe(true);
  });

  it('resolves by mode', () => {
    expect(resolveThemeId(withTheme({ mode: 'fixed', theme: 'forest' }), at(12), true)).toBe('forest');
    const sys = withTheme({ mode: 'system', darkTheme: 'midnight', lightTheme: 'light-clean' });
    expect(resolveThemeId(sys, at(12), true)).toBe('midnight');
    expect(resolveThemeId(sys, at(12), false)).toBe('light-clean');
    const sched = withTheme({ mode: 'schedule', darkTheme: 'amoled', lightTheme: 'light-clean' });
    expect(resolveThemeId(sched, at(21), false)).toBe('amoled');
    expect(resolveThemeId(sched, at(9), true)).toBe('light-clean');
  });

  it('schedules the next switch at the nearest boundary', () => {
    const s = withTheme({ mode: 'schedule', scheduleStart: '20:00', scheduleEnd: '07:00' });
    expect(msUntilNextSwitch(s, at(19, 30))).toBe(30 * 60_000);
    expect(msUntilNextSwitch(s, at(6))).toBe(60 * 60_000);
    expect(msUntilNextSwitch(withTheme({ mode: 'fixed' }), at(6))).toBeNull();
  });

  it('treats default/unknown ids as "no theme"', () => {
    expect(findTheme(DEFAULTS, 'default')).toBeNull();
    expect(findTheme(DEFAULTS, 'does-not-exist')).toBeNull();
    expect(findTheme(DEFAULTS, 'amoled')?.name).toBe('AMOLED Black');
  });
});

describe('custom theme validation', () => {
  const good = {
    id: 'custom-abc123',
    name: ' Mine ',
    scheme: 'dark',
    colors: { ...BUILTIN_THEMES[0]!.colors, bg: '#ABCDEF' },
  };

  it('keeps valid themes (normalized) and drops invalid ones', () => {
    const s = setPath(DEFAULTS, 'theme.custom', [
      good,
      { ...good, id: 'evil"><script>' },
      { ...good, colors: { ...good.colors, text: 'red; background: url(x)' } },
      'garbage',
    ]);
    expect(s.theme.custom).toHaveLength(1);
    expect(s.theme.custom[0]!.name).toBe('Mine');
    expect(s.theme.custom[0]!.colors.bg).toBe('#abcdef');
  });

  it('rejects malformed schedule times and radius', () => {
    const s = validate({ theme: { scheduleStart: '25:00', radius: 99 } });
    expect(s.theme.scheduleStart).toBe(DEFAULTS.theme.scheduleStart);
    expect(s.theme.radius).toBe(DEFAULTS.theme.radius);
  });
});

describe('themeCss', () => {
  const amoled = BUILTIN_THEMES.find((t) => t.id === 'amoled')!;

  it('defines tokens and remaps discovered variables with preserved alpha', () => {
    const css = themeCss(amoled, [
      { name: '--tbg', role: 'bg', da: 1, la: 1 },
      { name: '--tglass', role: 'bg', da: 0.8, la: 0.95 },
      { name: '--thover', role: 'textOverlay', da: 0.1, la: 0.05 },
    ]);
    expect(css).toContain('--by-bg: #000000');
    expect(css).toContain('--tbg: rgba(0, 0, 0, 1) !important');
    expect(css).toContain('--tglass: rgba(0, 0, 0, 0.8) !important');
    expect(css).toContain('--thover: rgba(241, 241, 241, 0.1) !important');
    expect(css).toContain('html[betteryt-theme] [dark]');
  });

  it('uses the light-side alpha for light themes', () => {
    const light = BUILTIN_THEMES.find((t) => t.scheme === 'light')!;
    const css = themeCss(light, [{ name: '--thover', role: 'textOverlay', da: 0.1, la: 0.05 }]);
    expect(css).toContain('--thover: rgba(17, 19, 24, 0.05) !important');
  });
});
