/** Pure CSS generation for a theme + discovered variable map (unit-tested). */
import { mix, parseColor, rgba, type Theme } from '../shared/themes';
import type { Role, VarEntry } from './theme-vars';

function roleColor(theme: Theme, role: Role): string {
  const c = theme.colors;
  switch (role) {
    case 'textDisabled':
      return mix(c.text2, c.bg, 0.35);
    case 'textOverlay':
      return c.text;
    case 'bgOverlay':
      return c.bg;
    default:
      return c[role];
  }
}

export function themeCss(theme: Theme, vars: readonly VarEntry[]): string {
  const c = theme.colors;
  const text = parseColor(c.text) ?? [241, 241, 241, 1];
  const dark = theme.scheme === 'dark';
  const tokens = [
    `--by-scheme: ${theme.scheme}`,
    `--by-bg: ${c.bg}`,
    `--by-surface: ${c.surface}`,
    `--by-elevated: ${c.elevated}`,
    `--by-text: ${c.text}`,
    `--by-text2: ${c.text2}`,
    `--by-accent: ${c.accent}`,
    `--by-divider: ${c.divider}`,
    `--by-scrollbar: ${c.scrollbar}`,
    `--by-selection: ${c.selection}`,
    `--by-hover: ${rgba(text, dark ? 0.1 : 0.05)}`,
    `--by-pressed: ${rgba(text, dark ? 0.2 : 0.1)}`,
  ];
  const remaps = vars.map((v) => {
    const color = parseColor(roleColor(theme, v.role)) ?? text;
    return `${v.name}: ${rgba(color, color[3] * (dark ? v.da : v.la))} !important`;
  });
  return (
    `html[betteryt-theme] { ${tokens.join('; ')}; }\n` +
    (remaps.length
      ? `html[betteryt-theme], html[betteryt-theme] [dark], html[betteryt-theme] [light] { ${remaps.join('; ')}; }\n`
      : '')
  );
}
