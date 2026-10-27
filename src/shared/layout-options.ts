/**
 * Data-driven list of layout-cleanup toggles. Each option becomes:
 *   - a boolean setting `layout.<key>` (default off),
 *   - an attribute `by-<kebab-key>` on <html> while active, matched by rules in content/css/layout.css,
 *   - a row in the options page (label/description in strings.ts under `layout.<key>`).
 * `preset: true` means the option is part of the Distraction-free preset.
 */

export const LAYOUT_PAGES = ['home', 'watch', 'search', 'global'] as const;
export type LayoutPage = (typeof LAYOUT_PAGES)[number];

export const LAYOUT_OPTIONS = [
  { key: 'homeHideFeed', page: 'home', preset: true },
  { key: 'homeHideChips', page: 'home', preset: true },
  { key: 'homeHideShorts', page: 'home', preset: true },

  { key: 'watchHideRelated', page: 'watch', preset: true },
  { key: 'watchHideComments', page: 'watch', preset: true },
  { key: 'watchHideEndscreen', page: 'watch', preset: true },
  { key: 'watchHideInfoCards', page: 'watch', preset: true },
  { key: 'watchHideJoin', page: 'watch', preset: false },
  { key: 'watchHideThanks', page: 'watch', preset: false },
  { key: 'watchHideClip', page: 'watch', preset: false },
  { key: 'watchHideDownload', page: 'watch', preset: false },
  { key: 'watchHideLiveChat', page: 'watch', preset: false },
  { key: 'watchHideMerch', page: 'watch', preset: true },
  { key: 'watchHideAutoplayToggle', page: 'watch', preset: false },
  { key: 'watchExpandDescription', page: 'watch', preset: false },

  { key: 'searchHideShorts', page: 'search', preset: true },
  { key: 'searchHideMixes', page: 'search', preset: false },
  { key: 'searchHideShelves', page: 'search', preset: true },
  { key: 'searchHidePeopleSearch', page: 'search', preset: true },

  { key: 'hideNotificationBadge', page: 'global', preset: true },
  { key: 'hideVoiceSearch', page: 'global', preset: false },
  { key: 'hideCreate', page: 'global', preset: false },
  { key: 'hidePremium', page: 'global', preset: true },
  { key: 'hideExplore', page: 'global', preset: true },
  { key: 'hideMoreFromYouTube', page: 'global', preset: true },
  { key: 'hideTrending', page: 'global', preset: true },
] as const satisfies ReadonlyArray<{ key: string; page: LayoutPage; preset: boolean }>;

export type LayoutKey = (typeof LAYOUT_OPTIONS)[number]['key'];

/** Options that are pure JS behaviours rather than hide rules (no CSS rule expected). */
export const LAYOUT_BEHAVIOURS: ReadonlySet<LayoutKey> = new Set<LayoutKey>(['watchExpandDescription']);

export function layoutAttr(key: string): string {
  return `by-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}
