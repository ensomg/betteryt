/**
 * MAIN-world access to YouTube's player. #movie_player exposes a JS API (setPlaybackRate,
 * setPlaybackQualityRange, getVolume...) that only page-world code can call. Everything here is
 * defensive: any method may be missing in a given YouTube build.
 */

export interface QualityData {
  quality: string;
  qualityLabel?: string;
  isPlayable?: boolean;
  formatId?: string;
  paygatedQualityDetails?: unknown;
}

export interface YtPlayer extends HTMLElement {
  getVideoData?(): { video_id?: string; author?: string; title?: string; isLive?: boolean };
  getCurrentTime?(): number;
  getDuration?(): number;
  getPlaybackRate?(): number;
  setPlaybackRate?(rate: number): void;
  getAvailablePlaybackRates?(): number[];
  seekTo?(seconds: number, allowSeekAhead?: boolean): void;
  getAvailableQualityLevels?(): string[];
  getAvailableQualityData?(): QualityData[];
  setPlaybackQualityRange?(min: string, max?: string, formatId?: string): void;
  setPlaybackQuality?(q: string): void;
  getPlaybackQuality?(): string;
  getVolume?(): number;
  setVolume?(v: number): void;
  isMuted?(): boolean;
  mute?(): void;
  unMute?(): void;
  getPlayerState?(): number;
  playVideo?(): void;
  pauseVideo?(): void;
  loadModule?(name: string): void;
  setOption?(module: string, option: string, value: unknown): void;
  getOption?(module: string, option: string): unknown;
  getStatsForNerds?(): Record<string, string>;
  isFullscreen?(): boolean;
}

export const PLAYER_STATE = { ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const;

export function getPlayer(): YtPlayer | null {
  return (
    document.querySelector<YtPlayer>('#movie_player') ??
    document.querySelector<YtPlayer>('.html5-video-player')
  );
}

export function getVideo(player: YtPlayer | null = getPlayer()): HTMLVideoElement | null {
  return (
    player?.querySelector<HTMLVideoElement>('video.html5-main-video') ??
    player?.querySelector('video') ??
    null
  );
}

export function isWatchPage(): boolean {
  return location.pathname === '/watch';
}

export function currentVideoId(): string | null {
  const fromPlayer = getPlayer()?.getVideoData?.()?.video_id;
  if (fromPlayer) return fromPlayer;
  return new URLSearchParams(location.search).get('v');
}

/** Channel key ('/@handle' or '/channel/UC…') of the video on the watch page, if rendered. */
export function currentChannel(): string | null {
  const a = document.querySelector<HTMLAnchorElement>(
    'ytd-watch-metadata ytd-channel-name a[href], ytd-watch-metadata #owner a[href^="/@"], ytd-video-owner-renderer a[href]',
  );
  const m = /^(\/(?:@[^/?#]+|channel\/[\w-]+))/.exec(a?.getAttribute('href') ?? '');
  return m ? decodeURIComponent(m[1]!) : null;
}

type VideoListener = (ctx: { player: YtPlayer; video: HTMLVideoElement; vid: string }) => void;

/**
 * Calls `cb` once per new video on the watch page (SPA navigations, autoplay, playlist next).
 * Driven by navigation events and the video's own loadedmetadata, never by polling.
 */
export function onNewVideo(cb: VideoListener): () => void {
  let lastVid = '';
  let boundVideo: HTMLVideoElement | null = null;
  const check = (): void => {
    if (!isWatchPage()) return;
    const player = getPlayer();
    const video = getVideo(player);
    if (!player || !video) return;
    if (video !== boundVideo) {
      boundVideo?.removeEventListener('loadedmetadata', check);
      boundVideo = video;
      video.addEventListener('loadedmetadata', check);
    }
    const vid = currentVideoId();
    if (!vid || vid === lastVid || (!Number.isFinite(video.duration) && video.readyState === 0)) return;
    lastVid = vid;
    cb({ player, video, vid });
  };
  const events = ['yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated'];
  for (const e of events) document.addEventListener(e, check);
  check();
  return () => {
    for (const e of events) document.removeEventListener(e, check);
    boundVideo?.removeEventListener('loadedmetadata', check);
  };
}

/** True when focus is in a text field, so single-key shortcuts must not fire. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color'].includes(type);
  }
  return false;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
