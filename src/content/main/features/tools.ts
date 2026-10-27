import { h } from '../../../shared/dom';
import { STRINGS } from '../../../shared/strings';
import { registry, type Feature } from '../../features/registry';
import { showToast } from '../../ui/toast';
import { ctx, defineAction, send } from '../context';
import { currentVideoId, formatTime, getPlayer, getVideo, onNewVideo } from '../player';
import { hud } from '../ui';

/**
 * Player tools: loop, A–B repeat with markers on the progress bar, screenshot, Picture-in-Picture,
 * popup player, copy-at-timestamp (URL or Markdown) and a compact stats overlay.
 */

const ID = 'tools';
const T = STRINGS.playerUi;

const off: Array<() => void> = [];

/* ---------- Loop & A–B ---------- */

const ab: { a: number | null; b: number | null } = { a: null, b: null };
let abVideo: HTMLVideoElement | null = null;

export function abState(): 'off' | 'a' | 'ab' {
  return ab.a === null ? 'off' : ab.b === null ? 'a' : 'ab';
}

function onAbTime(): void {
  const v = abVideo;
  if (!v || ab.a === null || ab.b === null) return;
  if (v.currentTime >= ab.b || v.currentTime < ab.a - 0.5) v.currentTime = ab.a;
}

function drawMarkers(): void {
  const bar = document.querySelector<HTMLElement>('.ytp-progress-bar');
  const v = getVideo();
  bar?.querySelectorAll('.betteryt-ab-marker, .betteryt-ab-range').forEach((m) => m.remove());
  if (!bar || !v || !Number.isFinite(v.duration) || ab.a === null) return;
  const pct = (t: number): string => `${(t / v.duration) * 100}%`;
  if (ab.b !== null) {
    bar.append(
      h('div', {
        class: 'betteryt-ab-range',
        style: `left:${pct(ab.a)};width:calc(${pct(ab.b)} - ${pct(ab.a)})`,
      }),
    );
  }
  for (const [label, t] of [
    ['A', ab.a],
    ['B', ab.b],
  ] as const) {
    if (t === null) continue;
    const m = h('div', {
      class: 'betteryt-ab-marker',
      'data-label': label,
      style: `left:${pct(t)}`,
      title: `${label}: ${formatTime(t)}`,
    });
    // Drag a marker along the bar to adjust it.
    m.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      m.setPointerCapture(e.pointerId);
      const rect = bar.getBoundingClientRect();
      const move = (ev: PointerEvent): void => {
        const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) * v.duration;
        if (label === 'A') ab.a = ab.b !== null ? Math.min(x, ab.b - 0.5) : x;
        else ab.b = Math.max(x, (ab.a ?? 0) + 0.5);
        drawMarkers();
      };
      const up = (): void => {
        m.removeEventListener('pointermove', move);
        m.removeEventListener('pointerup', up);
      };
      m.addEventListener('pointermove', move);
      m.addEventListener('pointerup', up);
    });
    bar.append(m);
  }
}

export function cycleAb(): void {
  const v = getVideo();
  if (!v) return;
  if (abVideo !== v) {
    abVideo?.removeEventListener('timeupdate', onAbTime);
    abVideo = v;
    v.addEventListener('timeupdate', onAbTime);
  }
  if (ab.a === null) {
    ab.a = v.currentTime;
    hud(`A ${formatTime(ab.a)}`);
  } else if (ab.b === null) {
    if (v.currentTime <= ab.a + 0.5) {
      hud(T.abTooShort);
      return;
    }
    ab.b = v.currentTime;
    v.currentTime = ab.a;
    hud(`A–B ${formatTime(ab.a)} – ${formatTime(ab.b)}`);
  } else {
    ab.a = ab.b = null;
    hud(T.abOff);
  }
  drawMarkers();
  document.dispatchEvent(new CustomEvent('betteryt-controls-refresh'));
}

export function toggleLoop(): boolean {
  const v = getVideo();
  if (!v) return false;
  v.loop = !v.loop;
  hud(v.loop ? T.loopOn : T.loopOff);
  document.dispatchEvent(new CustomEvent('betteryt-controls-refresh'));
  return v.loop;
}

/* ---------- Screenshot ---------- */

async function screenshot(): Promise<void> {
  const v = getVideo();
  if (!v || !v.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  const g = canvas.getContext('2d');
  if (!g) return;
  try {
    g.drawImage(v, 0, 0);
    if (ctx.settings.player.screenshotTimestamp) {
      const label = formatTime(v.currentTime);
      const size = Math.max(14, Math.round(canvas.height / 30));
      g.font = `600 ${size}px Roboto, Arial, sans-serif`;
      g.fillStyle = 'rgba(0,0,0,.55)';
      const w = g.measureText(label).width;
      g.fillRect(canvas.width - w - size * 1.6, canvas.height - size * 2.2, w + size, size * 1.6);
      g.fillStyle = '#fff';
      g.fillText(label, canvas.width - w - size * 1.1, canvas.height - size * 0.95);
    }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('empty');
    if (ctx.settings.player.screenshotTarget === 'clipboard' && 'ClipboardItem' in window) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast(T.screenshotCopied);
      return;
    }
    const title = (getPlayer()?.getVideoData?.()?.title ?? 'youtube')
      .replace(/[\\/:*?"<>|]+/g, '')
      .slice(0, 80);
    const url = URL.createObjectURL(blob);
    h('a', { href: url, download: `${title} ${formatTime(v.currentTime).replace(/:/g, '-')}.png` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(T.screenshotSaved);
  } catch {
    // Protected (DRM) videos taint the canvas.
    showToast(T.screenshotBlocked);
  }
}

/* ---------- PiP, popup, timestamps ---------- */

async function togglePip(): Promise<void> {
  const v = getVideo();
  if (!v) return;
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await v.requestPictureInPicture();
  } catch {
    showToast(T.pipUnavailable);
  }
}

function popup(): void {
  const v = getVideo();
  const vid = currentVideoId();
  if (!v || !vid) return;
  const t = Math.floor(v.currentTime);
  v.pause();
  window.open(
    `https://www.youtube.com/embed/${encodeURIComponent(vid)}?autoplay=1&start=${t}`,
    'betteryt-popup',
    'popup,width=854,height=480',
  );
}

async function copyTimestamp(): Promise<void> {
  const v = getVideo();
  const vid = currentVideoId();
  if (!v || !vid) return;
  const t = Math.floor(v.currentTime);
  const url = `https://youtu.be/${vid}?t=${t}`;
  const title = getPlayer()?.getVideoData?.()?.title ?? 'YouTube';
  try {
    await navigator.clipboard.writeText(url);
    showToast(`${T.copied} ${formatTime(t)}`, {
      action: {
        label: T.copyMarkdown,
        run: () =>
          void navigator.clipboard.writeText(`[${title.replace(/[[\]]/g, '')} (${formatTime(t)})](${url})`),
      },
    });
  } catch {
    showToast(T.copyFailed);
  }
}

/* ---------- Stats overlay ---------- */

let statsEl: HTMLElement | null = null;
let statsTimer: ReturnType<typeof setInterval> | undefined;

function renderStats(): void {
  const v = getVideo();
  const player = getPlayer();
  if (!statsEl || !v) return;
  const nerd = player?.getStatsForNerds?.() ?? {};
  const q = v.getVideoPlaybackQuality?.();
  let buffer = 0;
  for (let i = 0; i < v.buffered.length; i++) {
    if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime)
      buffer = v.buffered.end(i) - v.currentTime;
  }
  const rows: Array<[string, string]> = [
    // "854x480@30 / 640x360@30" = current / optimal resolution @ fps.
    [T.statsResolution, nerd.resolution ?? `${v.videoWidth}×${v.videoHeight}`],
    [T.statsCodec, (nerd.codecs ?? '—').replace(/\s*\(\d+\)/g, '')],
    [T.statsBitrate, nerd.bandwidth_kbps ?? nerd.connection_speed ?? '—'],
    [T.statsDropped, q ? `${q.droppedVideoFrames} / ${q.totalVideoFrames}` : '—'],
    [T.statsBuffer, `${buffer.toFixed(1)} s`],
    [T.statsSpeed, `${v.playbackRate}×`],
  ];
  statsEl.replaceChildren(
    ...rows.map(([k, val]) => h('div', { class: 'betteryt-stats__row' }, h('span', {}, k), h('b', {}, val))),
  );
}

export function toggleStats(): boolean {
  if (statsEl) {
    statsEl.remove();
    statsEl = null;
    clearInterval(statsTimer);
    return false;
  }
  const player = getPlayer();
  if (!player) return false;
  statsEl = h('div', { class: 'betteryt-stats', role: 'status' });
  player.append(statsEl);
  renderStats();
  // Refresh only while the overlay is open.
  statsTimer = setInterval(registry.guard(ID, renderStats), 1000);
  return true;
}

export const tools: Feature = {
  id: ID,
  enabled: (s) => s.player.enabled,
  init() {
    defineAction('loop', () => void toggleLoop());
    defineAction('abRepeat', cycleAb);
    defineAction('screenshot', () => void screenshot());
    defineAction('pip', () => void togglePip());
    defineAction('popup', popup);
    defineAction('copyTimestamp', () => void copyTimestamp());
    defineAction('stats', () => void toggleStats());
    defineAction('cinema', () => send('mode', { name: 'cinema' }));
    off.push(
      onNewVideo(
        registry.guard(ID, () => {
          // A–B points belong to one video.
          ab.a = ab.b = null;
          drawMarkers();
        }),
      ),
    );
  },
  update() {},
  destroy() {
    for (const f of off.splice(0)) f();
    abVideo?.removeEventListener('timeupdate', onAbTime);
    abVideo = null;
    ab.a = ab.b = null;
    drawMarkers();
    if (statsEl) toggleStats();
  },
};
