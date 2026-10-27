import type { Settings } from '../../shared/settings-schema';
import { STRINGS } from '../../shared/strings';
import { h } from '../../shared/dom';
import { onNavigate } from '../nav';
import { onMode } from '../player-bridge';
import { showToast } from '../ui/toast';
import { registry, type Feature } from './registry';

/**
 * Ambient light + cinema mode.
 *
 * Ambient: the playing <video> is sampled into a tiny 32×18 canvas at `fps` (via
 * requestVideoFrameCallback, rAF fallback). The canvas is CSS-scaled behind the player, blurred
 * and saturated on the GPU (pointer-events: none). Frames are blended with exponential smoothing
 * for soft color transitions. Work stops when the tab is hidden, the video is paused, or the
 * layout makes the glow invisible (theater unless enabled, fullscreen). If drawImage ever throws
 * (tainted / protected video) the glow falls back to a static accent color.
 *
 * Cinema: dims everything except the player (no stacking-context tricks: other regions simply
 * fade), toggled from the player button / shortcut (bus 'mode' message) and optionally on play.
 */

const ID = 'ambient';
const W = 32;
const H = 18;
const root = document.documentElement;

let settings: Settings | null = null;
let offNav: (() => void) | null = null;
let layoutObserver: MutationObserver | null = null;

let canvas: HTMLCanvasElement | null = null;
let ctx2d: CanvasRenderingContext2D | null = null;
let video: HTMLVideoElement | null = null;
let frameHandle = 0;
let usingRvfc = false;
let lastDraw = 0;
let tainted = false;

/* ---------- Where does the glow go? ---------- */

function target(): { host: HTMLElement; video: HTMLVideoElement; kind: 'watch' | 'shorts' } | null {
  const s = settings!.ambient;
  if (location.pathname === '/watch' && s.applyWatch) {
    const flexy = document.querySelector('ytd-watch-flexy');
    if (flexy?.hasAttribute('theater') && !s.applyTheater) return null;
    if (document.fullscreenElement) return null;
    // YouTube's own ambient-mode container has the player's geometry and sits behind it.
    // (Anything placed inside #player-container collapses the player to 0 px — verified live.)
    const host = document.querySelector<HTMLElement>('ytd-watch-flexy #cinematics-container');
    const v = document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video');
    return host && v ? { host, video: v, kind: 'watch' } : null;
  }
  if (location.pathname.startsWith('/shorts/') && s.applyShorts) {
    const host = document.querySelector<HTMLElement>(
      'ytd-shorts ytd-reel-video-renderer #cinematic-container',
    );
    const v = document.querySelector<HTMLVideoElement>('#shorts-player video');
    return host && v ? { host, video: v, kind: 'shorts' } : null;
  }
  return null;
}

function darkEnough(): boolean {
  if (!settings!.ambient.onlyDark) return true;
  const theme = root.getAttribute('betteryt-theme');
  if (theme) return getComputedStyle(root).getPropertyValue('--by-scheme').trim() !== 'light';
  return root.hasAttribute('dark');
}

/* ---------- Rendering ---------- */

function applyStyle(): void {
  if (!canvas || !settings) return;
  const a = settings.ambient;
  // Performance mode: cheaper blur.
  const blur = root.hasAttribute('by-perf') ? Math.min(a.blur, 30) : a.blur;
  canvas.style.setProperty('--by-amb-blur', `${blur}px`);
  canvas.style.setProperty('--by-amb-sat', String(a.saturation));
  canvas.style.setProperty('--by-amb-scale', String(a.spread));
  canvas.style.setProperty('--by-amb-opacity', String(a.intensity));
}

function draw(now: number): void {
  const v = video;
  const g = ctx2d;
  const s = settings?.ambient;
  if (!v || !g || !s || tainted) return;
  const interval = 1000 / s.fps;
  if (now - lastDraw >= interval - 2) {
    const dt = lastDraw ? now - lastDraw : interval;
    lastDraw = now;
    // Exponential smoothing: blend the new frame over the old one.
    g.globalAlpha = s.transition > 0 ? Math.min(1, 1 - Math.exp(-dt / s.transition)) : 1;
    try {
      g.drawImage(v, 0, 0, W, H);
    } catch {
      fallbackGlow();
      return;
    }
  }
  scheduleFrame();
}

function scheduleFrame(): void {
  const v = video;
  if (!v || v.paused || v.ended || document.hidden) return;
  if ('requestVideoFrameCallback' in v) {
    usingRvfc = true;
    frameHandle = v.requestVideoFrameCallback((now) => registry.guard(ID, draw)(now));
  } else {
    usingRvfc = false;
    frameHandle = requestAnimationFrame((now) => registry.guard(ID, draw)(now));
  }
}

function cancelFrame(): void {
  if (!frameHandle) return;
  if (usingRvfc && video && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(frameHandle);
  else cancelAnimationFrame(frameHandle);
  frameHandle = 0;
}

/** Protected or cross-origin frames can't be read: use a static accent-colored glow instead. */
function fallbackGlow(): void {
  tainted = true;
  cancelFrame();
  if (!ctx2d) return;
  const accent = getComputedStyle(root).getPropertyValue('--by-accent').trim() || '#3a5cff';
  ctx2d.globalAlpha = 1;
  ctx2d.fillStyle = accent;
  ctx2d.fillRect(0, 0, W, H);
}

function setVisible(on: boolean): void {
  canvas?.classList.toggle('betteryt-ambient--on', on);
}

const onPlay = registry.guard(ID, () => {
  setVisible(true);
  if (!frameHandle) scheduleFrame();
  if (settings?.ambient.cinemaOnPlay && location.pathname === '/watch') setCinema(true);
});
const onPause = registry.guard(ID, () => {
  cancelFrame();
  if (settings?.ambient.fadeOnPause) setVisible(false);
});
const onVisibility = registry.guard(ID, () => {
  if (document.hidden) cancelFrame();
  else if (video && !video.paused) scheduleFrame();
});

function detach(): void {
  cancelFrame();
  video?.removeEventListener('play', onPlay);
  video?.removeEventListener('playing', onPlay);
  video?.removeEventListener('pause', onPause);
  video?.removeEventListener('ended', onPause);
  video = null;
  canvas?.remove();
  canvas = null;
  ctx2d = null;
  tainted = false;
  lastDraw = 0;
}

function ensure(): void {
  const s = settings;
  if (!s?.ambient.enabled || !darkEnough()) {
    detach();
    root.removeAttribute('by-ambient');
    return;
  }
  const t = target();
  if (!t) {
    detach();
    root.removeAttribute('by-ambient');
    return;
  }
  root.setAttribute('by-ambient', t.kind);
  if (canvas && canvas.parentElement === t.host && video === t.video) {
    applyStyle();
    return;
  }
  detach();
  canvas = h('canvas', {
    class: `betteryt-ambient betteryt-ambient--${t.kind}`,
    width: W,
    height: H,
    'aria-hidden': 'true',
  });
  ctx2d = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  t.host.append(canvas);
  applyStyle();
  video = t.video;
  video.addEventListener('play', onPlay);
  video.addEventListener('playing', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('ended', onPause);
  if (!video.paused) onPlay();
  else if (!s.ambient.fadeOnPause) {
    setVisible(true);
    // Paint the paused frame once.
    requestAnimationFrame((now) => registry.guard(ID, draw)(now));
  }
}

/* ---------- Cinema mode ---------- */

function setCinema(on: boolean): void {
  root.toggleAttribute('by-cinema', on);
  if (on && settings) root.style.setProperty('--by-cinema-dim', String(settings.ambient.cinemaDim));
}

function toggleCinema(): void {
  if (location.pathname !== '/watch') return;
  const on = !root.hasAttribute('by-cinema');
  setCinema(on);
  showToast(on ? STRINGS.ambientUi.cinemaOn : STRINGS.ambientUi.cinemaOff, { duration: 1500 });
}

/* ---------- Lifecycle ---------- */

const onPage = registry.guard(ID, () => {
  if (location.pathname !== '/watch') setCinema(false);
  ensure();
  observeLayout();
});

function observeLayout(): void {
  layoutObserver?.disconnect();
  const flexy = document.querySelector('ytd-watch-flexy');
  const guard = registry.guard(ID, ensure);
  layoutObserver = new MutationObserver(guard);
  // Theater toggles and dark-mode switches change attributes, not children.
  if (flexy) layoutObserver.observe(flexy, { attributes: true, attributeFilter: ['theater', 'fullscreen'] });
  layoutObserver.observe(root, { attributes: true, attributeFilter: ['dark', 'betteryt-theme'] });
}

const onFullscreen = registry.guard(ID, ensure);

export const ambient: Feature = {
  id: ID,
  enabled: () => true, // ambient may be off while cinema mode (and its shortcut) still works
  init(s) {
    settings = s;
    onMode('cinema', registry.guard(ID, toggleCinema));
    offNav = onNavigate(onPage);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    onPage();
  },
  update(s) {
    settings = s;
    if (root.hasAttribute('by-cinema'))
      root.style.setProperty('--by-cinema-dim', String(s.ambient.cinemaDim));
    ensure();
  },
  destroy() {
    settings = null;
    offNav?.();
    offNav = null;
    layoutObserver?.disconnect();
    layoutObserver = null;
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('fullscreenchange', onFullscreen);
    onMode('cinema', () => undefined);
    detach();
    setCinema(false);
    root.removeAttribute('by-ambient');
    root.style.removeProperty('--by-cinema-dim');
  },
};
