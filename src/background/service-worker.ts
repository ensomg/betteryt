import { loadSettings, saveSettings } from '../shared/storage';
import type { RuntimeMessage, RuntimeResponses } from '../shared/messages';
import { apiLog, getSegments, getVotes } from './api';
import { syncAdRules } from './ad-rules';
import { checkForUpdates, initUpdates } from './updates';

const OPTIONS_PATH = 'options/index.html';

initUpdates();

// Keep the static ad ruleset in line with the settings (worker start, install, every change).
void syncAdRules();
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) void syncAdRules();
});

chrome.runtime.onInstalled.addListener(() => {
  // loadSettings() migrates whatever is stored (or nothing) to the current schema; write it back.
  void loadSettings()
    .then(saveSettings)
    .catch((e: unknown) => console.warn('[BetterYT] settings init failed', e));
});

// No popup: the toolbar icon opens the full settings page.
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

async function openOptions(section?: string): Promise<RuntimeResponses['openOptions']> {
  if (!section) {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  // Deep link to a section; tabs.create needs no "tabs" permission.
  const hash = encodeURIComponent(section);
  await chrome.tabs.create({ url: chrome.runtime.getURL(`${OPTIONS_PATH}#${hash}`) });
  return { ok: true };
}

type Handler = (msg: RuntimeMessage, sender: chrome.runtime.MessageSender) => Promise<unknown>;

const handlers: { [K in RuntimeMessage['type']]: Handler } = {
  openOptions: (msg) => openOptions(msg.type === 'openOptions' ? msg.section : undefined),
  ping: async () => ({ ok: true, version: chrome.runtime.getManifest().version }),
  sponsorSegments: async (msg) => {
    if (msg.type !== 'sponsorSegments') return { ok: false, segments: [] };
    return { ok: true, segments: await getSegments(msg.videoId, msg.categories) };
  },
  dislikes: async (msg) => {
    if (msg.type !== 'dislikes') return { ok: false, votes: null };
    return { ok: true, votes: await getVotes(msg.videoId) };
  },
  apiLog: async () => ({ ok: true, entries: apiLog() }),
  checkUpdates: async () => ({ ok: true, info: await checkForUpdates() }),
};

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  // Only accept messages from our own extension contexts.
  if (sender.id !== chrome.runtime.id) return false;
  if (typeof msg !== 'object' || msg === null || !('type' in msg)) return false;
  const handler = handlers[(msg as RuntimeMessage).type];
  if (!handler) return false;
  handler(msg as RuntimeMessage, sender)
    .then(sendResponse)
    .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
  return true; // keep the channel open for the async response
});
