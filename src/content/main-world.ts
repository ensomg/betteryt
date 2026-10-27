/**
 * MAIN-world entry (document_start). Runs with page privileges: YouTube's player API and (Phase 8)
 * player-response cleaning. Never touches chrome.* (unavailable here); talks to the ISOLATED script
 * only through the private bus.
 */
import { createMainBus } from './bus';
import { installAdBlocking, setAdReporter } from './main/ads';
import { registry } from './features/registry';
import { ctx, setBus } from './main/context';
import { applyCodecPreference } from './main/codec';
import { playback } from './main/features/playback';
import { audio } from './main/features/audio';
import { automation } from './main/features/automation';
import { tools } from './main/features/tools';
import { controls } from './main/features/controls';

// Both must run before YouTube's own scripts (synchronous, from localStorage mirrors).
applyCodecPreference();
installAdBlocking();

const bus = createMainBus();
setBus(bus);
setAdReporter((e) => bus.send('adEvent', e));

registry.register(playback, audio, automation, tools, controls);

bus.on('memory', (m) => {
  ctx.memory = m;
});

// Deliberately no window globals: anything visible to the page is a detection fingerprint.
bus.on('settings', (s) => {
  ctx.settings = s;
  ctx.ready = true;
  registry.apply(s);
});
