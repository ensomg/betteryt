/**
 * Versioned, remote-free ad-blocking rules. Everything YouTube-specific that tends to change lives
 * here so a fix is one edit + release. No rules are ever fetched from the network.
 *
 * Ad blocking on YouTube is an arms race: expect these lists to need periodic updates.
 */

export const AD_RULES_VERSION = '2026.10.28';

/** Player-response fields that carry ads (pruned before YouTube's player reads them). */
export const PLAYER_AD_KEYS = [
  'adPlacements',
  'playerAds',
  'adSlots',
  'adBreakHeartbeatParams',
  'adBreakParams',
] as const;

/** Renderer keys of ad/promo items inside browse / search / next responses. */
export const FEED_AD_RENDERERS = [
  'adSlotRenderer',
  'promotedSparklesWebRenderer',
  'promotedSparklesTextSearchRenderer',
  'searchPyvRenderer',
  'displayAdRenderer',
  'promotedVideoRenderer',
  'compactPromotedVideoRenderer',
  'bannerPromoRenderer',
  'statementBannerRenderer',
  'brandVideoShelfRenderer',
  'brandVideoSingletonRenderer',
  'inFeedAdLayoutRenderer',
  'actionCompanionAdRenderer',
  'playerLegacyDesktopWatchAdsRenderer',
] as const;

/** Endpoints whose JSON we clean in flight (fetch). */
export const CLEAN_ENDPOINTS = /\/youtubei\/v1\/(player|next|browse|search|reel\/reel_item_watch)(\?|$)/;

/** Skip-button selectors for the runtime fallback (YouTube renames these regularly). */
export const SKIP_BUTTONS = [
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-slot button',
  'button[id^="skip-button"]',
  '.ytp-ad-skip-button-container button',
];

/** Ad-blocker enforcement dialog. */
export const ENFORCEMENT_DIALOG = 'ytd-enforcement-message-view-model';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Removes ad fields from a player response in place. Returns how many were removed. */
export function cleanPlayerResponse(resp: unknown): number {
  if (!isObj(resp)) return 0;
  let n = 0;
  for (const k of PLAYER_AD_KEYS) {
    if (k in resp) {
      delete resp[k];
      n++;
    }
  }
  // /next and reel responses nest the player response.
  for (const nested of ['playerResponse', 'reelPlayerOverlayRenderer']) {
    if (isObj(resp[nested])) n += cleanPlayerResponse(resp[nested]);
  }
  return n;
}

function isAdItem(item: unknown): boolean {
  if (!isObj(item)) return false;
  for (const k of FEED_AD_RENDERERS) if (k in item) return true;
  // richItemRenderer / richSectionRenderer wrap the actual renderer in `content`.
  for (const wrapper of ['richItemRenderer', 'richSectionRenderer']) {
    const w = item[wrapper];
    if (isObj(w) && isObj(w.content)) for (const k of FEED_AD_RENDERERS) if (k in w.content) return true;
  }
  return false;
}

/**
 * Removes ad items from any arrays inside a browse/search/next response, in place. Bounded walk
 * (depth and node count) so a huge response can't stall the page. Returns items removed.
 */
export function cleanFeed(data: unknown, maxDepth = 40, budget = { nodes: 200_000 }): number {
  let removed = 0;
  const walk = (node: unknown, depth: number): void => {
    if (depth > maxDepth || budget.nodes-- <= 0 || !isObj(node)) return;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        if (isAdItem(node[i])) {
          node.splice(i, 1);
          removed++;
        } else walk(node[i], depth + 1);
      }
      return;
    }
    for (const k of Object.keys(node)) {
      // Never descend into player-state blobs we don't understand.
      if (k === 'frameworkUpdates' || k === 'responseContext') continue;
      walk(node[k], depth + 1);
    }
  };
  walk(data, 0);
  return removed;
}
