import { DEFAULTS, setPath } from '../shared/settings-schema';
import { SB_ACTIONS, SB_CATEGORIES, type SbAction } from '../shared/sponsorblock';
import { keyCombo, normalizeBinding } from '../shared/player-options';
import { STRINGS } from '../shared/strings';
import { h } from '../shared/dom';
import { commit, getSettings, inExtension, onRefresh } from './state';

/** SponsorBlock section extras: per-category action + color table, skip key, whitelist, stats. */

const S = STRINGS.options;
const T = STRINGS.sbUi;

export function renderCategoryTable(): HTMLElement {
  const body = h('div', { class: 'group__body' });
  for (const c of SB_CATEGORIES) {
    const sel = h('select', { class: 'select', 'aria-label': `${T.categories[c.id]}: action` });
    for (const a of SB_ACTIONS) {
      // Points / whole-video labels can't be skipped.
      if (c.kind !== 'range' && (a === 'skip' || a === 'button')) continue;
      sel.append(h('option', { value: a }, T.actions[a]));
    }
    sel.addEventListener(
      'change',
      () =>
        void commit(setPath(getSettings(), `sponsorblock.categories.${c.id}.action`, sel.value as SbAction)),
    );
    const color = h('input', {
      type: 'color',
      class: 'sb-color',
      'aria-label': `${T.categories[c.id]}: color`,
    });
    color.addEventListener(
      'change',
      () => void commit(setPath(getSettings(), `sponsorblock.categories.${c.id}.color`, color.value)),
    );
    const swatch = h('span', { class: 'sb-swatch', 'aria-hidden': 'true' });
    const row = h(
      'div',
      { class: 'setting', 'data-path': `sponsorblock.categories.${c.id}` },
      h(
        'div',
        { class: 'setting__text' },
        h('span', { class: 'setting__label' }, swatch, T.categories[c.id]),
      ),
      h('div', { class: 'setting__control' }, color, sel),
    );
    onRefresh(() => {
      const cur = getSettings().sponsorblock.categories[c.id];
      sel.value = cur.action;
      color.value = cur.color.slice(0, 7);
      swatch.style.background = cur.color;
      row.classList.toggle('setting--off', cur.action === 'off');
    });
    body.append(row);
  }
  return h('section', { class: 'group' }, h('h3', { class: 'group__title' }, S.sbCategoriesGroup), body);
}

export function renderSkipKey(): HTMLElement {
  const [label, desc] = STRINGS.settings['sponsorblock.skipKey'];
  const btn = h('button', { type: 'button', class: 'kbd-btn', 'aria-label': label });
  let capturing = false;
  btn.addEventListener('click', () => {
    capturing = true;
    btn.textContent = S.shortcutPress;
    btn.classList.add('kbd-btn--capturing');
  });
  btn.addEventListener('keydown', (e) => {
    if (!capturing || e.key === 'Tab') return;
    e.preventDefault();
    const combo = e.key === 'Escape' ? null : keyCombo(e);
    if (combo === '') return;
    capturing = false;
    btn.classList.remove('kbd-btn--capturing');
    if (combo)
      void commit(setPath(getSettings(), 'sponsorblock.skipKey', combo === 'Space' ? 'Space' : combo));
    else btn.textContent = normalizeBinding(getSettings().sponsorblock.skipKey);
  });
  const reset = h('button', { type: 'button', class: 'reset', title: S.resetToDefault }, '↺');
  reset.addEventListener(
    'click',
    () => void commit(setPath(getSettings(), 'sponsorblock.skipKey', DEFAULTS.sponsorblock.skipKey)),
  );
  onRefresh(() => {
    if (!capturing) btn.textContent = normalizeBinding(getSettings().sponsorblock.skipKey);
    reset.hidden = getSettings().sponsorblock.skipKey === DEFAULTS.sponsorblock.skipKey;
  });
  return h(
    'div',
    { class: 'group__body' },
    h(
      'div',
      { class: 'setting', 'data-path': 'sponsorblock.skipKey' },
      h(
        'div',
        { class: 'setting__text' },
        h('span', { class: 'setting__label' }, label),
        h('p', { class: 'setting__desc' }, desc),
      ),
      h('div', { class: 'setting__control' }, reset, btn),
    ),
  );
}

export function renderWhitelist(): HTMLElement {
  const list = h('ul', { class: 'pinned-list' });
  const empty = h('p', { class: 'muted pinned-empty' }, S.sbNoWhitelist);
  let sig = '';
  onRefresh(() => {
    const sb = getSettings().sponsorblock;
    const next = JSON.stringify([sb.whitelistChannels, sb.whitelistVideos]);
    if (next === sig) return;
    sig = next;
    const items: Array<[string, string, 'whitelistChannels' | 'whitelistVideos']> = [
      ...sb.whitelistChannels.map(
        (k) =>
          [k, `https://www.youtube.com${k}`, 'whitelistChannels'] as [string, string, 'whitelistChannels'],
      ),
      ...sb.whitelistVideos.map(
        (v) =>
          [v, `https://www.youtube.com/watch?v=${v}`, 'whitelistVideos'] as [
            string,
            string,
            'whitelistVideos',
          ],
      ),
    ];
    empty.hidden = items.length > 0;
    list.replaceChildren(
      ...items.map(([key, href, field]) =>
        h(
          'li',
          { class: 'pinned-list__item' },
          h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, key),
          h('span', { class: 'pinned-list__spacer' }),
          h(
            'button',
            {
              type: 'button',
              class: 'chip chip--danger',
              onclick: () =>
                void commit(
                  setPath(
                    getSettings(),
                    `sponsorblock.${field}`,
                    getSettings().sponsorblock[field].filter((x) => x !== key),
                  ),
                ),
            },
            S.remove,
          ),
        ),
      ),
    );
  });
  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.sbWhitelistGroup),
    h('div', { class: 'group__body pinned' }, empty, list),
  );
}

function duration(secs: number): string {
  const h_ = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h_ ? `${h_} h ${m} min` : `${m} min`;
}

export function renderSbStats(): HTMLElement {
  const p = h('p', { class: 'muted' }, S.sbStats(0, duration(0)));
  if (inExtension) {
    void chrome.storage.local.get('sbStats').then((r) => {
      const st = (r.sbStats as { skips?: number; saved?: number } | undefined) ?? {};
      p.textContent = S.sbStats(st.skips ?? 0, duration(st.saved ?? 0));
    });
  }
  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.sbStatsGroup),
    h('div', { class: 'group__body about' }, p),
  );
}
