/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DURATIONS, EASINGS, SPRING, STAGGER_CAP, STAGGER_STEP, staggerDelay } from '../src/shared/motion';
import { LAYOUT_BEHAVIOURS, LAYOUT_OPTIONS, layoutAttr } from '../src/shared/layout-options';
import { STRINGS } from '../src/shared/strings';
import { DEFAULTS } from '../src/shared/settings-schema';

const css = (file: string): string =>
  readFileSync(new URL(`../src/content/css/${file}`, import.meta.url), 'utf8');
const compact = (s: string): string => s.replace(/\s+/g, '');

describe('motion tokens', () => {
  const motion = css('motion.css');
  const base = motion.slice(0, motion.indexOf("html[by-anim='reduced']"));

  it('motion.css mirrors motion.ts durations', () => {
    for (const [name, ms] of Object.entries(DURATIONS)) expect(base).toContain(`--by-dur-${name}: ${ms}ms;`);
    expect(base).toContain(`--by-stagger: ${STAGGER_STEP}ms;`);
  });

  it('motion.css mirrors motion.ts easings and spring', () => {
    expect(compact(base)).toContain(compact(`--by-ease-standard: ${EASINGS.standard.replace('.2', '0.2')}`));
    expect(compact(base)).toContain(
      compact(`--by-ease-emphasized: ${EASINGS.emphasized.replace('.3', '0.3')}`),
    );
    expect(compact(base)).toContain(compact(`--by-ease-spring: ${SPRING}`));
  });

  it('spring settles at 1 and staggers are capped', () => {
    expect(SPRING.endsWith(', 1)')).toBe(true);
    expect(staggerDelay(100, 'standard')).toBe(STAGGER_CAP * STAGGER_STEP);
    expect(staggerDelay(3, 'off')).toBe(0);
  });
});

describe('layout options', () => {
  const layoutCss = css('layout.css');

  it('every hide option has a CSS rule, label and default', () => {
    for (const o of LAYOUT_OPTIONS) {
      if (!LAYOUT_BEHAVIOURS.has(o.key)) expect(layoutCss, o.key).toContain(`html[${layoutAttr(o.key)}]`);
      expect(STRINGS.settings[`layout.${o.key}`], o.key).toBeDefined();
      expect(DEFAULTS.layout[o.key]).toBe(false);
    }
  });

  it('builds kebab-case attributes', () => {
    expect(layoutAttr('homeHideChips')).toBe('by-home-hide-chips');
  });

  it('the distraction-free preset is non-empty', () => {
    expect(LAYOUT_OPTIONS.filter((o) => o.preset).length).toBeGreaterThan(5);
  });
});
