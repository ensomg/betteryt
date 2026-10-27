/**
 * Subsequence fuzzy score for settings search. Substring hits rank highest; otherwise contiguous
 * runs and word-start matches score higher. Both inputs are expected lower-case. -1 = no match.
 */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  const direct = text.indexOf(query);
  if (direct !== -1) return 1000 - direct;
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of query) {
    if (ch === ' ') continue;
    const found = text.indexOf(ch, ti);
    if (found === -1) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2 + (found === 0 || text[found - 1] === ' ' ? 3 : 0);
    ti = found + 1;
  }
  return score;
}
