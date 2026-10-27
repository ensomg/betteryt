import { AD_RULES_VERSION } from '../shared/ad-rules';
import { STRINGS } from '../shared/strings';
import { h } from '../shared/dom';
import { flash, getSettings, inExtension } from './state';

/** Ad Blocking section extras: recent events log and a copy-to-clipboard debug report. */

const S = STRINGS.options;

interface AdLogEntry {
  at: number;
  kind: string;
  detail: string;
}

async function readLog(): Promise<AdLogEntry[]> {
  if (!inExtension) return [];
  const r = await chrome.storage.local.get('adLog');
  return Array.isArray(r.adLog) ? (r.adLog as AdLogEntry[]) : [];
}

export function renderAdDiagnostics(): HTMLElement {
  const list = h('ul', { class: 'pinned-list ad-log' });
  const empty = h('p', { class: 'muted pinned-empty' }, S.adsLogEmpty);

  const render = async (): Promise<void> => {
    const log = await readLog();
    empty.hidden = log.length > 0;
    list.replaceChildren(
      ...log
        .slice(0, 20)
        .map((e) =>
          h(
            'li',
            { class: 'pinned-list__item' },
            h(
              'span',
              { class: 'ad-log__time' },
              new Date(e.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' }),
            ),
            h('span', { class: 'ad-log__kind' }, S.adKinds[e.kind] ?? e.kind),
            h('span', { class: 'muted ad-log__detail' }, e.detail),
          ),
        ),
    );
  };

  const copy = h('button', { type: 'button', class: 'btn' }, S.adsReport);
  copy.addEventListener('click', async () => {
    const report = {
      extension: inExtension ? chrome.runtime.getManifest().version : 'dev',
      rules: AD_RULES_VERSION,
      userAgent: navigator.userAgent,
      settings: getSettings().ads,
      rulesetEnabled: inExtension ? await chrome.declarativeNetRequest.getEnabledRulesets() : [],
      recent: (await readLog()).slice(0, 30),
    };
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    flash(S.adsReportCopied);
  });
  const clear = h('button', { type: 'button', class: 'btn btn--danger' }, S.adsClearLog);
  clear.addEventListener('click', async () => {
    if (inExtension) await chrome.storage.local.remove('adLog');
    void render();
  });
  void render();

  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.adsLogGroup),
    h('p', { class: 'group__note' }, S.adsRules(AD_RULES_VERSION)),
    h(
      'div',
      { class: 'group__body pinned' },
      empty,
      list,
      h('div', { class: 'actions actions--flat' }, copy, clear),
    ),
  );
}
