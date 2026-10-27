import { setPath, type Settings } from '../../shared/settings-schema';
import { loadSettings, saveSettings } from '../../shared/storage';
import { STRINGS } from '../../shared/strings';
import { h } from '../../shared/dom';
import { sendMessage } from '../../shared/messages';
import { mergeRanges, SB_CATEGORIES, type SbCategory, type SbSegment } from '../../shared/sponsorblock';
import { keyCombo, normalizeBinding } from '../../shared/player-options';
import { currentChannel, formatTime, getVideo, isTyping, onNewVideo } from '../main/player';
import { showToast } from '../ui/toast';
import { registry, type Feature } from './registry';

/**
 * SponsorBlock (own implementation, read-only): colored segments on the progress bar, auto-skip
 * with Undo, a manual "Skip" button with countdown ring, mute segments, highlight jump marker,
 * channel/video whitelist and local time-saved stats.
 *
 * Skips are scheduled exactly: on every timeupdate we arm a timer for the next segment start, so
 * we never poll and still land within a few ms of the boundary.
 */

const ID = 'sponsorblock';
const T = STRINGS.sbUi;
const STATS_KEY = 'sbStats';

let settings: Settings | null = null;
const off: Array<() => void> = [];
let video: HTMLVideoElement | null = null;
let vid = '';
let segments: SbSegment[] = [];
/** Segments the user undid or seeked into: never auto-skip them again for this video. */
const spared = new Set<string>();
let ownSeek = false;
let nextTimer: ReturnType<typeof setTimeout> | undefined;
let delayTimer: ReturnType<typeof setTimeout> | undefined;
let buttonEl: HTMLElement | null = null;
let buttonSeg: SbSegment | null = null;
let mutedByUs = false;
let barsObserver: MutationObserver | null = null;

const catDef = (c: SbCategory) => SB_CATEGORIES.find((d) => d.id === c)!;
const label = (c: SbCategory): string => T.categories[c];

function actionFor(seg: SbSegment): 'skip' | 'button' | 'timeline' | 'off' {
  return settings?.sponsorblock.categories[seg.category]?.action ?? 'off';
}

function whitelisted(): boolean {
  const sb = settings!.sponsorblock;
  const ch = currentChannel();
  return sb.whitelistVideos.includes(vid) || (!!ch && sb.whitelistChannels.includes(ch));
}

function eligible(seg: SbSegment): boolean {
  const sb = settings!.sponsorblock;
  if (seg.end - seg.start < sb.minLength) return false;
  if (!seg.locked && seg.votes < sb.minVotes) return false;
  return true;
}

/* ---------- Progress-bar segments ---------- */

function drawBars(): void {
  const bar = document.querySelector<HTMLElement>('#movie_player .ytp-progress-bar');
  bar?.querySelector(':scope > .betteryt-sb-bars')?.remove();
  const v = video;
  if (!bar || !v || !Number.isFinite(v.duration) || v.duration <= 0) return;
  const visible = segments.filter((s) => actionFor(s) !== 'off' && s.actionType !== 'full');
  if (!visible.length) return;
  const layer = h('div', { class: 'betteryt-sb-bars', 'aria-hidden': 'true' });
  for (const s of visible) {
    const color = settings!.sponsorblock.categories[s.category].color;
    const left = (s.start / v.duration) * 100;
    if (catDef(s.category).kind === 'point' || s.actionType === 'poi') {
      const dot = h('div', {
        class: 'betteryt-sb-point',
        title: `${label(s.category)} · ${formatTime(s.start)}`,
      });
      dot.style.left = `${left}%`;
      dot.style.background = color;
      // Highlight: click to jump there.
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        seekTo(s.start);
      });
      layer.append(dot);
      continue;
    }
    const seg = h('div', {
      class: 'betteryt-sb-seg',
      title: `${label(s.category)} · ${formatTime(s.start)}–${formatTime(s.end)} (${Math.round(s.end - s.start)}s)`,
    });
    seg.style.left = `${left}%`;
    seg.style.width = `${Math.max(0.25, ((s.end - s.start) / v.duration) * 100)}%`;
    seg.style.background = color;
    layer.append(seg);
  }
  bar.append(layer);
}

function watchBar(): void {
  barsObserver?.disconnect();
  const bar = document.querySelector('#movie_player .ytp-progress-bar');
  if (!bar) return;
  // YouTube occasionally re-renders the bar's children (chapters, ads); redraw if ours vanish.
  barsObserver = new MutationObserver(
    registry.guard(ID, () => {
      if (segments.length && !bar.querySelector(':scope > .betteryt-sb-bars')) drawBars();
    }),
  );
  barsObserver.observe(bar, { childList: true });
}

/* ---------- Skipping ---------- */

function seekTo(t: number): void {
  const v = video;
  if (!v) return;
  ownSeek = true;
  v.currentTime = t;
}

async function addStats(saved: number): Promise<void> {
  try {
    const r = await chrome.storage.local.get(STATS_KEY);
    const s = (r[STATS_KEY] as { skips?: number; saved?: number } | undefined) ?? {};
    await chrome.storage.local.set({
      [STATS_KEY]: { skips: (s.skips ?? 0) + 1, saved: (s.saved ?? 0) + saved },
    });
  } catch {}
}

function skip(seg: SbSegment, auto: boolean): void {
  const v = video;
  if (!v) return;
  // Clear any directly adjacent segments in one jump.
  const ranges = mergeRanges(
    segments.filter((s) => s.actionType === 'skip' && actionFor(s) !== 'off' && actionFor(s) !== 'timeline'),
  );
  const range = ranges.find((r) => r.start <= seg.start + 0.01 && r.end >= seg.end - 0.01) ?? seg;
  const end = Math.min(range.end, Number.isFinite(v.duration) ? v.duration - 0.05 : range.end);
  const from = v.currentTime;
  seekTo(end);
  hideButton();
  void addStats(Math.max(0, end - from));
  if (settings!.sponsorblock.showToast) {
    showToast(
      auto ? T.skipped(label(seg.category), Math.round(end - from)) : T.skippedManual(label(seg.category)),
      {
        action: {
          label: STRINGS.subsUi.undo,
          run: () => {
            spared.add(seg.UUID);
            seekTo(seg.start);
          },
        },
      },
    );
  }
}

function showButton(seg: SbSegment): void {
  const player = document.querySelector<HTMLElement>('#movie_player');
  if (!player) return;
  if (buttonSeg?.UUID === seg.UUID && buttonEl?.isConnected) return;
  hideButton();
  buttonSeg = seg;
  const ring = h('span', { class: 'betteryt-sb-skip__ring', 'aria-hidden': 'true' });
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'betteryt-sb-skip__btn',
      title: `${T.skipKeyHint} ${normalizeBinding(settings!.sponsorblock.skipKey)}`,
    },
    ring,
    h('span', {}, T.skipButton(label(seg.category))),
  );
  btn.style.setProperty('--sb-color', settings!.sponsorblock.categories[seg.category].color);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    skip(seg, false);
  });
  const never = h('button', { type: 'button', class: 'betteryt-sb-skip__never' }, T.neverOnChannel);
  never.addEventListener('click', (e) => {
    e.stopPropagation();
    const ch = currentChannel();
    if (!ch) return;
    void loadSettings()
      .then((s) =>
        saveSettings(
          setPath(s, 'sponsorblock.whitelistChannels', [
            ...new Set([...s.sponsorblock.whitelistChannels, ch]),
          ]),
        ),
      )
      .then(() => {
        hideButton();
        showToast(T.whitelisted);
      });
  });
  buttonEl = h(
    'div',
    { class: 'betteryt-sb-skip', role: 'group', 'aria-label': label(seg.category) },
    btn,
    never,
  );
  player.append(buttonEl);
  updateRing();
}

function updateRing(): void {
  const v = video;
  const seg = buttonSeg;
  const ring = buttonEl?.querySelector<HTMLElement>('.betteryt-sb-skip__ring');
  if (!v || !seg || !ring) return;
  const left = Math.max(0, Math.min(1, (seg.end - v.currentTime) / Math.max(0.1, seg.end - seg.start)));
  ring.style.setProperty('--sb-left', String(left));
}

function hideButton(): void {
  buttonEl?.remove();
  buttonEl = null;
  buttonSeg = null;
}

function evaluate(): void {
  const v = video;
  const s = settings;
  clearTimeout(nextTimer);
  if (!v || !s || !segments.length) return;
  const t = v.currentTime;
  const allow = !whitelisted();
  let inButton: SbSegment | null = null;
  let inMute = false;

  for (const seg of segments) {
    const action = actionFor(seg);
    if (action === 'off' || action === 'timeline' || seg.actionType === 'poi' || seg.actionType === 'full')
      continue;
    const inside = t >= seg.start && t < seg.end - 0.1;
    if (!inside) continue;
    if (seg.actionType === 'mute') {
      if (s.sponsorblock.muteSegments && allow) inMute = true;
      continue;
    }
    if (action === 'skip' && allow && eligible(seg) && !spared.has(seg.UUID)) {
      clearTimeout(delayTimer);
      const delay = s.sponsorblock.skipDelay;
      if (delay > 0) {
        delayTimer = setTimeout(
          registry.guard(ID, () => {
            if (video && video.currentTime >= seg.start && video.currentTime < seg.end - 0.1) skip(seg, true);
          }),
          delay,
        );
        inButton = seg; // visible during the delay so it can be skipped sooner
      } else {
        skip(seg, true);
        return;
      }
    } else if (action === 'button' || action === 'skip') {
      inButton = seg;
    }
  }

  if (inMute && !v.muted) {
    v.muted = true;
    mutedByUs = true;
  } else if (!inMute && mutedByUs) {
    v.muted = false;
    mutedByUs = false;
  }

  if (inButton) showButton(inButton);
  else hideButton();
  updateRing();

  // Arm a timer for the next boundary (segment start or end) instead of polling.
  if (!v.paused) {
    const upcoming = segments
      .flatMap((sg) => [sg.start, sg.end])
      .filter((x) => x > t + 0.01)
      .sort((a, b) => a - b)[0];
    if (upcoming !== undefined) {
      const ms = ((upcoming - t) / (v.playbackRate || 1)) * 1000;
      if (ms < 30_000) nextTimer = setTimeout(registry.guard(ID, evaluate), Math.max(5, ms));
    }
  }
}

function onSeeking(): void {
  const v = video;
  if (!v) return;
  if (ownSeek) {
    ownSeek = false;
    return;
  }
  if (!settings?.sponsorblock.respectSeek) return;
  // The user seeked into a segment on purpose: show the button but don't auto-skip it.
  for (const seg of segments) if (v.currentTime >= seg.start && v.currentTime < seg.end) spared.add(seg.UUID);
}

const onTime = registry.guard(ID, evaluate);
const onSeek = registry.guard(ID, onSeeking);

function onKey(e: KeyboardEvent): void {
  if (!buttonSeg || !settings || isTyping(e.target) || isTyping(document.activeElement)) return;
  if (normalizeBinding(keyCombo(e)) !== normalizeBinding(settings.sponsorblock.skipKey)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  skip(buttonSeg, false);
}

function showFullLabel(): void {
  document.querySelector('.betteryt-sb-full')?.remove();
  const full = segments.find((s) => s.actionType === 'full' && actionFor(s) !== 'off');
  const title = document.querySelector('ytd-watch-metadata #title h1, ytd-watch-metadata h1');
  if (!full || !title) return;
  const pill = h('span', { class: 'betteryt-sb-full', title: T.fullHint }, label(full.category));
  pill.style.background = settings!.sponsorblock.categories[full.category].color;
  title.prepend(pill);
}

/* ---------- Lifecycle ---------- */

function enabledCategories(s: Settings): string[] {
  return SB_CATEGORIES.filter((c) => s.sponsorblock.categories[c.id].action !== 'off').map((c) => c.id);
}

async function load(v: HTMLVideoElement, id: string): Promise<void> {
  segments = [];
  spared.clear();
  hideButton();
  drawBars();
  document.querySelector('.betteryt-sb-full')?.remove();
  if (!settings || location.pathname.startsWith('/embed') || !Number.isFinite(v.duration)) return; // live / embeds
  const cats = enabledCategories(settings);
  if (!cats.length) return;
  try {
    const res = await sendMessage({ type: 'sponsorSegments', videoId: id, categories: cats });
    if (vid !== id) return; // navigated away meanwhile
    segments = res.ok ? res.segments : [];
  } catch {
    segments = [];
  }
  drawBars();
  watchBar();
  showFullLabel();
  evaluate();
}

function attach(v: HTMLVideoElement): void {
  if (video === v) return;
  video?.removeEventListener('timeupdate', onTime);
  video?.removeEventListener('seeking', onSeek);
  video?.removeEventListener('play', onTime);
  video?.removeEventListener('durationchange', drawBars);
  video = v;
  v.addEventListener('timeupdate', onTime);
  v.addEventListener('seeking', onSeek);
  v.addEventListener('play', onTime);
  v.addEventListener('durationchange', drawBars);
}

export const sponsorblock: Feature = {
  id: ID,
  enabled: (s) => s.sponsorblock.enabled,
  init(s) {
    settings = s;
    off.push(
      onNewVideo(
        registry.guard(ID, ({ video: v, vid: id }) => {
          vid = id;
          attach(v);
          void load(v, id);
        }),
      ),
    );
    const key = registry.guard(ID, onKey);
    window.addEventListener('keydown', key, true);
    off.push(() => window.removeEventListener('keydown', key, true));
  },
  update(s) {
    const before = settings ? enabledCategories(settings).join() : '';
    settings = s;
    const v = getVideo();
    // New categories need a new request; colors/actions just redraw.
    if (v && vid && enabledCategories(s).join() !== before) void load(v, vid);
    else {
      drawBars();
      showFullLabel();
      evaluate();
    }
  },
  destroy() {
    for (const f of off.splice(0)) f();
    clearTimeout(nextTimer);
    clearTimeout(delayTimer);
    barsObserver?.disconnect();
    barsObserver = null;
    video?.removeEventListener('timeupdate', onTime);
    video?.removeEventListener('seeking', onSeek);
    video?.removeEventListener('play', onTime);
    video?.removeEventListener('durationchange', drawBars);
    if (mutedByUs && video) video.muted = false;
    mutedByUs = false;
    video = null;
    segments = [];
    hideButton();
    document.querySelectorAll('.betteryt-sb-bars, .betteryt-sb-full').forEach((e) => e.remove());
    settings = null;
  },
};
