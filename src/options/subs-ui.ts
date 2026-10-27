import { setPath } from '../shared/settings-schema';
import { STRINGS } from '../shared/strings';
import { h } from '../shared/dom';
import { clearState, stateSize } from '../shared/watched-store';
import { commit, flash, getSettings, inExtension, onRefresh } from './state';

/** Subscriptions section extras: pinned-channel manager and the local watched-data manager. */

const S = STRINGS.options;

export function renderPinnedManager(): HTMLElement {
  const list = h('ul', { class: 'pinned-list' });
  const empty = h('p', { class: 'muted pinned-empty' }, S.noPinned);
  const resetOrder = h('button', { type: 'button', class: 'btn' }, S.resetOrder);
  resetOrder.addEventListener(
    'click',
    () => void commit(setPath(getSettings(), 'subs.order', []), S.orderReset),
  );

  let signature = '';
  onRefresh(() => {
    const s = getSettings();
    resetOrder.disabled = s.subs.order.length === 0;
    const sig = JSON.stringify(s.subs.pinned);
    if (sig === signature) return;
    signature = sig;
    empty.hidden = s.subs.pinned.length > 0;
    list.replaceChildren(
      ...s.subs.pinned.map((key, i) => {
        const move = (dir: -1 | 1): void => {
          const next = [...getSettings().subs.pinned];
          const j = i + dir;
          if (j < 0 || j >= next.length) return;
          [next[i], next[j]] = [next[j]!, next[i]!];
          void commit(setPath(getSettings(), 'subs.pinned', next));
        };
        return h(
          'li',
          { class: 'pinned-list__item' },
          h(
            'a',
            { href: `https://www.youtube.com${key}`, target: '_blank', rel: 'noopener noreferrer' },
            key,
          ),
          h('span', { class: 'pinned-list__spacer' }),
          h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'aria-label': `Move ${key} up`,
              disabled: i === 0,
              onclick: () => move(-1),
            },
            '↑',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'aria-label': `Move ${key} down`,
              disabled: i === s.subs.pinned.length - 1,
              onclick: () => move(1),
            },
            '↓',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'chip chip--danger',
              onclick: () =>
                void commit(
                  setPath(
                    getSettings(),
                    'subs.pinned',
                    getSettings().subs.pinned.filter((k) => k !== key),
                  ),
                ),
            },
            STRINGS.subsUi.unpin,
          ),
        );
      }),
    );
  });

  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.pinnedChannels),
    h(
      'div',
      { class: 'group__body pinned' },
      empty,
      list,
      h('div', { class: 'actions actions--flat' }, resetOrder),
    ),
  );
}

export function renderWatchedData(): HTMLElement {
  const count = h('p', { class: 'muted' });
  const refreshCount = (): void => {
    if (!inExtension) {
      count.textContent = S.watchedDataCount(0);
      return;
    }
    void stateSize().then((n) => (count.textContent = S.watchedDataCount(n)));
  };
  const clear = h('button', { type: 'button', class: 'btn btn--danger' }, S.clearWatched);
  clear.addEventListener('click', async () => {
    if (!confirm(S.clearWatchedConfirm)) return;
    if (inExtension) await clearState();
    flash(S.watchedCleared);
    refreshCount();
  });
  refreshCount();
  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.watchedData),
    h('div', { class: 'group__body actions' }, count, h('span', { class: 'pinned-list__spacer' }), clear),
  );
}
