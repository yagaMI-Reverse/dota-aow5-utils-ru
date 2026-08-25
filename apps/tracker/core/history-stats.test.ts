import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionHistory } from './history.ts';
import { archiveRates, craftEtaHours, roomProfit } from './history-stats.ts';

/**
 * The arithmetic behind two claims the UI makes out loud — "this room pays
 * best" and "about two hours to go" — plus the guards that keep either from
 * being said when the archive cannot support it.
 */

/** One gold a unit, so every expectation below is countable by hand. */
const flat = (_id: string, qty: number): number => qty;

function session(id: number, runs: SessionHistory['runs'], source: SessionHistory['source'] = 'console'): SessionHistory {
  return { id, source, runs };
}

function run(room: string, duration: number, items: [string, number][], extra: Partial<SessionHistory['runs'][number]> = {}) {
  return {
    kind: 'run' as const,
    session: 1,
    room,
    endedAt: 1_000,
    duration,
    outcome: 'clear' as const,
    gold: 0,
    items,
    ...extra,
  };
}

test('rooms are ranked by the minute, not by the total', () => {
  // `slow` drops more overall, but takes four times as long doing it.
  const history = [
    session(1, [
      run('fast', 60, [['item_a', 10]]),
      run('slow', 240, [['item_a', 20]]),
    ]),
  ];

  const [first, second] = roomProfit(history, flat);
  assert.equal(first?.room, 'fast', 'the richer minute wins over the richer pile');
  assert.equal(first?.perMinute, 10);
  assert.equal(second?.perMinute, 5);
});

test('a room is summed across sessions, and its best run remembered', () => {
  const history = [
    session(1, [run('mine', 60, [['item_a', 5]])]),
    session(2, [run('mine', 60, [['item_a', 25]])]),
  ];

  const [only] = roomProfit(history, flat);
  assert.equal(only?.runs, 2);
  assert.equal(only?.value, 30);
  assert.equal(only?.perMinute, 15, 'two minutes, thirty gold');
  assert.equal(only?.best, 25, 'the average alone would hide that one run carried it');
});

test('deaths are counted but still cost their time', () => {
  const history = [
    session(1, [
      run('mine', 60, [['item_a', 10]]),
      run('mine', 60, [], { outcome: 'died' }),
    ]),
  ];

  const [only] = roomProfit(history, flat);
  assert.equal(only?.deaths, 1);
  assert.equal(only?.time, 120, 'a death takes the evening whether or not it pays');
  assert.equal(only?.perMinute, 5, 'ten gold over two minutes, not over one');
});

test('a run with no duration cannot divide its way to the top', () => {
  const history = [session(1, [run('broken', 0, [['item_a', 100]])])];
  const [only] = roomProfit(history, flat);
  assert.equal(only?.perMinute, 0, 'not Infinity');
});

test('mock sessions are scaffolding and never count', () => {
  const history = [session(1, [run('mine', 60, [['item_a', 10]])], 'mock')];
  assert.deepEqual(roomProfit(history, flat), []);
  assert.equal(archiveRates(history).activeSeconds, 0);
});

test('drop rates divide by time inside rooms', () => {
  // Two hours of rooms, six of the thing: three an hour, twenty minutes each.
  const history = [
    session(1, [
      run('mine', 3_600, [['item_a', 4]]),
      run('mine', 3_600, [['item_a', 2]]),
    ]),
  ];

  const rates = archiveRates(history);
  assert.equal(rates.activeSeconds, 7_200);
  assert.equal(rates.byItem.get('item_a')?.qty, 6);
  assert.equal(rates.byItem.get('item_a')?.perHour, 3);
  assert.equal(rates.byItem.get('item_a')?.hoursEach, 1 / 3);
});

test('the last drop is the latest run that held one', () => {
  const history = [
    session(1, [
      run('mine', 60, [['item_a', 1]], { endedAt: 500 }),
      run('mine', 60, [['item_a', 1]], { endedAt: 900 }),
      run('mine', 60, [['item_b', 1]], { endedAt: 1_500 }),
    ]),
  ];

  assert.equal(archiveRates(history).byItem.get('item_a')?.lastAt, 900);
});

test('an ETA is the slowest ingredient, not the sum of them', () => {
  // An hour of farming: `slow` at one an hour, `quick` at four.
  const history = [session(1, [run('mine', 3_600, [['slow', 1], ['quick', 4]])])];
  const rates = archiveRates(history);

  assert.equal(craftEtaHours(rates, [{ id: 'quick', count: 4 }]), 1);
  assert.equal(
    craftEtaHours(rates, [
      { id: 'slow', count: 2 },
      { id: 'quick', count: 4 },
    ]),
    2,
    'they drop at the same time, so the wait is the longest one',
  );
});

test('an ingredient that has never dropped has no ETA to give', () => {
  const history = [session(1, [run('mine', 3_600, [['known', 1]])])];
  const rates = archiveRates(history);

  assert.equal(craftEtaHours(rates, [{ id: 'never-seen', count: 1 }]), null);
  assert.equal(
    craftEtaHours(rates, [
      { id: 'known', count: 1 },
      { id: 'never-seen', count: 1 },
    ]),
    null,
    'one unknown poisons the estimate rather than being quietly skipped',
  );
});

test('nothing missing is not an estimate of zero', () => {
  const rates = archiveRates([session(1, [run('mine', 3_600, [['known', 1]])])]);
  assert.equal(craftEtaHours(rates, []), null);
  assert.equal(craftEtaHours(rates, [{ id: 'known', count: 0 }]), null);
});

test('an empty archive says nothing rather than dividing by zero', () => {
  const rates = archiveRates([]);
  assert.equal(rates.activeSeconds, 0);
  assert.equal(rates.byItem.size, 0);
  assert.equal(craftEtaHours(rates, [{ id: 'anything', count: 1 }]), null);
});
