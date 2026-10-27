/** Enables / disables the static declarativeNetRequest ad ruleset to match the settings. */
import { loadSettings } from '../shared/storage';

const RULESET = 'ads-static';

export async function syncAdRules(): Promise<void> {
  try {
    const s = await loadSettings();
    const want = s.general.enabled && s.ads.enabled && s.ads.blockVideoAds;
    const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
    const on = enabled.includes(RULESET);
    if (want === on) return;
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      want ? { enableRulesetIds: [RULESET] } : { disableRulesetIds: [RULESET] },
    );
  } catch (e) {
    console.warn('[BetterYT] ad ruleset sync failed', e);
  }
}
