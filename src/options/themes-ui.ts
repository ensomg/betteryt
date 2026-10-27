import { setPath, type CustomTheme, type Settings } from '../shared/settings-schema';
import {
  allThemes,
  BUILTIN_THEMES,
  contrastIssues,
  DEFAULT_THEME_ID,
  deriveColors,
  newCustomId,
  schemeOf,
  YOUTUBE_PREVIEW,
  type Theme,
  type ThemeColors,
} from '../shared/themes';
import { STRINGS } from '../shared/strings';
import { h } from '../shared/dom';
import { commit, flash, getSettings, onRefresh } from './state';

/** Theme gallery (built-in + custom) and the custom theme editor dialog. */

const S = STRINGS.options;

/** Select options listing every theme, for the dark/light theme pickers. */
export function themeOptions(s: Settings): Record<string, string> {
  const out: Record<string, string> = { [DEFAULT_THEME_ID]: YOUTUBE_PREVIEW.name };
  for (const t of allThemes(s)) out[t.id] = t.name;
  return out;
}

/** A tiny mock YouTube card painted with the theme's colors. */
export function themePreview(colors: ThemeColors, large = false): HTMLElement {
  const el = h(
    'div',
    { class: `preview${large ? ' preview--large' : ''}`, 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'preview__card' },
      h('div', { class: 'preview__thumb' }, h('span', { class: 'preview__progress' })),
      h(
        'div',
        { class: 'preview__meta' },
        h('span', { class: 'preview__avatar' }),
        h(
          'div',
          { class: 'preview__lines' },
          large
            ? h('span', { class: 'preview__title' }, S.previewTitle)
            : h('span', { class: 'preview__line' }),
          large
            ? h('span', { class: 'preview__sub' }, S.previewMeta)
            : h('span', { class: 'preview__line preview__line--short' }),
        ),
      ),
    ),
  );
  paintPreview(el, colors);
  return el;
}

function paintPreview(el: HTMLElement, c: ThemeColors): void {
  const vars: Record<string, string> = {
    '--p-bg': c.bg,
    '--p-surface': c.surface,
    '--p-text': c.text,
    '--p-text2': c.text2,
    '--p-accent': c.accent,
    '--p-divider': c.divider,
  };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}

/* ---------- Editor ---------- */

interface Draft {
  id: string | null;
  name: string;
  bg: string;
  surface: string;
  text: string;
  accent: string;
}

const dialog = h('dialog', { class: 'editor', 'aria-labelledby': 'editor-title' });
document.body.append(dialog);

function hex6(c: string): string {
  return c.slice(0, 7);
}

function openEditor(base: Theme | null, asCopy: boolean): void {
  const src = base?.colors ?? YOUTUBE_PREVIEW.colors;
  const draft: Draft = {
    id: base && !base.builtIn && !asCopy ? base.id : null,
    name: base ? (asCopy ? `${base.name} ${S.copySuffix}` : base.name) : S.newTheme,
    bg: hex6(src.bg),
    surface: hex6(src.surface),
    text: hex6(src.text),
    accent: hex6(src.accent),
  };

  const preview = themePreview(deriveColors(draft), true);
  const badge = h('span', { class: 'badge' });
  const update = (): void => {
    const colors = deriveColors(draft);
    paintPreview(preview, colors);
    const issues = contrastIssues(colors);
    badge.textContent = issues.length ? `${S.contrastWarning}: ${issues.join(', ')}` : S.contrastOk;
    badge.classList.toggle('badge--warn', issues.length > 0);
  };

  const nameInput = h('input', { class: 'text-input', id: 'editor-name', value: draft.name, maxlength: 40 });
  nameInput.addEventListener('input', () => {
    draft.name = nameInput.value;
  });

  const colorField = (key: 'bg' | 'surface' | 'text' | 'accent', label: string): HTMLElement => {
    const input = h('input', { type: 'color', id: `editor-${key}`, value: draft[key] });
    input.addEventListener('input', () => {
      draft[key] = input.value;
      update();
    });
    return h('label', { class: 'color-field', for: `editor-${key}` }, input, h('span', {}, label));
  };

  const save = (): void => {
    const s = getSettings();
    const theme: CustomTheme = {
      id: draft.id ?? newCustomId(),
      name: draft.name.trim() || S.newTheme,
      scheme: schemeOf(draft.bg),
      colors: deriveColors(draft),
    };
    const list = s.theme.custom.filter((t) => t.id !== theme.id);
    const index = s.theme.custom.findIndex((t) => t.id === theme.id);
    list.splice(index === -1 ? list.length : index, 0, theme);
    let next = setPath(s, 'theme.custom', list);
    next = setPath(setPath(next, 'theme.mode', 'fixed'), 'theme.theme', theme.id);
    void commit(next);
    dialog.close();
  };

  dialog.replaceChildren(
    h(
      'form',
      { method: 'dialog', class: 'editor__form', onsubmit: (e: Event) => (e.preventDefault(), save()) },
      h('h3', { id: 'editor-title', class: 'editor__title' }, draft.id ? S.edit : S.newTheme),
      h('label', { class: 'editor__label', for: 'editor-name' }, S.themeName),
      nameInput,
      h(
        'div',
        { class: 'editor__colors' },
        colorField('bg', S.themeBg),
        colorField('surface', S.themeSurface),
        colorField('text', S.themeText),
        colorField('accent', S.themeAccent),
      ),
      preview,
      badge,
      h(
        'div',
        { class: 'editor__actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, S.cancel),
        h('button', { type: 'submit', class: 'btn btn--primary' }, S.saveTheme),
      ),
    ),
  );
  update();
  dialog.showModal();
  nameInput.select();
}

/* ---------- Import / export ---------- */

function exportTheme(t: Theme): void {
  const data = JSON.stringify(
    { betteryt: 'theme', version: 1, name: t.name, scheme: t.scheme, colors: t.colors },
    null,
    2,
  );
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  h('a', {
    href: url,
    download: `betteryt-theme-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
  }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importTheme(file: File): Promise<void> {
  try {
    const raw: unknown = JSON.parse(await file.text());
    if (typeof raw !== 'object' || raw === null) throw new Error('not an object');
    const r = raw as Partial<CustomTheme>;
    const s = getSettings();
    const candidate = { id: newCustomId(), name: r.name, scheme: r.scheme, colors: r.colors };
    // The schema's item validator drops anything malformed.
    const next = setPath(s, 'theme.custom', [...s.theme.custom, candidate]);
    if (next.theme.custom.length !== s.theme.custom.length + 1) throw new Error('invalid theme');
    await commit(next, S.themeImported);
  } catch {
    flash(S.themeImportFailed, 'error');
  }
}

/* ---------- Gallery ---------- */

function selectTheme(id: string): void {
  const s = getSettings();
  void commit(setPath(setPath(s, 'theme.mode', 'fixed'), 'theme.theme', id));
}

function deleteTheme(id: string): void {
  if (!confirm(S.deleteThemeConfirm)) return;
  const s = getSettings();
  let next = setPath(
    s,
    'theme.custom',
    s.theme.custom.filter((t) => t.id !== id),
  );
  for (const key of ['theme', 'darkTheme', 'lightTheme'] as const) {
    if (next.theme[key] === id)
      next = setPath(next, `theme.${key}`, key === 'lightTheme' ? 'light-clean' : DEFAULT_THEME_ID);
  }
  void commit(next);
}

function card(t: Theme, active: boolean): HTMLElement {
  const actions: HTMLElement[] = [
    h('button', { type: 'button', class: 'chip', onclick: () => openEditor(t, true) }, S.duplicate),
  ];
  if (!t.builtIn) {
    actions.unshift(
      h('button', { type: 'button', class: 'chip', onclick: () => openEditor(t, false) }, S.edit),
    );
    actions.push(
      h('button', { type: 'button', class: 'chip', onclick: () => exportTheme(t) }, S.exportTheme),
      h('button', { type: 'button', class: 'chip chip--danger', onclick: () => deleteTheme(t.id) }, S.delete),
    );
  }
  const isDefault = t.id === DEFAULT_THEME_ID;
  return h(
    'div',
    { class: `theme-card${active ? ' theme-card--active' : ''}`, role: 'listitem' },
    h(
      'button',
      {
        type: 'button',
        class: 'theme-card__select',
        'aria-pressed': String(active),
        onclick: () => selectTheme(t.id),
      },
      themePreview(t.colors),
      h(
        'span',
        { class: 'theme-card__name' },
        t.name,
        active ? h('span', { class: 'badge' }, S.activeBadge) : null,
      ),
    ),
    isDefault ? null : h('div', { class: 'theme-card__actions' }, ...actions),
  );
}

export function renderThemeGallery(): HTMLElement {
  const grid = h('div', { class: 'theme-grid', role: 'list' });
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void importTheme(file);
  });

  let signature = '';
  onRefresh(() => {
    const s = getSettings();
    const activeId = s.theme.mode === 'fixed' ? s.theme.theme : null;
    const sig = JSON.stringify([activeId, s.theme.custom]);
    if (sig === signature) return;
    signature = sig;
    grid.replaceChildren(
      card(YOUTUBE_PREVIEW, activeId === DEFAULT_THEME_ID),
      ...BUILTIN_THEMES.map((t) => card(t, activeId === t.id)),
      ...s.theme.custom.map((t) => card({ ...t, builtIn: false }, activeId === t.id)),
    );
  });

  return h(
    'section',
    { class: 'group' },
    h('h3', { class: 'group__title' }, S.themeGallery),
    grid,
    h(
      'div',
      { class: 'actions actions--flat' },
      h('button', { type: 'button', class: 'btn', onclick: () => openEditor(null, false) }, S.newTheme),
      h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, S.importTheme),
      fileInput,
    ),
  );
}
