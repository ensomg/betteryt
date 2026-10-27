/**
 * Typed message bus between the ISOLATED content script and the MAIN-world script.
 *
 * Security model: the page shares the DOM (and, in MAIN, all JS globals) with us, so messages
 * travel as CustomEvents on `window` whose event *type* contains a random per-load token. The
 * token is exchanged during a synchronous rendezvous at document_start, before any page script
 * has run, so the page can never learn it and therefore can neither listen to nor spoof traffic.
 *
 * Rendezvous (works regardless of which script runs first, because dispatchEvent is synchronous):
 *   ISOLATED: listens for MAIN_READY, then dispatches RENDEZVOUS(token).
 *   MAIN:     listens for RENDEZVOUS (accepts the first one only), then dispatches MAIN_READY.
 *   Whichever runs second triggers the other's listener synchronously; MAIN then replies 'hello'
 *   on the private channel and both sides drop the rendezvous listeners.
 *
 * Payloads are JSON strings: CustomEvent.detail objects do not cross worlds, strings do.
 */

import type { Settings } from '../shared/settings-schema';

/** Remembered player state (kept in chrome.storage.local by the ISOLATED side). */
export interface PlayerMemory {
  speed: number | null;
  channelSpeed: Record<string, number>;
  volume: number | null;
}

/** Messages ISOLATED → MAIN. */
export interface IsolatedToMain {
  settings: Settings;
  memory: PlayerMemory;
  /** Run a player action (e.g. from the cinema toggle in the guide). */
  action: { name: string };
}

/** Messages MAIN → ISOLATED. */
export interface MainToIsolated {
  hello: Record<string, never>;
  health: { feature: string; error: string };
  memory: Partial<PlayerMemory> & { channel?: string; channelValue?: number };
  /** Toggle a page-level mode owned by ISOLATED (e.g. cinema mode, Phase 7). */
  mode: { name: 'cinema' };
  /** Ad-blocking action for the diagnostics log. */
  adEvent: { kind: string; detail: string };
}

const RENDEZVOUS = 'betteryt:rendezvous';
const MAIN_READY = 'betteryt:main-ready';

// Captured at module evaluation (document_start) so later page monkey-patching of these
// prototypes in the MAIN world cannot intercept our traffic.
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const nativeDispatch = EventTarget.prototype.dispatchEvent;
const NativeCustomEvent = CustomEvent;
const nativeStringify = JSON.stringify;
const nativeParse = JSON.parse;

interface Envelope {
  type: string;
  payload: unknown;
}

type Listener<T> = (payload: T) => void;

export interface Bus<Out, In> {
  send<K extends keyof Out & string>(type: K, payload: Out[K]): void;
  on<K extends keyof In & string>(type: K, cb: Listener<In[K]>): () => void;
  readonly connected: boolean;
}

function makeBus<Out, In>(outSuffix: string, inSuffix: string) {
  const listeners = new Map<string, Set<Listener<unknown>>>();
  const queue: Envelope[] = [];
  let token: string | null = null;

  const deliver = (raw: unknown): void => {
    if (typeof raw !== 'string') return;
    let env: Envelope;
    try {
      env = nativeParse(raw) as Envelope;
    } catch {
      return;
    }
    const set = listeners.get(env.type);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(env.payload);
      } catch (e) {
        console.warn('[BetterYT] bus listener failed', e);
      }
    }
  };

  let open = false;

  const rawSend = (env: Envelope): void => {
    if (!token || !open) {
      queue.push(env);
      return;
    }
    const ev = new NativeCustomEvent(`betteryt:${token}:${outSuffix}`, { detail: nativeStringify(env) });
    nativeDispatch.call(window, ev);
  };

  const bus: Bus<Out, In> & { attach(t: string): void; open(): void } = {
    get connected() {
      return open;
    },
    /** Start sending (flushes anything queued before the other side was listening). */
    open() {
      if (open || !token) return;
      open = true;
      for (const env of queue.splice(0)) rawSend(env);
    },
    send(type, payload) {
      rawSend({ type, payload });
    },
    on(type, cb) {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(cb as Listener<unknown>);
      return () => set.delete(cb as Listener<unknown>);
    },
    /** Start listening on the private channel for token `t`. */
    attach(t: string) {
      if (token) return;
      token = t;
      nativeAdd.call(window, `betteryt:${t}:${inSuffix}`, ((e: CustomEvent<unknown>) =>
        deliver(e.detail)) as EventListener);
    },
  };
  return bus;
}

/** ISOLATED side. Call once at document_start. */
export function createIsolatedBus(): Bus<IsolatedToMain, MainToIsolated> {
  const bus = makeBus<IsolatedToMain, MainToIsolated>('i2m', 'm2i');
  const token = crypto.randomUUID();
  let done = false;

  const rendezvous = (): void => {
    if (done) return;
    nativeDispatch.call(window, new NativeCustomEvent(RENDEZVOUS, { detail: token }));
  };
  const onMainReady = (): void => rendezvous();

  // Listen for the private channel first so MAIN's synchronous 'hello' is not missed.
  bus.attach(token);
  bus.on('hello', () => {
    done = true;
    nativeRemove.call(window, MAIN_READY, onMainReady);
    // 'hello' arrives synchronously inside createMainBus(); defer the flush so the MAIN script
    // has finished registering its listeners before queued messages arrive.
    queueMicrotask(() => bus.open());
  });
  nativeAdd.call(window, MAIN_READY, onMainReady);
  rendezvous();
  return bus;
}

/** MAIN side. Call once at document_start. */
export function createMainBus(): Bus<MainToIsolated, IsolatedToMain> {
  const bus = makeBus<MainToIsolated, IsolatedToMain>('m2i', 'i2m');

  const onRendezvous = (e: Event): void => {
    const detail = (e as CustomEvent<unknown>).detail;
    if (bus.connected || typeof detail !== 'string' || detail.length < 32) return;
    nativeRemove.call(window, RENDEZVOUS, onRendezvous);
    bus.attach(detail);
    bus.open();
    bus.send('hello', {});
  };
  nativeAdd.call(window, RENDEZVOUS, onRendezvous);
  nativeDispatch.call(window, new NativeCustomEvent(MAIN_READY));
  return bus;
}
