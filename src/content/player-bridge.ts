/**
 * ISOLATED side of the player features (which run in the MAIN world): persists remembered speed /
 * volume in chrome.storage.local, mirrors the codec preference for document_start, and routes
 * page-level mode requests (cinema) from MAIN to their ISOLATED owners.
 */
import type { Settings } from '../shared/settings-schema';
import type { Bus, IsolatedToMain, MainToIsolated, PlayerMemory } from './bus';
import { CODEC_KEY } from './main/codec';
import { ADS_KEY } from './main/ads';

const AD_LOG_KEY = 'adLog';
const AD_LOG_MAX = 50;
let adLogTimer: ReturnType<typeof setTimeout> | undefined;
const adPending: Array<{ at: number; kind: string; detail: string }> = [];

const MEMORY_KEY = 'playerMemory';
const MAX_CHANNELS = 300;

let memory: PlayerMemory = { speed: null, channelSpeed: {}, volume: null };
let writeTimer: ReturnType<typeof setTimeout> | undefined;
const modeHandlers = new Map<string, () => void>();

export function onMode(name: string, run: () => void): void {
  modeHandlers.set(name, run);
}

export function initPlayerBridge(bus: Bus<IsolatedToMain, MainToIsolated>): void {
  void chrome.storage.local
    .get(MEMORY_KEY)
    .then((r) => {
      const v = r[MEMORY_KEY] as Partial<PlayerMemory> | undefined;
      memory = {
        speed: typeof v?.speed === 'number' ? v.speed : null,
        channelSpeed: v?.channelSpeed && typeof v.channelSpeed === 'object' ? v.channelSpeed : {},
        volume: typeof v?.volume === 'number' ? v.volume : null,
      };
      bus.send('memory', memory);
    })
    .catch(() => bus.send('memory', memory));

  bus.on('memory', (patch) => {
    if (typeof patch.speed === 'number') memory.speed = patch.speed;
    if (typeof patch.volume === 'number') memory.volume = patch.volume;
    if (patch.channel && typeof patch.channelValue === 'number') {
      // Re-insert so the most recent channels survive the cap.
      delete memory.channelSpeed[patch.channel];
      memory.channelSpeed[patch.channel] = patch.channelValue;
      const keys = Object.keys(memory.channelSpeed);
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_CHANNELS))) delete memory.channelSpeed[k];
    }
    clearTimeout(writeTimer);
    writeTimer = setTimeout(
      () => void chrome.storage.local.set({ [MEMORY_KEY]: memory }).catch(() => undefined),
      500,
    );
  });

  bus.on('mode', ({ name }) => modeHandlers.get(name)?.());

  // Batch ad events into the local diagnostics log (last ${AD_LOG_MAX}).
  bus.on('adEvent', (e) => {
    adPending.push({
      at: Date.now(),
      kind: String(e.kind).slice(0, 40),
      detail: String(e.detail).slice(0, 120),
    });
    clearTimeout(adLogTimer);
    adLogTimer = setTimeout(() => {
      const batch = adPending.splice(0);
      void chrome.storage.local
        .get(AD_LOG_KEY)
        .then((r) => {
          const log = Array.isArray(r[AD_LOG_KEY]) ? (r[AD_LOG_KEY] as unknown[]) : [];
          return chrome.storage.local.set({
            [AD_LOG_KEY]: [...batch.reverse(), ...log].slice(0, AD_LOG_MAX),
          });
        })
        .catch(() => undefined);
    }, 1000);
  });
}

/**
 * Codec preference must be readable synchronously at document_start in the MAIN world, so it is
 * mirrored into the page's localStorage. Only written when non-default (otherwise removed).
 */
/** Ad-blocking flags for the MAIN world's document_start hooks (same mirroring reason as codec). */
export function mirrorAds(s: Settings): void {
  try {
    const a = s.ads;
    const on = s.general.enabled && a.enabled;
    localStorage.setItem(
      ADS_KEY,
      JSON.stringify({
        video: on && a.blockVideoAds,
        feed: on && a.hideFeedAds,
        warning: on && a.dismissWarning,
      }),
    );
  } catch {}
}

export function mirrorCodec(s: Settings): void {
  try {
    const { codec, max30fps } = s.player;
    if (!s.general.enabled || !s.player.enabled || (codec === 'auto' && !max30fps))
      localStorage.removeItem(CODEC_KEY);
    else localStorage.setItem(CODEC_KEY, JSON.stringify({ codec, max30fps }));
  } catch {
    // Storage blocked: the preference simply doesn't apply.
  }
}
