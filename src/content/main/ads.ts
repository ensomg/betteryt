/**
 * MAIN-world ad handling. Installed synchronously at document_start (before YouTube's scripts),
 * gated by a localStorage mirror of the settings because chrome.storage isn't available here.
 *
 *  1. Player-response layer: traps on window.ytInitialPlayerResponse / ytInitialData and a fetch
 *     wrapper for /youtubei/v1/{player,next,browse,search} prune ad fields before YouTube reads
 *     them (only those endpoints; everything else passes through untouched).
 *  2. Runtime layer (safety net): when the player still enters an ad ("ad-showing"), mute it,
 *     jump to the end of the ad and press Skip the moment it exists.
 *  3. Ad-blocker warning: dismiss the enforcement dialog and resume playback.
 * Every action is reported over the bus for the diagnostics log.
 */
import {
  CLEAN_ENDPOINTS,
  cleanFeed,
  cleanPlayerResponse,
  ENFORCEMENT_DIALOG,
  SKIP_BUTTONS,
} from '../../shared/ad-rules';

export const ADS_KEY = 'betteryt:ads';

export interface AdFlags {
  video: boolean;
  feed: boolean;
  warning: boolean;
}

export type AdEvent = {
  kind: 'pruned-player' | 'pruned-feed' | 'skipped' | 'fast-forwarded' | 'dismissed-warning';
  detail: string;
};

let report: (e: AdEvent) => void = () => undefined;
const early: AdEvent[] = [];

export function setAdReporter(fn: (e: AdEvent) => void): void {
  report = fn;
  for (const e of early.splice(0)) fn(e);
}

function emit(e: AdEvent): void {
  if (report === noop) early.push(e);
  else report(e);
}
const noop = report;

export function readAdFlags(): AdFlags {
  try {
    const raw = localStorage.getItem(ADS_KEY);
    // Default (fresh install, nothing mirrored yet): everything on.
    if (!raw) return { video: true, feed: true, warning: true };
    const v = JSON.parse(raw) as Partial<AdFlags>;
    return { video: v.video === true, feed: v.feed === true, warning: v.warning === true };
  } catch {
    return { video: true, feed: true, warning: true };
  }
}

/* ---------- 1. Response cleaning ---------- */

function trapGlobal(name: 'ytInitialPlayerResponse' | 'ytInitialData', clean: (v: unknown) => void): void {
  let value: unknown;
  try {
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: (v: unknown) => {
        try {
          clean(v);
        } catch {
          // Never break YouTube over a cleaning bug.
        }
        value = v;
      },
    });
  } catch {
    // Already defined non-configurably: skip this layer.
  }
}

function installFetch(flags: AdFlags): void {
  const original = window.fetch;
  const patched = async function (
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const res = await original.call(this, input, init);
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!CLEAN_ENDPOINTS.test(url) || !res.ok) return res;
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('json')) return res;
      const data: unknown = await res.clone().json();
      const isPlayer = /\/youtubei\/v1\/(player|reel)/.test(url);
      let n = 0;
      if (flags.video) n += cleanPlayerResponse(data);
      if (flags.feed && !isPlayer) n += cleanFeed(data);
      if (!n) return res;
      emit({
        kind: isPlayer ? 'pruned-player' : 'pruned-feed',
        detail: `${n} from ${url.replace(/^.*\/youtubei\/v1\//, '').split('?')[0]}`,
      });
      return new Response(JSON.stringify(data), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch {
      return res;
    }
  };
  // Keep fetch looking native (toString / name) so feature checks don't trip.
  Object.defineProperty(patched, 'name', { value: 'fetch' });
  Object.defineProperty(patched, 'toString', { value: () => original.toString() });
  window.fetch = patched as typeof fetch;
}

/* ---------- 2. Runtime fallback & 3. warning dialog ---------- */

let mutedByUs = false;

function handleAdState(player: HTMLElement): void {
  const showing = player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
  // Hot path (most mutations): no ad and nothing to restore.
  if (!showing && !mutedByUs) return;
  const video = player.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!video) return;
  if (!showing) {
    video.muted = false;
    mutedByUs = false;
    return;
  }
  if (!video.muted) {
    video.muted = true;
    mutedByUs = true;
  }
  for (const sel of SKIP_BUTTONS) {
    const btn = player.querySelector<HTMLElement>(sel);
    if (btn) {
      btn.click();
      emit({ kind: 'skipped', detail: sel });
      return;
    }
  }
  if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.1) {
    video.currentTime = video.duration;
    emit({ kind: 'fast-forwarded', detail: `${Math.round(video.duration)}s ad` });
  }
}

function dismissWarning(): void {
  const dialog = document.querySelector(ENFORCEMENT_DIALOG);
  if (!dialog) return;
  const paper = dialog.closest('tp-yt-paper-dialog') as HTMLElement | null;
  const close = dialog.querySelector<HTMLElement>(
    '#dismiss-button button, #dismiss-button, button[aria-label*="lose"]',
  );
  close?.click();
  paper?.remove();
  document.querySelector('tp-yt-iron-overlay-backdrop')?.remove();
  const video = document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video');
  if (video?.paused) void video.play().catch(() => undefined);
  emit({ kind: 'dismissed-warning', detail: location.pathname });
}

function watchPlayer(flags: AdFlags): void {
  let playerObserver: MutationObserver | null = null;
  let boundPlayer: Element | null = null;
  const bind = (): void => {
    const player = document.querySelector<HTMLElement>('#movie_player');
    if (!player || player === boundPlayer) return;
    boundPlayer = player;
    playerObserver?.disconnect();
    // The skip button appears inside the player: watch class changes and new children.
    playerObserver = new MutationObserver(() => handleAdState(player));
    playerObserver.observe(player, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });
    handleAdState(player);
  };
  if (flags.video) {
    document.addEventListener('yt-navigate-finish', bind);
    document.addEventListener('yt-player-updated', bind);
  }
  if (flags.warning) {
    const start = (): void => {
      const popups = document.querySelector('ytd-popup-container');
      if (!popups) return;
      new MutationObserver(dismissWarning).observe(popups, { childList: true, subtree: true });
      dismissWarning();
    };
    document.addEventListener('yt-navigate-finish', start, { once: true });
  }
}

/** Entry point; call once at document_start. */
export function installAdBlocking(): void {
  const flags = readAdFlags();
  if (!flags.video && !flags.feed && !flags.warning) return;
  if (flags.video) {
    trapGlobal('ytInitialPlayerResponse', (v) => {
      const n = cleanPlayerResponse(v);
      if (n) emit({ kind: 'pruned-player', detail: `${n} from initial response` });
    });
  }
  if (flags.feed) {
    trapGlobal('ytInitialData', (v) => {
      const n = cleanFeed(v);
      if (n) emit({ kind: 'pruned-feed', detail: `${n} from initial data` });
    });
  }
  if (flags.video || flags.feed) installFetch(flags);
  watchPlayer(flags);
}
