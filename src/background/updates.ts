import { loadSettings } from '../shared/storage';
import {
  compareVersions,
  parseUpdateManifest,
  UPDATE_KEY,
  UPDATE_MANIFEST_URL,
  type UpdateInfo,
} from '../shared/update';

const ALARM = 'betteryt-update-check';

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const s = await loadSettings();
  if (!s.general.checkUpdates) {
    await chrome.action.setBadgeText({ text: '' });
    return null;
  }
  // Web Store installs: let Chrome fetch the update now (no-op for unpacked installs).
  try {
    chrome.runtime.requestUpdateCheck?.((status) => {
      if (status === 'update_available') chrome.runtime.reload();
    });
  } catch {}

  const current = chrome.runtime.getManifest().version;
  let info: UpdateInfo = { checkedAt: Date.now(), latest: null, url: null, notes: null, available: false };
  try {
    const res = await fetch(UPDATE_MANIFEST_URL, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (res.ok) {
      const m = parseUpdateManifest(await res.json());
      if (m)
        info = {
          ...info,
          latest: m.version,
          url: m.url,
          notes: m.notes,
          available: compareVersions(m.version, current) > 0,
        };
    }
  } catch {
    // Offline or feed missing: try again tomorrow.
  }
  await chrome.storage.local.set({ [UPDATE_KEY]: info });
  await chrome.action.setBadgeText({ text: info.available ? 'NEW' : '' });
  if (info.available) await chrome.action.setBadgeBackgroundColor({ color: '#e5322d' });
  return info;
}

export function initUpdates(): void {
  void chrome.alarms.create(ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARM) void checkForUpdates();
  });
  // A Web Store update is ready: apply it right away (settings are preserved).
  chrome.runtime.onUpdateAvailable.addListener(() => chrome.runtime.reload());
}
