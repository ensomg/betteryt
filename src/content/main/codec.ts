/**
 * Advanced codec / frame-rate preference. YouTube picks formats by asking
 * MediaSource.isTypeSupported(); answering "no" for some codecs steers it to others.
 *
 * This must be decided synchronously at document_start, before the player probes, so the
 * ISOLATED script mirrors the two settings into localStorage (CODEC_KEY) and we read them here.
 * Changes therefore apply on the next page load.
 */

export const CODEC_KEY = 'betteryt:codec';

interface CodecPref {
  codec: 'auto' | 'h264' | 'vp9' | 'av1';
  max30fps: boolean;
}

function readPref(): CodecPref | null {
  try {
    const raw = localStorage.getItem(CODEC_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CodecPref>;
    const codec = v.codec === 'h264' || v.codec === 'vp9' || v.codec === 'av1' ? v.codec : 'auto';
    return { codec, max30fps: v.max30fps === true };
  } catch {
    return null;
  }
}

/** Pure decision used by the override (and unit tests). */
export function blockType(type: string, pref: CodecPref): boolean {
  const t = type.toLowerCase();
  if (pref.codec === 'h264' && /vp0?9|av01/.test(t)) return true;
  if (pref.codec === 'vp9' && /av01/.test(t)) return true;
  if (pref.max30fps) {
    const fps = /framerate=(\d+)/.exec(t);
    if (fps && Number(fps[1]) > 30) return true;
  }
  return false;
}

export function applyCodecPreference(): void {
  const pref = readPref();
  if (!pref || (pref.codec === 'auto' && !pref.max30fps)) return;
  // 'av1' means "allow AV1" (YouTube already prefers it when supported): nothing to block.
  if (typeof MediaSource === 'undefined') return;
  const original = MediaSource.isTypeSupported.bind(MediaSource);
  const patched = (type: string): boolean => !blockType(type, pref) && original(type);
  try {
    Object.defineProperty(MediaSource, 'isTypeSupported', {
      value: patched,
      configurable: true,
      writable: true,
    });
  } catch {
    // Non-configurable in this browser: leave YouTube's choice alone.
  }
}
