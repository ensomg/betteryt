/**
 * ISOLATED-world entry (document_start). Owns settings, html attributes, the MAIN-world bus and
 * the feature registry. Each feature is wrapped by the registry so one failure can't break YouTube.
 */
import { DEFAULTS, type AnimationLevel, type Settings } from '../shared/settings-schema';
import { loadSettings, onSettingsChanged } from '../shared/storage';
import { createIsolatedBus } from './bus';
import { registry } from './features/registry';
import { guideEntry } from './features/guide-entry';
import { theme } from './features/theme';
import { layout } from './features/layout';
import { playables } from './features/playables';
import { feed } from './features/feed';
import { watchProgress } from './features/watch-progress';
import { sponsorblock } from './features/sponsorblock';
import { dislikes } from './features/dislikes';
import { shorts } from './features/shorts';
import { ambient } from './features/ambient';
import { initPlayerBridge, mirrorAds, mirrorCodec } from './player-bridge';

const bus = createIsolatedBus();
const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

registry.register(
  theme,
  layout,
  playables,
  feed,
  watchProgress,
  sponsorblock,
  dislikes,
  shorts,
  ambient,
  guideEntry,
);
initPlayerBridge(bus);

let current: Settings = DEFAULTS;

function effectiveAnimation(s: Settings): AnimationLevel {
  if (s.general.performanceMode && s.general.animationLevel === 'expressive') return 'standard';
  if (reducedMotion.matches) return s.general.animationLevel === 'off' ? 'off' : 'reduced';
  return s.general.animationLevel;
}

/** Attribute-driven CSS hooks: toggling these is instant and needs no re-render. */
function applyAttributes(s: Settings): void {
  if (!s.general.enabled) {
    for (const name of root.getAttributeNames()) {
      if (name === 'betteryt' || name.startsWith('by-')) root.removeAttribute(name);
    }
    return;
  }
  root.setAttribute('betteryt', '');
  root.setAttribute('by-anim', effectiveAnimation(s));
  root.toggleAttribute('by-perf', s.general.performanceMode);
  root.toggleAttribute('by-anim-thumbs', s.animations.thumbnails);
  root.toggleAttribute('by-anim-menus', s.animations.menus);
  const ads = s.ads.enabled;
  root.toggleAttribute('by-ads-feed', ads && s.ads.hideFeedAds);
  root.toggleAttribute('by-ads-video', ads && s.ads.blockVideoAds);
  root.toggleAttribute('by-ads-premium', ads && s.ads.hidePremium);
  root.toggleAttribute('by-ads-warning', ads && s.ads.dismissWarning);
}

function apply(s: Settings): void {
  current = s;
  applyAttributes(s);
  registry.apply(s);
  mirrorCodec(s);
  mirrorAds(s);
  bus.send('settings', s);
}

reducedMotion.addEventListener('change', () => applyAttributes(current));
onSettingsChanged(apply);
void loadSettings().then(apply);
