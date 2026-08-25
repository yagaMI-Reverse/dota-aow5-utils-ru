/**
 * What the archive knows once you ask it across sessions rather than within
 * one: which rooms pay for the time they take, and how often a given item
 * actually drops.
 *
 * `stats.ts` answers both questions for the evening in progress, from live
 * state. This answers them for everything ever recorded, from `SessionHistory`
 * — a different input and a different question, which is why it is a different
 * module rather than four more exports over there.
 *
 * Prices are applied at read time, never stored. The archive keeps item ids
 * and quantities, so an evening from a year ago is valued the way tonight's
 * is, against the player's own prices — the same choice `HistoryView` already
 * makes, and the reason a "best room" list does not slowly become a fiction as
 * prices change.
 *
 * Mock sessions are dropped here rather than by the caller. They are
 * scaffolding for developing the UI without Dota running, and a room table
 * that averaged them in would be confidently wrong.
 */
import type { SessionHistory } from './history.ts';
import type { ValueOf } from './stats.ts';

/** One room, across every session that visited it. */
export interface RoomProfit {
  room: string;
  runs: number;
  /**
   * Runs that ended in a death.
   *
   * Part of the answer to "is this room worth it" rather than a footnote: a
   * room that pays well and kills you a third of the time is not the same
   * proposition as one that pays the same and does not.
   */
  deaths: number;
  /** Seconds inside the room, deaths included — they cost the time either way. */
  time: number;
  /** What it dropped, at today's prices. */
  value: number;
  /** The headline. Gold per minute inside the room. */
  perMinute: number;
  /** The richest single visit, so an average carried by one lucky run shows. */
  best: number;
}

/**
 * Every room that has ever been finished, best paying first.
 *
 * Sorted by the per-minute figure because that is the question — the room with
 * the largest total is usually just the room you have run most.
 */
export function roomProfit(sessions: readonly SessionHistory[], valueOf: ValueOf): RoomProfit[] {
  const rooms = new Map<string, RoomProfit>();

  for (const session of sessions) {
    if (session.source === 'mock') continue;
    for (const run of session.runs) {
      const at = rooms.get(run.room) ?? {
        room: run.room,
        runs: 0,
        deaths: 0,
        time: 0,
        value: 0,
        perMinute: 0,
        best: 0,
      };

      let value = 0;
      for (const [id, qty] of run.items) value += valueOf(id, qty);

      at.runs += 1;
      if (run.outcome === 'died') at.deaths += 1;
      at.time += run.duration;
      at.value += value;
      if (value > at.best) at.best = value;
      rooms.set(run.room, at);
    }
  }

  for (const room of rooms.values()) {
    // Guarded rather than trusted: a run recorded with no duration would
    // otherwise divide into an infinite rate and top the table forever.
    room.perMinute = room.time > 0 ? (room.value / room.time) * 60 : 0;
  }

  return [...rooms.values()].sort((a, b) => b.perMinute - a.perMinute);
}

/** How often one item shows up, and when it last did. */
export interface ItemRate {
  id: string;
  /** How many have dropped across the archive. */
  qty: number;
  perHour: number;
  /** Hours of farming per one of these. `Infinity` when none have dropped. */
  hoursEach: number;
  /** Epoch ms of the most recent one, or null. */
  lastAt: number | null;
}

export interface ArchiveRates {
  /** Seconds inside rooms across the archive — the denominator for every rate. */
  activeSeconds: number;
  byItem: Map<string, ItemRate>;
}

/**
 * Drop rates over everything recorded.
 *
 * The denominator is time *inside rooms*, not wall-clock across the evening,
 * so a night with a long break in it does not depress every rate. It is the
 * same denominator the live gold-per-hour uses, which is what lets the two
 * numbers be compared without a footnote.
 */
export function archiveRates(sessions: readonly SessionHistory[]): ArchiveRates {
  const byItem = new Map<string, ItemRate>();
  let activeSeconds = 0;

  for (const session of sessions) {
    if (session.source === 'mock') continue;
    for (const run of session.runs) {
      activeSeconds += run.duration;
      for (const [id, qty] of run.items) {
        const at = byItem.get(id) ?? { id, qty: 0, perHour: 0, hoursEach: Infinity, lastAt: null };
        at.qty += qty;
        // `endedAt` is when the run closed, which is the closest the archive
        // gets to when a drop happened — it does not time individual items.
        if (at.lastAt === null || run.endedAt > at.lastAt) at.lastAt = run.endedAt;
        byItem.set(id, at);
      }
    }
  }

  const hours = activeSeconds / 3600;
  for (const rate of byItem.values()) {
    rate.perHour = hours > 0 ? rate.qty / hours : 0;
    rate.hoursEach = rate.qty > 0 && hours > 0 ? hours / rate.qty : Infinity;
  }

  return { activeSeconds, byItem };
}

/**
 * How long the missing pieces should take, at the rate they have been dropping.
 *
 * The slowest ingredient, not the sum: they drop at the same time as each
 * other, so the wait is the longest one rather than every one queued up.
 *
 * Null when nothing can be said — an ingredient that has never dropped has no
 * rate to extrapolate from, and a made-up number here would be worse than an
 * empty space. That is the common case early on, which is exactly when the
 * temptation to invent one is strongest.
 */
export function craftEtaHours(
  rates: ArchiveRates,
  missing: readonly { id: string; count: number }[],
): number | null {
  let longest = 0;

  for (const need of missing) {
    if (need.count <= 0) continue;
    const rate = rates.byItem.get(need.id);
    if (rate === undefined || !Number.isFinite(rate.hoursEach)) return null;
    const wait = rate.hoursEach * need.count;
    if (wait > longest) longest = wait;
  }

  return longest > 0 ? longest : null;
}
