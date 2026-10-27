/**
 * Every YouTube DOM selector BetterYT relies on lives here. Each key maps to an ordered list of
 * fallbacks: the first selector that matches wins. When YouTube ships a layout change, this is
 * the only file that should need edits.
 */
export const SELECTORS = {
  app: ['ytd-app'],
  /** Expanded guide drawer (left hamburger menu). */
  guideDrawer: ['tp-yt-app-drawer#guide', '#guide', 'ytd-guide-renderer'],
  guideRenderer: ['ytd-guide-renderer#guide-renderer', 'ytd-guide-renderer'],
  guideSection: ['ytd-guide-section-renderer'],
  guideSectionItems: ['#items'],
  guideEntry: ['ytd-guide-entry-renderer'],
  /** The native "Settings" entry; we insert right after it. */
  guideSettingsLink: ['a#endpoint[href="/account"]', 'a[href="/account"]', 'a[href^="/account?"]'],
  /** Same section also holds "Report history"; used as a fallback anchor. */
  guideReportHistoryLink: ['a#endpoint[href="/reporthistory"]', 'a[href="/reporthistory"]'],
  /** Collapsed mini guide. */
  miniGuide: ['ytd-mini-guide-renderer'],
  miniGuideItems: ['ytd-mini-guide-renderer #items', 'ytd-mini-guide-renderer [role="tablist"]'],
  player: ['#movie_player', '.html5-video-player'],

  /* ---------- Feeds (subscriptions / home / channel / search) ---------- */
  activeBrowse: ['ytd-page-manager > ytd-browse:not([hidden])', 'ytd-browse:not([hidden])'],
  richGridContents: ['ytd-rich-grid-renderer > #contents', 'ytd-rich-grid-renderer #contents'],
  richGrid: ['ytd-rich-grid-renderer'],
  richItem: ['ytd-rich-item-renderer'],
  searchResults: ['ytd-search ytd-section-list-renderer > #contents'],
  searchItem: ['ytd-video-renderer'],
  browsePrimary: ['ytd-two-column-browse-results-renderer > #primary', '#primary'],
  // YouTube ships lockup classes both as BEM (yt-lockup-view-model__x) and camelCase
  // (ytLockupViewModelX, seen live since 2026); keep both.
  feedVideoLink: [
    'a#thumbnail[href]',
    'a.ytLockupViewModelContentImage[href]',
    'a.yt-lockup-view-model__content-image[href]',
    'a.reel-item-endpoint[href]',
    'a.shortsLockupViewModelHostEndpoint[href]',
    'a[href*="/watch?v="]',
    'a[href^="/shorts/"]',
  ],
  feedTitle: [
    '#video-title',
    '.ytLockupMetadataViewModelTitle',
    '.yt-lockup-metadata-view-model__title',
    '.shortsLockupViewModelHostMetadataTitle',
    'h3',
  ],
  feedChannelLink: [
    'ytd-channel-name a[href]',
    '#channel-name a[href]',
    '.ytContentMetadataViewModelHost a[href^="/@"]',
    '.ytContentMetadataViewModelHost a[href^="/channel/"]',
    '.yt-content-metadata-view-model a[href^="/@"]',
    '.yt-content-metadata-view-model a[href^="/channel/"]',
    'a[href^="/@"]:not([href*="/shorts"])',
    'a[href^="/channel/"]',
  ],
  feedChannelName: [
    'ytd-channel-name #text',
    '#channel-name #text',
    '.ytContentMetadataViewModelHost a[href^="/@"]',
    '.yt-content-metadata-view-model a[href^="/@"]',
  ],
  feedAvatar: [
    '#avatar-link img',
    '#channel-thumbnail img',
    '.ytLockupMetadataViewModelAvatar img',
    'yt-avatar-shape img',
    '.ytSpecAvatarShapeImage',
    '.yt-spec-avatar-shape__image',
    'yt-img-shadow#avatar img',
  ],
  feedThumb: [
    'ytd-thumbnail',
    'yt-thumbnail-view-model',
    '.ytLockupViewModelContentImage',
    '.yt-lockup-view-model__content-image',
    '.shortsLockupViewModelHostThumbnailContainer',
  ],
  feedProgress: [
    'ytd-thumbnail-overlay-resume-playback-renderer #progress',
    '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment',
    '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegmentModern',
  ],
  /** Thumbnail badges: durations ("12:34") and status words ("LIVE", "Upcoming"). */
  feedBadge: [
    'ytd-thumbnail-overlay-time-status-renderer #text',
    'yt-thumbnail-badge-view-model badge-shape',
    '.ytBadgeShapeText',
    '.yt-badge-shape__text',
    '.badge-shape-wiz__text',
  ],
  feedDurationText: [
    'ytd-thumbnail-overlay-time-status-renderer #text',
    '.ytBadgeShapeText',
    'yt-thumbnail-badge-view-model badge-shape',
    '.yt-badge-shape__text',
    '.badge-shape-wiz__text',
  ],
  feedMetaText: [
    '#metadata-line span',
    '.ytContentMetadataViewModelMetadataText',
    '.yt-content-metadata-view-model__metadata-text',
    '.inline-metadata-item',
  ],
  feedShortsMarker: ['ytm-shorts-lockup-view-model', '[overlay-style="SHORTS"]'],
  feedLiveMarker: [
    'ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]',
    '.ytBadgeShapeThumbnailLive',
    '.badge-style-type-live-now',
    '.badge-style-type-live-now-alternate',
    '[class*="thumbnail-live"]',
    '.yt-badge-shape--live',
  ],
  feedUpcomingMarker: [
    'ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]',
    '.ytBadgeShapeThumbnailUpcoming',
    '[class*="thumbnail-upcoming"]',
  ],
  feedMembersMarker: [
    '.badge-style-type-members-only',
    '[class*="members-only"]',
    '[class*="MembersOnly"]',
    '.ytBadgeShapeMembership',
    '.yt-badge-shape--membership',
  ],
} as const satisfies Record<string, readonly string[]>;

export type SelectorKey = keyof typeof SELECTORS;

/** First element matching any fallback of `key`, searched within `root`. */
export function queryFirst<E extends Element = HTMLElement>(
  key: SelectorKey,
  root: ParentNode = document,
): E | null {
  for (const sel of SELECTORS[key]) {
    try {
      const el = root.querySelector<E>(sel);
      if (el) return el;
    } catch {
      // Invalid selector in this browser: try the next fallback.
    }
  }
  return null;
}

/** All elements matching the first fallback of `key` that matches anything. */
export function queryAll<E extends Element = HTMLElement>(
  key: SelectorKey,
  root: ParentNode = document,
): E[] {
  for (const sel of SELECTORS[key]) {
    try {
      const list = root.querySelectorAll<E>(sel);
      if (list.length) return Array.from(list);
    } catch {}
  }
  return [];
}

/** Closest ancestor (inclusive) matching any fallback of `key`. */
export function closestAny<E extends Element = HTMLElement>(key: SelectorKey, el: Element): E | null {
  for (const sel of SELECTORS[key]) {
    try {
      const found = el.closest<E>(sel);
      if (found) return found;
    } catch {}
  }
  return null;
}

/** Combined selector string (all fallbacks), for matches()/CSS use. */
export function anySelector(key: SelectorKey): string {
  return SELECTORS[key].join(', ');
}
