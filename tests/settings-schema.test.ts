import { describe, expect, it } from 'vitest';
import { DEFAULTS, SCHEMA_VERSION, getPath, migrate, setPath, validate } from '../src/shared/settings-schema';
import { fuzzyScore } from '../src/shared/fuzzy';

describe('validate', () => {
  it('returns defaults for garbage input', () => {
    expect(validate(undefined)).toEqual(DEFAULTS);
    expect(validate(42)).toEqual(DEFAULTS);
    expect(validate('x')).toEqual(DEFAULTS);
  });

  it('keeps valid values and drops unknown keys', () => {
    const out = validate({ general: { enabled: false, bogus: 1 }, nope: true });
    expect(out.general.enabled).toBe(false);
    expect(out).not.toHaveProperty('nope');
    expect(out.general).not.toHaveProperty('bogus');
  });

  it('resets values of the wrong type or outside constraints', () => {
    const out = validate({ general: { enabled: 'yes', animationLevel: 'wild' } });
    expect(out.general.enabled).toBe(DEFAULTS.general.enabled);
    expect(out.general.animationLevel).toBe(DEFAULTS.general.animationLevel);
  });

  it('does not share references with DEFAULTS', () => {
    const out = validate({});
    out.general.enabled = false;
    expect(DEFAULTS.general.enabled).toBe(true);
  });
});

describe('migrate', () => {
  it('upgrades unversioned v0 data (flat enabled flag)', () => {
    const out = migrate({ enabled: false });
    expect(out.version).toBe(SCHEMA_VERSION);
    expect(out.general.enabled).toBe(false);
  });

  it('is a no-op for current data', () => {
    const current = setPath(DEFAULTS, 'general.performanceMode', true);
    expect(migrate(current)).toEqual(current);
  });

  it('survives non-object input', () => {
    expect(migrate(null)).toEqual(DEFAULTS);
  });
});

describe('path helpers', () => {
  it('reads and writes dotted paths immutably', () => {
    const next = setPath(DEFAULTS, 'general.animationLevel', 'off');
    expect(getPath(next, 'general.animationLevel')).toBe('off');
    expect(DEFAULTS.general.animationLevel).toBe('standard');
  });

  it('rejects invalid values via validation', () => {
    const next = setPath(DEFAULTS, 'general.animationLevel', 'nonsense');
    expect(next.general.animationLevel).toBe('standard');
  });
});

describe('fuzzyScore', () => {
  it('ranks substring matches above subsequence matches', () => {
    expect(fuzzyScore('sync', 'sync settings')).toBeGreaterThan(fuzzyScore('snc', 'sync settings'));
  });
  it('returns -1 when characters are missing', () => {
    expect(fuzzyScore('xyz', 'animation level')).toBe(-1);
  });
});
