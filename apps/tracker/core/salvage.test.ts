import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGENDARY_ESSENCE_ID,
  MYTHIC_ESSENCE_ID,
  QUALITY_LEGENDARY,
  QUALITY_MYTHIC,
  salvageFloor,
  salvageYield,
} from './salvage.ts';

/**
 * The community's disassembly table, and the one promise the verdict makes:
 * a floor built on `min` never overstates what a purchase returns.
 */

test('a legendary yields its level, or half of it when it might be neutral', () => {
  const y = salvageYield(QUALITY_LEGENDARY, 6, 'equip');
  assert.deepEqual(y, { essenceId: LEGENDARY_ESSENCE_ID, min: 3, max: 6 });
});

test('a mythic yields half its level rounded down, with no range', () => {
  assert.deepEqual(salvageYield(QUALITY_MYTHIC, 7, 'equip'), { essenceId: MYTHIC_ESSENCE_ID, min: 3, max: 3 });
  assert.deepEqual(salvageYield(QUALITY_MYTHIC, 8, 'equip'), { essenceId: MYTHIC_ESSENCE_ID, min: 4, max: 4 });
});

test('gear below level 2 does not salvage into a verdict', () => {
  assert.equal(salvageYield(QUALITY_LEGENDARY, 1, 'equip'), null);
  assert.equal(salvageYield(QUALITY_MYTHIC, 1, 'equip'), null, 'half of one rounds to nothing');
  assert.equal(salvageYield(QUALITY_LEGENDARY, 0, 'equip'), null);
});

test('ordinary qualities never salvage', () => {
  for (const q of [0, 1, 2, 3, 4, 7]) assert.equal(salvageYield(q, 6, 'equip'), null, `quality ${q}`);
});

test('the floor is the worst-case yield less the five-percent gold fee', () => {
  // Level 6 legendary at 10k essence: neutral yield is 3 essence = 30k
  // gross, and the measured five-percent cut nets 28.5k. No contracts:
  // essence lists without them — confirmed at the sell dialog.
  const floor = salvageFloor(QUALITY_LEGENDARY, 6, 'equip', () => 10_000);
  assert.equal(floor, 28_500);
});

test('the floor never uses the optimistic yield', () => {
  // If it used max (6 essence), the floor would be 54k, and a neutral piece
  // bought at 40k would burn thirteen thousand of the player's gold.
  const floor = salvageFloor(QUALITY_LEGENDARY, 6, 'equip', () => 10_000);
  assert.ok(floor !== null && floor < 40_000);
});

test('no yield, no floor', () => {
  assert.equal(salvageFloor(3, 6, 'equip', () => 10_000), null);
});

test('nothing but equipment ever salvages', () => {
  // Mythic essence is itself quality 6: without the type check the lens was
  // advising players to disassemble essence into essence.
  for (const type of ['material', 'blueprint', 'gem', 'stone', 'potion', 'special']) {
    assert.equal(salvageYield(QUALITY_MYTHIC, 4, type), null, type);
  }
  assert.equal(salvageFloor(QUALITY_MYTHIC, 4, 'material', () => 70_000), null);
});

