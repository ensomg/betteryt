/** Shared MAIN-world state: latest settings, remembered player memory and the bus back to ISOLATED. */
import { DEFAULTS, type Settings } from '../../shared/settings-schema';
import type { Bus, IsolatedToMain, MainToIsolated, PlayerMemory } from '../bus';

let bus: Bus<MainToIsolated, IsolatedToMain> | null = null;

export const ctx: { settings: Settings; memory: PlayerMemory; ready: boolean } = {
  settings: DEFAULTS,
  memory: { speed: null, channelSpeed: {}, volume: null },
  ready: false,
};

export function setBus(b: Bus<MainToIsolated, IsolatedToMain>): void {
  bus = b;
}

export function send<K extends keyof MainToIsolated & string>(type: K, payload: MainToIsolated[K]): void {
  bus?.send(type, payload);
}

/** Named player actions, shared by control-bar buttons and keyboard shortcuts. */
const actions = new Map<string, () => void>();

export function defineAction(name: string, run: () => void): void {
  actions.set(name, run);
}

export function runAction(name: string): boolean {
  const run = actions.get(name);
  if (!run) return false;
  run();
  return true;
}
