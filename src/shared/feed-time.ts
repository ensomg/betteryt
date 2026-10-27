/**
 * Time helpers for feed items. YouTube renders durations as "12:34" (locale-independent) but
 * upload times as localized relative text ("3 days ago", "vor 3 Tagen", "3 gün önce"...). We parse
 * the common languages; callers fall back to neighbouring items for anything unparseable (the
 * subscriptions feed is sorted newest first).
 */

/** "1:02:03" / "12:34" → seconds; anything else → null. */
export function parseDuration(text: string): number | null {
  const m = /^\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const [, h, mm, ss] = m;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
}

type Unit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const UNIT_MINUTES: Readonly<Record<Unit, number>> = {
  second: 1 / 60,
  minute: 1,
  hour: 60,
  day: 1440,
  week: 10080,
  month: 43200, // 30 days
  year: 525600,
};

/** Word → unit, matched against the token following the number. `=` means exact match only. */
const UNIT_WORDS: ReadonlyArray<[Unit, readonly string[]]> = [
  ['second', ['sec', 'sek', 'seg', 'saniye', 'секунд']],
  ['minute', ['min', 'dakika', 'minuut', 'минут']],
  ['hour', ['hour', 'hr', 'stunde', 'hora', 'heure', '=ora', '=ore', 'saat', '=uur', 'час']],
  ['day', ['day', 'tag', 'día', 'dia', 'jour', 'giorn', 'gün', 'gun', 'dag', 'дн', 'ден', 'день']],
  ['week', ['week', 'wk', 'wek', 'woche', 'semana', 'semaine', 'settiman', 'hafta', 'недел']],
  ['month', ['month', 'monat', 'mes', 'mois', 'mês', 'maand', '=ay', 'месяц']],
  [
    'year',
    ['year', 'yr', 'jahr', 'año', 'ano', '=an', '=ans', 'anno', 'anni', 'yıl', 'yil', 'jaar', 'год', 'лет'],
  ],
];

const COMPACT: Readonly<Record<string, Unit>> = {
  s: 'second',
  m: 'minute',
  min: 'minute',
  h: 'hour',
  d: 'day',
  w: 'week',
  mo: 'month',
  y: 'year',
};

function unitOf(token: string): Unit | null {
  const t = token.toLowerCase();
  for (const [unit, words] of UNIT_WORDS) {
    for (const w of words) {
      if (w.startsWith('=') ? t === w.slice(1) : t.startsWith(w)) return unit;
    }
  }
  return null;
}

/**
 * Relative upload text → age in minutes, or null when it can't be parsed.
 * Handles "3 days ago", "Streamed 2 hours ago", "vor 3 Tagen", "hace 2 semanas", "3 gün önce",
 * and YouTube's compact form "10d ago" / "3w ago" / "2mo ago".
 */
export function parseRelativeAge(text: string): number | null {
  const tokens = text
    // The \s class also covers the non-breaking spaces YouTube uses in some locales.
    .split(/[\s,.()]+/)
    .filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    // Compact units are lowercase only: view counts use uppercase ("158M", "12K").
    const compact = /^(\d+)(s|m|min|h|d|w|mo|y)$/.exec(tokens[i]!);
    if (compact) return Number(compact[1]) * UNIT_MINUTES[COMPACT[compact[2]!]!];
    const n = Number(tokens[i]);
    if (!Number.isFinite(n) || !/^\d+$/.test(tokens[i]!)) continue;
    const unit = tokens[i + 1] ? unitOf(tokens[i + 1]!) : null;
    if (unit) return n * UNIT_MINUTES[unit];
  }
  return null;
}

export type DateGroup = 'today' | 'yesterday' | 'week' | 'earlier';

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar-based group for an item published `ageMinutes` before `now`. */
export function dateGroup(ageMinutes: number, now: Date): DateGroup {
  const published = now.getTime() - ageMinutes * 60_000;
  const today = startOfDay(now);
  if (published >= today) return 'today';
  if (published >= today - 86_400_000) return 'yesterday';
  if (published >= today - 6 * 86_400_000) return 'week';
  return 'earlier';
}

/** Absolute (estimated) date label, e.g. "Oct 24" or "Oct 24, 2025" for other years. */
export function absoluteDate(ageMinutes: number, now: Date, locale?: string): string {
  const d = new Date(now.getTime() - ageMinutes * 60_000);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  // Ages under a day are precise enough to show the time too.
  if (ageMinutes < 1440) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(locale, opts);
}

/**
 * Fills unknown ages (null) from the nearest older-or-equal known neighbour above it, so a feed
 * sorted newest-first keeps contiguous date groups even for unparseable rows.
 */
export function fillAges(ages: ReadonlyArray<number | null>): Array<number | null> {
  const out: Array<number | null> = [];
  let last: number | null = null;
  for (const a of ages) {
    if (a !== null) last = a;
    out.push(a ?? last);
  }
  return out;
}
