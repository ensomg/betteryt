import { setPath, DEFAULTS } from '../shared/settings-schema';
import {
  CONTROL_BUTTONS,
  keyCombo,
  normalizeBinding,
  shortcutConflicts,
  SHORTCUT_ACTIONS,
  type ControlButton,
  type ShortcutAction,
} from '../shared/player-options';
import { STRINGS } from '../shared/strings';
import { h } from '../shared/dom';
import { commit, getSettings, onRefresh } from './state';

/** Player section extras: control-bar button manager and the shortcut editor. */

const S = STRINGS.options;
const P = STRINGS.playerUi;

export function renderButtonManager(): HTMLElement {
  const list = h('ul', { class: 'order-list', 'aria-label': S.controlsGroup });
  let signature = '';

  const save = (next: ControlButton[]): void => void commit(setPath(getSettings(), 'player.buttons', next));

  onRefresh(() => {
    const shown = getSettings().player.buttons;
    const sig = JSON.stringify(shown);
    if (sig === signature) return;
    signature = sig;
    // Shown buttons in their order first, then the hidden ones.
    const all = [...shown, ...CONTROL_BUTTONS.filter((b) => !shown.includes(b))];
    list.replaceChildren(
      ...all.map((b) => {
        const on = shown.includes(b);
        const idx = shown.indexOf(b);
        const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': P.buttons[b] });
        cb.addEventListener('change', () => save(cb.checked ? [...shown, b] : shown.filter((x) => x !== b)));
        const move = (dir: -1 | 1): void => {
          const next = [...shown];
          const j = idx + dir;
          if (j < 0 || j >= next.length) return;
          [next[idx], next[j]] = [next[j]!, next[idx]!];
          save(next);
        };
        const li = h(
          'li',
          {
            class: `order-list__item${on ? '' : ' order-list__item--off'}`,
            draggable: on ? 'true' : 'false',
            'data-key': b,
          },
          h('label', { class: 'order-list__label' }, cb, h('span', {}, P.buttons[b])),
          h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'aria-label': `${S.moveUp}: ${P.buttons[b]}`,
              disabled: !on || idx === 0,
              onclick: () => move(-1),
            },
            '↑',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'aria-label': `${S.moveDown}: ${P.buttons[b]}`,
              disabled: !on || idx === shown.length - 1,
              onclick: () => move(1),
            },
            '↓',
          ),
        );
        if (on) {
          li.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', b));
          li.addEventListener('dragover', (e) => e.preventDefault());
          li.addEventListener('drop', (e) => {
            e.preventDefault();
            const from = e.dataTransfer?.getData('text/plain') as ControlButton | undefined;
            if (!from || from === b || !shown.includes(from)) return;
            const next = shown.filter((x) => x !== from);
            next.splice(next.indexOf(b), 0, from);
            save(next);
          });
        }
        return li;
      }),
    );
  });

  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.controlsGroup),
    h('p', { class: 'group__note' }, S.controlsHint),
    h('div', { class: 'group__body pinned' }, list),
  );
}

export function renderShortcutEditor(): HTMLElement {
  const table = h('div', { class: 'shortcuts', role: 'list' });
  let capturing: ShortcutAction | null = null;
  const rows = new Map<
    ShortcutAction,
    { key: HTMLButtonElement; warn: HTMLElement; reset: HTMLButtonElement }
  >();

  const setBinding = (action: ShortcutAction, value: string): void => {
    const next = { ...getSettings().player.shortcuts, [action]: value };
    void commit(setPath(getSettings(), 'player.shortcuts', next));
  };

  for (const action of SHORTCUT_ACTIONS) {
    const key = h('button', { type: 'button', class: 'kbd-btn', 'aria-label': P.actions[action] });
    const warn = h('span', { class: 'shortcut__warn' });
    const clear = h(
      'button',
      { type: 'button', class: 'chip', onclick: () => setBinding(action, '') },
      S.shortcutClear,
    );
    const reset = h(
      'button',
      {
        type: 'button',
        class: 'reset',
        title: S.resetToDefault,
        'aria-label': `${S.resetToDefault}: ${P.actions[action]}`,
      },
      '↺',
    );
    reset.addEventListener('click', () => setBinding(action, DEFAULTS.player.shortcuts[action]));
    key.addEventListener('click', () => {
      capturing = action;
      key.textContent = S.shortcutPress;
      key.classList.add('kbd-btn--capturing');
    });
    key.addEventListener('keydown', (e) => {
      if (capturing !== action) return;
      if (e.key === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        capturing = null;
        key.classList.remove('kbd-btn--capturing');
        refresh();
        return;
      }
      const combo = keyCombo(e);
      if (!combo) return; // modifier alone: keep waiting
      capturing = null;
      key.classList.remove('kbd-btn--capturing');
      setBinding(action, combo);
    });
    key.addEventListener('blur', () => {
      if (capturing === action) {
        capturing = null;
        key.classList.remove('kbd-btn--capturing');
        refresh();
      }
    });
    rows.set(action, { key, warn, reset });
    table.append(
      h(
        'div',
        { class: 'shortcut', role: 'listitem' },
        h('span', { class: 'shortcut__label' }, P.actions[action]),
        warn,
        h('span', { class: 'shortcut__controls' }, reset, clear, key),
      ),
    );
  }

  const refresh = (): void => {
    const s = getSettings().player.shortcuts;
    const conflicts = shortcutConflicts(s);
    for (const [action, r] of rows) {
      if (capturing !== action) r.key.textContent = normalizeBinding(s[action]) || '—';
      const c = conflicts[action];
      r.warn.textContent = !c
        ? ''
        : c === 'youtube'
          ? S.shortcutConflictYouTube
          : `${S.shortcutConflictWith} “${P.actions[c as ShortcutAction]}”`;
      r.warn.hidden = !c;
      r.reset.hidden = s[action] === DEFAULTS.player.shortcuts[action];
    }
  };
  onRefresh(refresh);

  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.shortcutsGroup),
    h('p', { class: 'group__note' }, S.nativeFrameStep),
    h('div', { class: 'group__body' }, table),
  );
}
