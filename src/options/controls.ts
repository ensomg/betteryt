import { DEFAULTS, getPath, setPath, type Settings } from '../shared/settings-schema';
import { STRINGS, type SettingPath } from '../shared/strings';
import { h } from '../shared/dom';
import { commit, getSettings, onRefresh } from './state';

/** Declarative setting controls. Every control auto-saves and offers "reset to default". */

interface Base {
  path: SettingPath;
  /** Row is shown only when this returns true (e.g. schedule times only in schedule mode). */
  when?: (s: Settings) => boolean;
}

export type Control =
  | (Base & { kind: 'toggle' })
  | (Base & {
      kind: 'select';
      options: Readonly<Record<string, string>> | ((s: Settings) => Readonly<Record<string, string>>);
    })
  | (Base & { kind: 'range'; min: number; max: number; step?: number; unit?: string; zeroLabel?: string })
  | (Base & { kind: 'time' })
  | (Base & { kind: 'textarea'; placeholder?: string })
  | (Base & { kind: 'multi'; options: Readonly<Record<string, string>> });

export function controlId(path: string, scope: string): string {
  return `setting-${scope}-${path.replace(/\./g, '-')}`;
}

function rangeText(c: Extract<Control, { kind: 'range' }>, v: number): string {
  return v === 0 && c.zeroLabel ? c.zeroLabel : `${v}${c.unit ?? ''}`;
}

export function renderControl(c: Control, scope: string): HTMLElement {
  const [label, description] = STRINGS.settings[c.path];
  const id = controlId(c.path, scope);
  const descId = `${id}-desc`;
  const defaultValue = getPath(DEFAULTS, c.path);
  const value = (): unknown => getPath(getSettings(), c.path);
  const save = (v: unknown): void => void commit(setPath(getSettings(), c.path, v));

  let input: HTMLElement;
  let sync: () => void;

  switch (c.kind) {
    case 'toggle': {
      const sw = h(
        'button',
        { type: 'button', role: 'switch', id, class: 'switch', 'aria-describedby': descId },
        h('span', { class: 'switch__thumb' }),
      );
      sw.addEventListener('click', () => save(!value()));
      sync = () => sw.setAttribute('aria-checked', String(value() === true));
      input = sw;
      break;
    }
    case 'select': {
      const sel = h('select', { id, class: 'select', 'aria-describedby': descId });
      let signature = '';
      sel.addEventListener('change', () => save(sel.value));
      sync = () => {
        const opts = typeof c.options === 'function' ? c.options(getSettings()) : c.options;
        const sig = JSON.stringify(opts);
        if (sig !== signature) {
          signature = sig;
          sel.replaceChildren(...Object.entries(opts).map(([v, text]) => h('option', { value: v }, text)));
        }
        sel.value = String(value());
      };
      input = sel;
      break;
    }
    case 'range': {
      const out = h('output', { class: 'range__value', for: id });
      const range = h('input', {
        type: 'range',
        id,
        class: 'range',
        min: c.min,
        max: c.max,
        step: c.step ?? 1,
        'aria-describedby': descId,
      });
      range.addEventListener('input', () => {
        out.textContent = rangeText(c, Number(range.value));
      });
      // Persist on release only: chrome.storage.sync limits writes per minute.
      range.addEventListener('change', () => save(Number(range.value)));
      sync = () => {
        range.value = String(value());
        out.textContent = rangeText(c, Number(value()));
      };
      input = h('div', { class: 'range-wrap' }, range, out);
      break;
    }
    case 'textarea': {
      const ta = h('textarea', {
        id,
        class: 'textarea',
        rows: 4,
        spellcheck: 'false',
        placeholder: c.placeholder,
        'aria-describedby': descId,
      });
      // Save when the user pauses typing (sync storage limits writes per minute).
      let timer: ReturnType<typeof setTimeout> | undefined;
      ta.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => save(ta.value), 700);
      });
      ta.addEventListener('blur', () => {
        clearTimeout(timer);
        if (ta.value !== value()) save(ta.value);
      });
      sync = () => {
        if (document.activeElement !== ta) ta.value = String(value() ?? '');
      };
      input = ta;
      break;
    }
    case 'multi': {
      const group = h('div', {
        class: 'multi',
        role: 'group',
        id,
        'aria-labelledby': `${id}-label`,
        'aria-describedby': descId,
      });
      const boxes = Object.entries(c.options).map(([v, text]) => {
        const cb = h('input', { type: 'checkbox', value: v });
        cb.addEventListener('change', () => {
          const current = new Set(value() as string[]);
          if (cb.checked) current.add(v);
          else current.delete(v);
          // Keep the declared option order.
          save(Object.keys(c.options).filter((k) => current.has(k)));
        });
        group.append(h('label', { class: 'multi__option' }, cb, h('span', {}, text)));
        return cb;
      });
      sync = () => {
        const current = new Set(value() as string[]);
        for (const cb of boxes) cb.checked = current.has(cb.value);
      };
      input = group;
      break;
    }
    case 'time': {
      const t = h('input', { type: 'time', id, class: 'select', 'aria-describedby': descId });
      t.addEventListener('change', () => {
        if (t.value) save(t.value);
      });
      sync = () => {
        t.value = String(value());
      };
      input = t;
      break;
    }
  }

  const reset = h(
    'button',
    {
      type: 'button',
      class: 'reset',
      title: STRINGS.options.resetToDefault,
      'aria-label': `${STRINGS.options.resetToDefault}: ${label}`,
    },
    '↺',
  );
  reset.addEventListener('click', () => save(defaultValue));

  const row = h(
    'div',
    { class: 'setting', 'data-path': c.path },
    h(
      'div',
      { class: 'setting__text' },
      h('label', { class: 'setting__label', for: id, id: `${id}-label` }, label),
      h('p', { class: 'setting__desc', id: descId }, description),
    ),
    h('div', { class: 'setting__control' }, reset, input),
  );

  onRefresh(() => {
    sync();
    const isDefault = JSON.stringify(value()) === JSON.stringify(defaultValue);
    reset.hidden = isDefault;
    row.classList.toggle('setting--changed', !isDefault);
    row.hidden = c.when ? !c.when(getSettings()) : false;
  });
  return row;
}
