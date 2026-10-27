import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHORTCUTS,
  keyCombo,
  normalizeBinding,
  pickQuality,
  shortcutConflicts,
} from '../src/shared/player-options';
import { blockType } from '../src/content/main/codec';
import { addWatch, emptyStats, summarize, toCsv } from '../src/shared/watch-stats';
import { DEFAULTS, setPath, validate } from '../src/shared/settings-schema';

const ev = (
  key: string,
  mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {},
) => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('quality ladder', () => {
  const levels = ['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny', 'auto'];
  it('picks the requested quality or the best below it', () => {
    expect(pickQuality('hd1080', levels)).toBe('hd1080');
    expect(pickQuality('hd2160', levels)).toBe('hd1080');
    expect(pickQuality('hd1440', ['hd720', 'large'])).toBe('hd720');
    expect(pickQuality('highest', levels)).toBe('hd1080');
    expect(pickQuality('auto', levels)).toBeNull();
    expect(pickQuality('hd720', [])).toBeNull();
  });
  it('falls back to the lowest when everything is above the cap', () => {
    expect(pickQuality('small', ['hd1080', 'hd720'])).toBe('hd720');
  });
});

describe('shortcuts', () => {
  it('builds normalized combos from key events', () => {
    expect(keyCombo(ev(']'))).toBe(']');
    expect(keyCombo(ev('S', { shiftKey: true }))).toBe('Shift+S');
    expect(keyCombo(ev('s', { ctrlKey: true }))).toBe('Ctrl+s');
    expect(keyCombo(ev('?', { shiftKey: true }))).toBe('?');
    expect(keyCombo(ev('Shift', { shiftKey: true }))).toBe('');
    expect(keyCombo(ev('ArrowUp', { altKey: true }))).toBe('Alt+ArrowUp');
  });

  it('normalizes stored bindings', () => {
    expect(normalizeBinding('shift+s')).toBe('Shift+S');
    expect(normalizeBinding('alt+ctrl+K')).toBe('Ctrl+Alt+k');
    expect(normalizeBinding('')).toBe('');
  });

  it('defaults have no conflicts', () => {
    expect(shortcutConflicts(DEFAULT_SHORTCUTS)).toEqual({});
  });

  it('flags duplicates and YouTube keys', () => {
    const c = shortcutConflicts({ ...DEFAULT_SHORTCUTS, loop: ']', pip: 'k' });
    expect(c.loop).toBe('speedUp');
    expect(c.speedUp).toBe('loop');
    expect(c.pip).toBe('youtube');
  });

  it('validates bindings in settings', () => {
    const s = validate({ player: { shortcuts: { loop: 'Shift+L', pip: 'not a key', bogus: 'x' } } });
    expect(s.player.shortcuts.loop).toBe('Shift+L');
    expect(s.player.shortcuts.pip).toBe(DEFAULTS.player.shortcuts.pip);
    expect(s.player.shortcuts).not.toHaveProperty('bogus');
    expect(
      setPath(DEFAULTS, 'player.shortcuts', { ...DEFAULTS.player.shortcuts, loop: '' }).player.shortcuts.loop,
    ).toBe('');
  });

  it('validates button lists and ranges', () => {
    const s = validate({ player: { buttons: ['loop', 'evil', 'pip'], boost: 900, defaultSpeed: 2.5 } });
    expect(s.player.buttons).toEqual(['loop', 'pip']);
    expect(s.player.boost).toBe(DEFAULTS.player.boost);
    expect(s.player.defaultSpeed).toBe(2.5);
  });
});

describe('codec preference', () => {
  const vp9 = 'video/webm; codecs="vp09.00.51.08"';
  const av1 = 'video/mp4; codecs="av01.0.12M.08"';
  const h264 = 'video/mp4; codecs="avc1.640028"';
  it('blocks codecs per preference', () => {
    expect(blockType(vp9, { codec: 'h264', max30fps: false })).toBe(true);
    expect(blockType(av1, { codec: 'h264', max30fps: false })).toBe(true);
    expect(blockType(h264, { codec: 'h264', max30fps: false })).toBe(false);
    expect(blockType(av1, { codec: 'vp9', max30fps: false })).toBe(true);
    expect(blockType(vp9, { codec: 'vp9', max30fps: false })).toBe(false);
    expect(blockType(av1, { codec: 'auto', max30fps: false })).toBe(false);
  });
  it('limits frame rate', () => {
    expect(blockType(`${h264}; framerate=60`, { codec: 'auto', max30fps: true })).toBe(true);
    expect(blockType(`${h264}; framerate=30`, { codec: 'auto', max30fps: true })).toBe(false);
  });
});

describe('watch stats', () => {
  it('accumulates per day and channel and summarizes', () => {
    let s = emptyStats();
    s = addWatch(s, 120, { key: '/@a', name: 'A' }, '2026-10-27');
    s = addWatch(s, 60, { key: '/@b', name: 'B' }, '2026-10-26');
    s = addWatch(s, 30, { key: '/@a', name: 'A' }, '2026-10-27');
    s = addWatch(s, -5, null, '2026-10-27');
    const sum = summarize(s, new Date(2026, 9, 27, 12));
    expect(sum.today).toBe(150);
    expect(sum.week).toBe(210);
    expect(sum.top[0]).toMatchObject({ key: '/@a', secs: 150 });
    expect(toCsv(s).split('\n')[0]).toBe('type,key,name,seconds');
    expect(toCsv(s)).toContain('channel,/@b,B,60');
  });
});
