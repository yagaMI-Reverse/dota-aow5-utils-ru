/**
 * Rank-aware item names, for the one place fuzzy matching is not allowed to
 * be fuzzy.
 *
 * Legendary and mythic gear comes in families that differ by a trailing rank
 * — "Печать: Дух дракона III", "Мешок рун убийцы (2 ур.)" — and the ranks
 * are exactly what sloppy OCR drops. Bigram similarity scores the siblings
 * nearly identical, so a lost "III" resolves to whichever rank is closest —
 * a different item, a different level, and a salvage verdict that spends real
 * gold on the wrong maths. The fix is structural: a name is a family plus a
 * rank, and when the family has siblings, ranks must agree exactly or the
 * match is refused.
 *
 * Works on *folded* names — lowercased, punctuation stripped, spaces
 * collapsed — because that is what both sides of the comparison already are.
 */

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
};

export interface RankedName {
  /** The name with the rank removed; the key siblings share. */
  family: string;
  /** Null when the name carries no rank at all. */
  rank: number | null;
}

/**
 * Splits a folded name into family and trailing rank.
 *
 * Three spellings, tried in the order the game uses them: "… 2 ур" (folding
 * eats the brackets and the dot), a trailing roman numeral, and a bare
 * trailing number. Numbers inside the name ("Топор 1000 истин") are not
 * trailing and stay part of the family.
 */
export function parseRank(folded: string): RankedName {
  const level = /^(.*?)\s+(\d{1,2})\s+ур$/.exec(folded);
  if (level) return { family: level[1]!, rank: Number(level[2]) };

  const roman = /^(.*?)\s+(i{1,3}|iv|vi{0,3}|ix|x)$/.exec(folded);
  if (roman && ROMAN[roman[2]!] !== undefined) return { family: roman[1]!, rank: ROMAN[roman[2]!]! };

  /*
   * OCR reads a roman numeral as a column of ones: II arrives as "11", III
   * as "111". A run of ones is therefore its own length — and only its
   * length, because no family in the game ranks past V, so a literal rank
   * eleven does not exist for this to shadow. A single "1" falls through to
   * the bare-number rule and means one either way.
   */
  const ones = /^(.*?)\s+(1{2,3})$/.exec(folded);
  if (ones) return { family: ones[1]!, rank: ones[2]!.length };

  const bare = /^(.*?)\s+(\d{1,2})$/.exec(folded);
  if (bare) return { family: bare[1]!, rank: Number(bare[2]) };

  return { family: folded, rank: null };
}

/**
 * Whether a fuzzy match may stand, given what the OCR text says its rank is.
 *
 * The rule errs toward silence: a candidate that carries a rank — or has
 * siblings that do — is only accepted when the OCR text parsed to the same
 * rank. No rank read, no match; wrong rank read, no match. An unranked
 * candidate in a family of one is what fuzzy matching is for, and passes.
 */
export function rankAgrees(ocr: RankedName, candidate: RankedName, familySize: number): boolean {
  if (candidate.rank === null && familySize <= 1) return true;
  return ocr.rank !== null && ocr.rank === candidate.rank;
}
