import { registry, type Feature } from '../../features/registry';
import { ctx, defineAction, send } from '../context';
import { getPlayer, getVideo, isTyping, onNewVideo } from '../player';
import { hud } from '../ui';

/**
 * Audio: mouse-wheel volume over the player, volume boost up to 400 % through WebAudio with an
 * optional limiter, loudness leveling, remember volume and mute-on-start.
 *
 * The WebAudio graph is only built once boost or leveling is actually used, because routing a
 * media element through an AudioContext is permanent for that element.
 */

const ID = 'audio';

interface Graph {
  ctx: AudioContext;
  gain: GainNode;
  leveler: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
}

const graphs = new WeakMap<HTMLMediaElement, Graph>();
const off: Array<() => void> = [];
let ownVolume: number | null = null;

function graphFor(video: HTMLVideoElement): Graph | null {
  const existing = graphs.get(video);
  if (existing) return existing;
  try {
    const ac = new AudioContext();
    const source = ac.createMediaElementSource(video);
    const leveler = ac.createDynamicsCompressor();
    const gain = ac.createGain();
    const limiter = ac.createDynamicsCompressor();
    source.connect(leveler).connect(gain).connect(limiter).connect(ac.destination);
    const g = { ctx: ac, gain, leveler, limiter };
    graphs.set(video, g);
    // Autoplay policy: a context created without a gesture starts suspended.
    const resume = (): void => void ac.resume().catch(() => undefined);
    video.addEventListener('play', resume);
    document.addEventListener('pointerdown', resume, { once: true, capture: true });
    resume();
    return g;
  } catch (e) {
    registry.report(ID, e);
    return null;
  }
}

function setCompressor(node: DynamicsCompressorNode, on: boolean, preset: 'level' | 'limit'): void {
  const p = on
    ? preset === 'level'
      ? { threshold: -24, knee: 30, ratio: 4, attack: 0.003, release: 0.25 }
      : { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.1 }
    : { threshold: 0, knee: 0, ratio: 1, attack: 0.003, release: 0.25 };
  node.threshold.value = p.threshold;
  node.knee.value = p.knee;
  node.ratio.value = p.ratio;
  node.attack.value = p.attack;
  node.release.value = p.release;
}

function applyAudio(video: HTMLVideoElement): void {
  const p = ctx.settings.player;
  const needGraph = p.boost > 100 || p.normalize;
  const g = needGraph ? graphFor(video) : graphs.get(video);
  if (!g) return;
  // Leveling adds ~+6 dB make-up so quiet videos come up, loud ones get squeezed.
  setCompressor(g.leveler, p.normalize, 'level');
  setCompressor(g.limiter, p.limiter && (p.boost > 100 || p.normalize), 'limit');
  const makeup = p.normalize ? 2 : 1;
  g.gain.gain.setTargetAtTime((p.boost / 100) * makeup, g.ctx.currentTime, 0.05);
}

function setVolume(v: number): void {
  const player = getPlayer();
  const vol = Math.round(Math.min(100, Math.max(0, v)));
  ownVolume = vol;
  if (vol > 0 && player?.isMuted?.()) player.unMute?.();
  player?.setVolume?.(vol);
  hud(`${vol} %`);
  if (ctx.settings.player.rememberVolume) {
    ctx.memory.volume = vol;
    send('memory', { volume: vol });
  }
}

function onWheel(e: WheelEvent): void {
  if (!ctx.settings.player.wheelVolume) return;
  const player = getPlayer();
  const target = e.target as Element;
  if (!player || !player.contains(target) || isTyping(target)) return;
  // Don't steal scrolling from menus, the progress bar's chapter list, or our own speed button.
  if (
    target.closest(
      '.ytp-panel, .ytp-popup, [data-betteryt-btn="speed"], .ytp-chrome-bottom .ytp-progress-bar-container',
    )
  )
    return;
  e.preventDefault();
  const step = ctx.settings.player.volumeStep;
  setVolume((player.getVolume?.() ?? 100) + (e.deltaY < 0 ? step : -step));
}

function onVolumeChange(): void {
  if (!ctx.settings.player.rememberVolume) return;
  const v = getPlayer()?.getVolume?.();
  if (typeof v !== 'number' || v === ownVolume) return;
  ctx.memory.volume = v;
  send('memory', { volume: v });
}

const BOOST_STEPS = [100, 150, 200, 300, 400];

export function cycleBoost(): number {
  const cur = ctx.settings.player.boost;
  const next = BOOST_STEPS.find((b) => b > cur) ?? 100;
  // Session-only change (the setting itself is edited on the options page).
  ctx.settings = { ...ctx.settings, player: { ...ctx.settings.player, boost: next } };
  const video = getVideo();
  if (video) applyAudio(video);
  hud(next === 100 ? 'Boost off' : `Boost ${next} %`);
  return next;
}

export const audio: Feature = {
  id: ID,
  enabled: (s) => s.player.enabled,
  init() {
    defineAction('boost', () => void cycleBoost());
    off.push(
      onNewVideo(
        registry.guard(ID, ({ player, video }) => {
          const p = ctx.settings.player;
          applyAudio(video);
          video.removeEventListener('volumechange', onVolumeChange);
          video.addEventListener('volumechange', onVolumeChange);
          if (p.muteOnStart) player.mute?.();
          else if (p.rememberVolume && ctx.memory.volume !== null) {
            ownVolume = ctx.memory.volume;
            player.setVolume?.(ctx.memory.volume);
          }
        }),
      ),
    );
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    off.push(() => document.removeEventListener('wheel', onWheel, { capture: true }));
  },
  update() {
    const video = getVideo();
    if (video) applyAudio(video);
  },
  destroy() {
    for (const f of off.splice(0)) f();
    // Graphs stay attached (they can't be detached) but go neutral.
    const video = getVideo();
    const g = video && graphs.get(video);
    if (g) {
      g.gain.gain.value = 1;
      setCompressor(g.leveler, false, 'level');
      setCompressor(g.limiter, false, 'limit');
    }
  },
};
