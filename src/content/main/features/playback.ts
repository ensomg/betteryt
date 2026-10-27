import { pickQuality } from '../../../shared/player-options';
import { registry, type Feature } from '../../features/registry';
import { ctx, defineAction, send } from '../context';
import { currentChannel, getPlayer, getVideo, onNewVideo, PLAYER_STATE, type YtPlayer } from '../player';
import { hud } from '../ui';

/**
 * Playback speed (default, remember globally / per channel, step, wheel) and automatic quality
 * (default + fullscreen ladder, optional Premium bitrate).
 */

const ID = 'playback';
const MIN_RATE = 0.1;
const MAX_RATE = 16;

const off: Array<() => void> = [];
/** Rate we set ourselves; ratechange events matching it are not user choices. */
let ownRate: number | null = null;
let qualityDoneFor = '';

const clampRate = (r: number): number => Math.round(Math.min(MAX_RATE, Math.max(MIN_RATE, r)) * 100) / 100;

export function setRate(rate: number, announce = true): void {
  const player = getPlayer();
  const video = getVideo(player);
  if (!video) return;
  const r = clampRate(rate);
  ownRate = r;
  // The player API keeps YouTube's own speed menu in sync, but only accepts 0.25–2 (or its list).
  const apiRates = player?.getAvailablePlaybackRates?.() ?? [];
  if (player?.setPlaybackRate && apiRates.includes(r)) player.setPlaybackRate(r);
  video.playbackRate = r;
  if (announce) hud(`${r}×`);
  remember(r);
}

export function currentRate(): number {
  return getVideo()?.playbackRate ?? 1;
}

function remember(rate: number): void {
  const mode = ctx.settings.player.rememberSpeed;
  if (mode === 'global') {
    ctx.memory.speed = rate;
    send('memory', { speed: rate });
  } else if (mode === 'channel') {
    const ch = currentChannel();
    if (ch) {
      ctx.memory.channelSpeed[ch] = rate;
      send('memory', { channel: ch, channelValue: rate });
    }
  }
}

function initialRate(): number {
  const p = ctx.settings.player;
  if (p.rememberSpeed === 'global' && ctx.memory.speed) return ctx.memory.speed;
  if (p.rememberSpeed === 'channel') {
    const ch = currentChannel();
    if (ch && ctx.memory.channelSpeed[ch]) return ctx.memory.channelSpeed[ch]!;
  }
  return p.defaultSpeed;
}

function onRateChange(e: Event): void {
  const v = e.target as HTMLVideoElement;
  if (ownRate !== null && Math.abs(v.playbackRate - ownRate) < 0.001) return;
  // The user changed speed through YouTube's own menu or keys: remember that choice.
  ownRate = v.playbackRate;
  remember(v.playbackRate);
}

/* ---------- Quality ---------- */

function applyQuality(player: YtPlayer, force = false): void {
  const p = ctx.settings.player;
  const full = document.fullscreenElement !== null;
  const choice = full && p.qualityFullscreen !== 'same' ? p.qualityFullscreen : p.quality;
  if (choice === 'auto' || !player.setPlaybackQualityRange) return;
  const levels = player.getAvailableQualityLevels?.() ?? [];
  const target = pickQuality(choice, levels);
  if (!target) return;
  if (!force && player.getPlaybackQuality?.() === target) return;
  let formatId: string | undefined;
  if (p.premiumBitrate) {
    const premium = player
      .getAvailableQualityData?.()
      ?.find((d) => d.quality === target && d.isPlayable !== false && /premium/i.test(d.qualityLabel ?? ''));
    formatId = premium?.formatId;
  }
  player.setPlaybackQualityRange(target, target, formatId);
}

function onState(state: number): void {
  // Quality levels are often empty until playback starts: (re)apply once per video when playing.
  const player = getPlayer();
  const vid = player?.getVideoData?.()?.video_id ?? '';
  if (state === PLAYER_STATE.playing && player && vid && qualityDoneFor !== vid) {
    qualityDoneFor = vid;
    applyQuality(player);
  }
}

/* ---------- Wheel over the speed button ---------- */

function onWheel(e: WheelEvent): void {
  const btn = (e.target as Element).closest('[data-betteryt-btn="speed"]');
  if (!btn || !ctx.settings.player.wheelSpeed) return;
  e.preventDefault();
  e.stopPropagation();
  const step = ctx.settings.player.speedStep;
  setRate(currentRate() + (e.deltaY < 0 ? step : -step));
}

export const playback: Feature = {
  id: ID,
  enabled: (s) => s.player.enabled,
  init() {
    defineAction('speedUp', () => setRate(currentRate() + ctx.settings.player.speedStep));
    defineAction('speedDown', () => setRate(currentRate() - ctx.settings.player.speedStep));
    defineAction('speedReset', () => setRate(1));

    let stateTarget: YtPlayer | null = null;
    const stateHandler = registry.guard(ID, (s: number) => onState(s));
    off.push(
      onNewVideo(
        registry.guard(ID, ({ player, video }) => {
          video.removeEventListener('ratechange', onRateChange);
          video.addEventListener('ratechange', onRateChange);
          const r = initialRate();
          if (Math.abs(video.playbackRate - r) > 0.001) setRate(r, false);
          qualityDoneFor = '';
          applyQuality(player);
          if (stateTarget !== player) {
            stateTarget = player;
            // YouTube's player API event (string handler names are also accepted).
            (
              player as unknown as { addEventListener(n: string, f: (s: number) => void): void }
            ).addEventListener('onStateChange', stateHandler);
          }
        }),
      ),
    );
    const onFull = registry.guard(ID, () => {
      const player = getPlayer();
      if (player) applyQuality(player, true);
    });
    document.addEventListener('fullscreenchange', onFull);
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    off.push(() => {
      document.removeEventListener('fullscreenchange', onFull);
      document.removeEventListener('wheel', onWheel, { capture: true });
      getVideo()?.removeEventListener('ratechange', onRateChange);
    });
  },
  update() {
    // Re-apply quality preferences to the current video right away.
    const player = getPlayer();
    if (player) applyQuality(player, true);
  },
  destroy() {
    for (const f of off.splice(0)) f();
  },
};
