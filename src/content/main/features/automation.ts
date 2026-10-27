import { registry, type Feature } from '../../features/registry';
import { ctx } from '../context';
import { getPlayer, getVideo, isWatchPage, onNewVideo, PLAYER_STATE } from '../player';

/**
 * Automation: autoplay off, auto theater, pause when the tab is hidden / resume on return, pause
 * when another tab starts playing, auto-confirm "Still watching?", auto-enable captions.
 */

const ID = 'automation';
const TAB_ID = Math.random().toString(36).slice(2);

const off: Array<() => void> = [];
let pausedByUs = false;
let channel: BroadcastChannel | null = null;
let dialogObserver: MutationObserver | null = null;

function ensureAutoplayOff(): void {
  const btn = document.querySelector<HTMLElement>('.ytp-autonav-toggle-button[aria-checked="true"]');
  if (btn) btn.click();
}

function ensureTheater(): void {
  const flexy = document.querySelector('ytd-watch-flexy');
  if (flexy && !flexy.hasAttribute('theater') && !document.fullscreenElement) {
    document.querySelector<HTMLElement>('.ytp-size-button')?.click();
  }
}

function ensureCaptions(): void {
  const p = ctx.settings.player;
  const player = getPlayer();
  if (!player) return;
  if (p.captionLang && player.setOption) {
    try {
      player.loadModule?.('captions');
      player.setOption('captions', 'track', { languageCode: p.captionLang });
      return;
    } catch {
      // Fall back to the button below.
    }
  }
  document.querySelector<HTMLElement>('.ytp-subtitles-button[aria-pressed="false"]')?.click();
}

function onVisibility(): void {
  const p = ctx.settings.player;
  const video = getVideo();
  if (!video || !isWatchPage()) return;
  if (document.visibilityState === 'hidden' && p.pauseOnHidden && !video.paused) {
    video.pause();
    pausedByUs = true;
  } else if (document.visibilityState === 'visible' && pausedByUs) {
    pausedByUs = false;
    if (p.resumeOnVisible) void video.play().catch(() => undefined);
  }
}

function onPlay(): void {
  if (ctx.settings.player.pauseOtherTabs) channel?.postMessage({ type: 'playing', tab: TAB_ID });
}

function onMessage(e: MessageEvent<{ type?: string; tab?: string }>): void {
  if (e.data?.type !== 'playing' || e.data.tab === TAB_ID || !ctx.settings.player.pauseOtherTabs) return;
  const video = getVideo();
  if (video && !video.paused) video.pause();
}

/**
 * "Video paused. Continue watching?" is a confirm dialog with a single button that appears while
 * the player is paused. We only press it in exactly that situation, never other dialogs.
 */
function checkStillWatching(): void {
  if (!ctx.settings.player.skipStillWatching || !isWatchPage()) return;
  const player = getPlayer();
  if (player?.getPlayerState?.() !== PLAYER_STATE.paused) return;
  for (const dialog of document.querySelectorAll<HTMLElement>(
    'ytd-popup-container yt-confirm-dialog-renderer',
  )) {
    if (!dialog.offsetParent) continue;
    const confirm = dialog.querySelector<HTMLElement>('#confirm-button button, #confirm-button');
    const cancel = dialog.querySelector<HTMLElement>('#cancel-button');
    const hasCancel = !!cancel && cancel.offsetParent !== null && (cancel.textContent ?? '').trim() !== '';
    if (confirm && !hasCancel) {
      confirm.click();
      player.playVideo?.();
    }
  }
}

export const automation: Feature = {
  id: ID,
  enabled: (s) => s.player.enabled,
  init() {
    off.push(
      onNewVideo(
        registry.guard(ID, ({ video }) => {
          const p = ctx.settings.player;
          if (p.autoplayOff) ensureAutoplayOff();
          if (p.autoTheater) ensureTheater();
          if (p.captions) ensureCaptions();
          if (p.loopByDefault) video.loop = true;
          video.removeEventListener('play', onPlay);
          video.addEventListener('play', onPlay);
          if (!video.paused) onPlay();
        }),
      ),
    );
    const vis = registry.guard(ID, onVisibility);
    document.addEventListener('visibilitychange', vis);
    off.push(() => document.removeEventListener('visibilitychange', vis));

    channel = new BroadcastChannel('betteryt-playback');
    channel.addEventListener('message', onMessage);
    off.push(() => {
      channel?.close();
      channel = null;
    });

    const popups = document.querySelector('ytd-popup-container');
    const watchDialogs = registry.guard(ID, checkStillWatching);
    if (popups) {
      dialogObserver = new MutationObserver(watchDialogs);
      dialogObserver.observe(popups, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-hidden', 'style'],
      });
    } else {
      // The popup container is created lazily; catch it on the next navigation.
      const late = registry.guard(ID, () => {
        const c = document.querySelector('ytd-popup-container');
        if (!c || dialogObserver) return;
        dialogObserver = new MutationObserver(watchDialogs);
        dialogObserver.observe(c, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-hidden', 'style'],
        });
      });
      document.addEventListener('yt-navigate-finish', late);
      off.push(() => document.removeEventListener('yt-navigate-finish', late));
    }
    off.push(() => {
      dialogObserver?.disconnect();
      dialogObserver = null;
    });
  },
  update(s) {
    if (s.player.autoplayOff && isWatchPage()) ensureAutoplayOff();
  },
  destroy() {
    for (const f of off.splice(0)) f();
  },
};
