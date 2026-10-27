import { DEFAULTS, migrate, type Settings } from './settings-schema';

const SETTINGS_KEY = 'settings';
/** Remembers which area currently holds the settings ('sync' | 'local'). Always stored in local. */
const AREA_KEY = 'settingsArea';

type AreaName = 'sync' | 'local';

async function currentArea(): Promise<AreaName> {
  try {
    const r = await chrome.storage.local.get(AREA_KEY);
    return r[AREA_KEY] === 'local' ? 'local' : 'sync';
  } catch {
    return 'local';
  }
}

export async function loadSettings(): Promise<Settings> {
  try {
    const area = await currentArea();
    const r = await chrome.storage[area].get(SETTINGS_KEY);
    return migrate(r[SETTINGS_KEY] ?? DEFAULTS);
  } catch {
    return migrate(DEFAULTS);
  }
}

function isQuotaError(e: unknown): boolean {
  return e instanceof Error && /quota/i.test(e.message);
}

/**
 * Persists settings to sync (or local when sync is disabled / quota is exceeded).
 * Returns the area actually written to.
 */
export async function saveSettings(settings: Settings): Promise<AreaName> {
  const wanted: AreaName = settings.general.sync ? 'sync' : 'local';
  const previous = await currentArea();
  let written: AreaName = wanted;
  try {
    await chrome.storage[wanted].set({ [SETTINGS_KEY]: settings });
  } catch (e) {
    if (wanted !== 'sync' || !isQuotaError(e)) throw e;
    written = 'local';
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }
  if (written !== previous) {
    await chrome.storage.local.set({ [AREA_KEY]: written });
    // Drop the stale copy so a later area switch can't resurrect old values.
    await chrome.storage[previous].remove(SETTINGS_KEY).catch(() => undefined);
  }
  return written;
}

/** Calls `cb` with validated settings whenever they change in any area. Returns an unsubscribe fn. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>): void => {
    const change = changes[SETTINGS_KEY];
    if (change && change.newValue !== undefined) cb(migrate(change.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
