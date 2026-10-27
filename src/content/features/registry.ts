import type { Settings } from '../../shared/settings-schema';

/**
 * Contract every feature module implements. The registry owns the lifecycle:
 * init() when the feature becomes enabled, update() on every later settings change while
 * enabled, destroy() when it becomes disabled. Implementations must be idempotent and must
 * fully undo their DOM changes in destroy().
 */
export interface Feature {
  id: string;
  /** Whether the feature should run for these settings (master switch is handled by the registry). */
  enabled(settings: Settings): boolean;
  /** Keep running when the master switch is off (e.g. the settings entry point itself). */
  ignoresMasterSwitch?: boolean;
  init(settings: Settings): void;
  update(settings: Settings): void;
  destroy(): void;
}

export interface FeatureHealth {
  id: string;
  active: boolean;
  /** Set once the feature failed too often; it stays off until the page reloads. */
  killed: boolean;
  errorCount: number;
  lastError: string | null;
  lastRun: number | null;
}

/** Consecutive-ish failures before a feature is switched off for this page load. */
const KILL_THRESHOLD = 5;

export class FeatureRegistry {
  private readonly features: Feature[] = [];
  private readonly health = new Map<string, FeatureHealth>();

  register(...features: Feature[]): void {
    for (const f of features) {
      this.features.push(f);
      this.health.set(f.id, {
        id: f.id,
        active: false,
        killed: false,
        errorCount: 0,
        lastError: null,
        lastRun: null,
      });
    }
  }

  /** Reconcile every feature with the given settings. Never throws. */
  apply(settings: Settings): void {
    for (const f of this.features) {
      const h = this.health.get(f.id);
      if (!h || h.killed) continue;
      let want: boolean;
      try {
        want = (settings.general.enabled || f.ignoresMasterSwitch === true) && f.enabled(settings);
      } catch (e) {
        this.fail(f, h, e);
        continue;
      }
      if (want && !h.active) this.run(f, h, () => f.init(settings), true);
      else if (want && h.active) this.run(f, h, () => f.update(settings), true);
      else if (!want && h.active) this.run(f, h, () => f.destroy(), false);
    }
  }

  /** Wrap a callback that a feature schedules later (observers, timers) with the same safety net. */
  guard<A extends unknown[]>(id: string, fn: (...args: A) => void): (...args: A) => void {
    return (...args: A) => {
      const f = this.features.find((x) => x.id === id);
      const h = this.health.get(id);
      if (!f || !h || h.killed) return;
      this.run(f, h, () => fn(...args), h.active);
    };
  }

  report(id: string, error: unknown): void {
    const f = this.features.find((x) => x.id === id);
    const h = this.health.get(id);
    if (f && h) this.fail(f, h, error);
  }

  snapshot(): FeatureHealth[] {
    return Array.from(this.health.values(), (h) => ({ ...h }));
  }

  private run(f: Feature, h: FeatureHealth, fn: () => void, activeAfter: boolean): void {
    try {
      fn();
      h.active = activeAfter;
      h.lastRun = Date.now();
    } catch (e) {
      this.fail(f, h, e);
    }
  }

  private fail(f: Feature, h: FeatureHealth, e: unknown): void {
    h.errorCount += 1;
    h.lastError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.warn(`[BetterYT] feature "${f.id}" failed`, e);
    if (h.errorCount >= KILL_THRESHOLD) {
      h.killed = true;
      try {
        if (h.active) f.destroy();
      } catch {}
      h.active = false;
      console.warn(`[BetterYT] feature "${f.id}" disabled for this page after repeated errors`);
    }
  }
}

export const registry = new FeatureRegistry();
