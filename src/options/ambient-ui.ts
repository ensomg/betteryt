import { STRINGS } from '../shared/strings';
import { h } from '../shared/dom';
import { getSettings, onRefresh } from './state';

/**
 * Live ambient-light demo: an animated "video" (moving color blobs on a canvas) with the same
 * glow pipeline as the content script (tiny canvas, CSS blur/saturate/scale), using the current
 * settings. Animation stops when the page is hidden or the section isn't visible.
 */

const W = 32;
const H = 18;

export function renderAmbientDemo(): HTMLElement {
  const screen = h('canvas', { class: 'amb-demo__screen', width: 320, height: 180, 'aria-hidden': 'true' });
  const glow = h('canvas', { class: 'amb-demo__glow', width: W, height: H, 'aria-hidden': 'true' });
  const stage = h('div', { class: 'amb-demo' }, glow, screen);
  const sg = screen.getContext('2d')!;
  const gg = glow.getContext('2d', { alpha: false })!;
  let raf = 0;
  let last = 0;

  const frame = (t: number): void => {
    raf = 0;
    if (document.hidden || !stage.isConnected || stage.offsetParent === null) return;
    // Fake video: three drifting colored blobs.
    sg.fillStyle = '#05060a';
    sg.fillRect(0, 0, 320, 180);
    const blobs: Array<[string, number, number]> = [
      ['#ff3d6e', 0.0004, 0],
      ['#3da5ff', 0.0003, 2],
      ['#ffd23d', 0.0005, 4],
    ];
    for (const [color, speed, phase] of blobs) {
      const x = 160 + Math.cos(t * speed + phase) * 120;
      const y = 90 + Math.sin(t * speed * 1.3 + phase) * 60;
      const grad = sg.createRadialGradient(x, y, 0, x, y, 110);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'transparent');
      sg.fillStyle = grad;
      sg.fillRect(0, 0, 320, 180);
    }
    const a = getSettings().ambient;
    if (t - last >= 1000 / a.fps) {
      const dt = last ? t - last : 1000 / a.fps;
      last = t;
      gg.globalAlpha = a.transition > 0 ? Math.min(1, 1 - Math.exp(-dt / a.transition)) : 1;
      gg.drawImage(screen, 0, 0, W, H);
    }
    raf = requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', start);
  window.addEventListener('hashchange', () => setTimeout(start, 50));

  onRefresh(() => {
    const a = getSettings().ambient;
    glow.style.setProperty('--blur', `${a.blur}px`);
    glow.style.setProperty('--sat', String(a.saturation));
    glow.style.setProperty('--scale', String(a.spread));
    glow.style.opacity = a.enabled ? String(a.intensity) : '0';
    start();
  });

  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, STRINGS.options.ambientDemo),
    h('div', { class: 'group__body amb-demo__wrap' }, stage),
  );
}
