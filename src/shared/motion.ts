/**
 * Motion design tokens. CSS consumers use the custom properties in content/css/motion.css, which
 * must stay in sync with these values (enforced by tests/motion.test.ts).
 *
 * Rules: animate only transform and opacity (filter sparingly), add will-change only while
 * animating, cap staggers at STAGGER_CAP items, and collapse everything to opacity/instant when
 * the effective animation level is 'reduced' or 'off'.
 */
import type { AnimationLevel } from './settings-schema';

export const DURATIONS = { instant: 90, fast: 160, base: 240, slow: 360 } as const;
export type DurationToken = keyof typeof DURATIONS;

export const EASINGS = {
  standard: 'cubic-bezier(.2,0,0,1)',
  emphasized: 'cubic-bezier(.3,0,0,1)',
} as const;

export const STAGGER_STEP = 32;
export const STAGGER_CAP = 12;

/** Duration multiplier per animation level ('off' disables motion entirely). */
export const LEVEL_SCALE: Readonly<Record<AnimationLevel, number>> = {
  off: 0,
  reduced: 0.5,
  standard: 1,
  expressive: 1.25,
};

/**
 * Approximates a damped spring as a CSS `linear()` easing by sampling the analytic step response.
 * Default (zeta 0.62, omega 11) settles with one gentle overshoot (~8%).
 */
export function springEasing(zeta = 0.62, omega = 11, samples = 16): string {
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples; // normalized time; spring time = t * 1s
    const x =
      i === samples
        ? 1
        : 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
    pts.push(String(Math.round(x * 1000) / 1000));
  }
  return `linear(${pts.join(', ')})`;
}

export const SPRING = springEasing();

/** Delay for the i-th item in a staggered entrance, capped so long lists don't drag. */
export function staggerDelay(index: number, level: AnimationLevel): number {
  return Math.min(index, STAGGER_CAP) * STAGGER_STEP * LEVEL_SCALE[level];
}

export function duration(token: DurationToken, level: AnimationLevel): number {
  return Math.round(DURATIONS[token] * LEVEL_SCALE[level]);
}

/** Reads the effective level BetterYT set on <html> (content scripts only). */
export function currentLevel(): AnimationLevel {
  const v = document.documentElement.getAttribute('by-anim');
  return v === 'off' || v === 'reduced' || v === 'expressive' ? v : 'standard';
}

/**
 * WAAPI helper that honours the animation level: 'off' skips, 'reduced' keeps only opacity.
 * Returns the Animation, or null when skipped.
 */
export function animate(
  el: Element,
  keyframes: Keyframe[],
  token: DurationToken = 'base',
  easing: string = EASINGS.standard,
  delay = 0,
): Animation | null {
  const level = currentLevel();
  if (level === 'off') return null;
  const frames =
    level === 'reduced'
      ? keyframes.map((k) =>
          k.opacity === undefined ? { offset: k.offset } : { opacity: k.opacity, offset: k.offset },
        )
      : keyframes;
  return el.animate(frames, { duration: duration(token, level), easing, delay, fill: 'backwards' });
}
