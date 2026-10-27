import type { SbSegment, Votes } from './sponsorblock';
import type { UpdateInfo } from './update';

/** Typed messages sent from content scripts / the options page to the service worker. */
export type RuntimeMessage =
  | { type: 'openOptions'; section?: string }
  | { type: 'ping' }
  | { type: 'sponsorSegments'; videoId: string; categories: string[] }
  | { type: 'dislikes'; videoId: string }
  | { type: 'apiLog' }
  | { type: 'checkUpdates' };

export interface ApiLogEntry {
  api: 'sponsorblock' | 'ryd';
  at: number;
  status: 'network' | 'cache' | 'error';
  detail: string;
}

export interface RuntimeResponses {
  openOptions: { ok: boolean };
  ping: { ok: true; version: string };
  sponsorSegments: { ok: boolean; segments: SbSegment[] };
  dislikes: { ok: boolean; votes: Votes | null };
  apiLog: { ok: true; entries: ApiLogEntry[] };
  checkUpdates: { ok: true; info: UpdateInfo | null };
}

export function sendMessage<M extends RuntimeMessage>(msg: M): Promise<RuntimeResponses[M['type']]> {
  return chrome.runtime.sendMessage(msg) as Promise<RuntimeResponses[M['type']]>;
}
