import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRank, rankAgrees } from './market-names.ts';

/**
 * The rank rules exist for one failure: OCR drops a trailing "III" and bigram
 * similarity happily resolves to rank II — a different item at a different
 * level, verdicted with real gold on the line.
 */

test('the three rank spellings parse, folded', () => {
  assert.deepEqual(parseRank('мешок рун убийцы 2 ур'), { family: 'мешок рун убийцы', rank: 2 });
  assert.deepEqual(parseRank('печать дух дракона iii'), { family: 'печать дух дракона', rank: 3 });
  assert.deepEqual(parseRank('печать рикошетный дротик 1'), { family: 'печать рикошетный дротик', rank: 1 });
});

test('a roman numeral read as a column of ones is its length', () => {
  // OCR delivers II as "11" and III as "111"; the seals were unbadgeable
  // until the parser learned the dialect.
  assert.deepEqual(parseRank('печать секретное оружие 11'), { family: 'печать секретное оружие', rank: 2 });
  assert.deepEqual(parseRank('печать секретное оружие 111'), { family: 'печать секретное оружие', rank: 3 });
  assert.equal(
    rankAgrees(parseRank('печать раневой клинковый круг 111'), parseRank('печать раневой клинковый круг iii'), 3),
    true,
  );
});

test('an unranked name is a family of itself', () => {
  assert.deepEqual(parseRank('дезолятор'), { family: 'дезолятор', rank: null });
});

test('numbers inside a name are not ranks', () => {
  const parsed = parseRank('топор 1000 истин');
  // Four digits never parse as a rank, so the number stays in the family.
  assert.equal(parsed.rank, null);
  assert.equal(parsed.family, 'топор 1000 истин');
});

test('a ranked candidate demands the same rank read from the screen', () => {
  const candidate = parseRank('печать дух дракона iii');
  assert.equal(rankAgrees(parseRank('печать дух дракона iii'), candidate, 3), true);
  assert.equal(rankAgrees(parseRank('печать дух дракона ii'), candidate, 3), false, 'wrong rank');
  assert.equal(rankAgrees(parseRank('печать дух дракона'), candidate, 3), false, 'rank lost by OCR');
});

test('an unranked candidate with siblings is refused without a rank', () => {
  // The family exists in ranked variants; matching the bare name is a guess.
  assert.equal(rankAgrees(parseRank('мешок рун убийцы'), parseRank('мешок рун убийцы'), 3), false);
});

test('a lone unranked name is what fuzzy matching is for', () => {
  assert.equal(rankAgrees(parseRank('дезолятор'), parseRank('дезолятор'), 1), true);
});
