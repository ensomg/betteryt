import { DEFAULTS, type Settings } from '../shared/settings-schema';
import { loadSettings, onSettingsChanged, saveSettings } from '../shared/storage';
import { STRINGS } from '../shared/strings';

/**
 * Options-page state: the current settings, persistence, the "Saved" indicator and the list of
 * refreshers every rendered control registers to re-sync itself after a change.
 */

export const inExtension = typeof chrome !== 'undefined' && !!chrome.storage?.local;

/** Real chrome.storage inside the extension; in-memory when opened outside it (static preview). */
const store = inExtension
  ? { load: loadSettings, save: saveSettings, subscribe: onSettingsChanged }
  : {
      load: async () => structuredClone(DEFAULTS),
      save: async () => 'local' as const,
      subscribe: () => () => undefined,
    };

let settings: Settings = structuredClone(DEFAULTS);

export function getSettings(): Settings {
  return settings;
}

const refreshers: Array<() => void> = [];

export function onRefresh(fn: () => void): void {
  refreshers.push(fn);
}

export function refreshAll(): void {
  for (const r of refreshers) {
    try {
      r();
    } catch (e) {
      console.error('[BetterYT] options refresh failed', e);
    }
  }
}

const statusEl = document.getElementById('status') as HTMLElement;
let statusTimer: ReturnType<typeof setTimeout> | undefined;

export function flash(text: string, kind: 'ok' | 'error' = 'ok'): void {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
  statusEl.classList.add('status--visible');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove('status--visible'), 1600);
}

export async function commit(next: Settings, message: string = STRINGS.options.saved): Promise<void> {
  settings = next;
  refreshAll();
  try {
    await store.save(next);
    flash(message);
  } catch (e) {
    console.error(e);
    flash(STRINGS.options.saveFailed, 'error');
  }
}

export async function boot(): Promise<void> {
  settings = await store.load();
  refreshAll();
  store.subscribe((s) => {
    settings = s;
    refreshAll();
  });
}
