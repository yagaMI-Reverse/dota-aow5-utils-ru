import { useEffect, useMemo, useState } from 'react';
import type { MarketFrame, MarketTextLine } from '@core/ipc.ts';
import { tf } from '@core/i18n.ts';
import ruNames from 'aow5-shared/public/data/locale.ru.names.json';
import enNames from 'aow5-shared/public/data/locale.en.names.json';
import {
  ESSENCE_TABLE_COST,
  GUILD_CONTRACT_ID,
  MYTHIC_ESSENCE_ID,
  QUALITY_LEGENDARY,
  salvageFloor,
  salvageYield,
} from '@core/salvage.ts';
import { parseRank, rankAgrees, type RankedName } from '@core/market-names.ts';
import { useItems } from '@/features/items/table';
import { pricing } from '@/features/items/prices';
import { compact } from '@/lib/format';
import { useOverlay } from '@/shell/useOverlay';

/**
 * The Exchange lens: a full-screen, permanently click-through sheet that
 * badges every listing row the watcher could read with what the tracker
 * thinks of the price.
 *
 * All the reading happens here rather than in main, because this side owns
 * the item table, both languages' names and the player's own prices. Main
 * ships positioned OCR text and nothing else.
 *
 * The one hard rule: **no badge without a confident read.** A wrong verdict
 * glued to a real listing is worse than a missing one — it spends the
 * player's money. Rows whose name does not resolve cleanly get no badge, and
 * OCR noise never becomes a number.
 */

/** OCR confuses these inside what should be digits. Both scripts covered. */
const DIGIT_FIXES: Record<string, string> = {
  з: '3',
  З: '3',
  о: '0',
  О: '0',
  o: '0',
  O: '0',
  б: '6',
  Б: '6',
  l: '1',
  I: '1',
};

/**
 * "ф399.9k" | "Ф9999" -> gold, or null when it does not parse.
 *
 * The leading Ф is required, not optional: the Exchange prints it on every
 * price, and it is what separates a price from the numeric shrapnel OCR
 * sheds around it — "2" broken off "2d 23h 59m" was anchoring phantom
 * two-gold listings that verdicted as a 100% bargain on every row.
 */
function parsePrice(raw: string): number | null {
  if (!/^[фФ]/.test(raw.trim())) return null;
  let s = raw.trim().replace(/[фФ]/g, '').replace(/\s+/g, '');
  s = s.replace(/./g, (ch) => DIGIT_FIXES[ch] ?? ch);
  const m = /^(\d+(?:[.,]\d+)?)([kкKКmмMМ])?$/.exec(s);
  if (!m) return null;
  const base = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(base)) return null;
  const suffix = m[2]?.toLowerCase();
  const factor = suffix === 'm' || suffix === 'м' ? 1_000_000 : suffix ? 1000 : 1;
  return Math.round(base * factor);
}

/** Case, ё and punctuation folded away; what OCR noise leaves of a name. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Dice coefficient over bigrams: cheap, and forgiving of one bad glyph. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}

interface NameEntry {
  id: string;
  folded: string;
  grams: Set<string>;
  ranked: RankedName;
}

interface NameIndex {
  entries: NameEntry[];
  /** How many entries share a family — the signal that ranks must agree. */
  familySize: Map<string, number>;
}

/**
 * Every name the Exchange could print, in both languages, folded once.
 *
 * Russian and English both, because the game speaks whichever the player set
 * and the watcher has no idea which that is. Duplicate names across languages
 * are fine: they resolve to their own ids, and a name that appears in both
 * maps to the same item anyway.
 */
function buildIndex(): NameIndex {
  const entries: NameEntry[] = [];
  const familySize = new Map<string, number>();
  for (const source of [ruNames, enNames] as { names?: Record<string, string> }[]) {
    const names = source.names ?? {};
    for (const [id, name] of Object.entries(names)) {
      if (typeof name !== 'string' || name.length < 3) continue;
      const folded = fold(name);
      if (folded.length < 3) continue;
      const ranked = parseRank(folded);
      entries.push({ id, folded, grams: bigrams(folded), ranked });
      familySize.set(ranked.family, (familySize.get(ranked.family) ?? 0) + 1);
    }
  }
  return { entries, familySize };
}

/**
 * OCR'd name -> item id, or null below the confidence bar.
 *
 * Exact folded match first — most reads are perfect — then best bigram score
 * with a floor of 0.72 and a lead of 0.06 over the runner-up. The floor keeps
 * garbage out; the lead keeps near-duplicate names ("Ороговение I" vs "II")
 * from being guessed at, which is exactly when a guess is most expensive.
 */
function resolveName(index: NameIndex, raw: string): string | null {
  const folded = fold(raw);
  if (folded.length < 4) return null;

  let best: NameEntry | null = null;
  let bestScore = 0;
  let second = 0;
  const grams = bigrams(folded);
  for (const entry of index.entries) {
    if (entry.folded === folded) return entry.id;
    const score = similarity(grams, entry.grams);
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = entry;
    } else if (score > second) {
      second = score;
    }
  }
  if (best === null || bestScore < 0.72) return null;
  if (bestScore - second < 0.06 && second > 0) return null;
  /*
   * The rank gate. Ranked families — "… II" vs "… III", "(2 ур.)" vs
   * "(3 ур.)" — are exactly where the priciest gear lives and exactly where
   * bigrams cannot tell siblings apart. Fuzzy is allowed to fix letters, but
   * never to guess the rank: no rank read, or a different one, means no
   * match at all.
   */
  if (!rankAgrees(parseRank(folded), best.ranked, index.familySize.get(best.ranked.family) ?? 1)) return null;
  return best.id;
}

type Verdict = 'buy' | 'fair' | 'skip' | 'salvage' | 'learn' | 'range';

interface Badge {
  key: string;
  y: number;
  h: number;
  verdict: Verdict;
  /** Listed price against the tracker's unit value, as a signed percentage. */
  deltaPct: number;
  name: string;
  /** Salvage only: the guaranteed essence count, and which essence it is. */
  essMin?: number;
  essMythic?: boolean;
  /** Range only: the mixed market's quartile spread, preformatted. */
  rangeLo?: string;
  rangeHi?: string;
}

/**
 * The market ledger: every listing the lens reads, remembered per item.
 *
 * The table cost is what the *game* thinks an item is worth, and for anything
 * players actually trade it is off by an order of magnitude — a relic with a
 * 3.5k table cost trades around 150k, so a fair 85k listing was being badged
 * "+2300% overpriced". The only honest reference is what listings have
 * actually asked, so that is what gets kept: a rolling week of sightings per
 * item, and the market price is their median.
 *
 * The median needs three sightings before it speaks. One listing is an
 * opinion, not a market — and until there is a market, the lens would rather
 * say nothing than argue from the table.
 *
 * A sighting is deduplicated by price within a day: the same listing sits on
 * the Exchange for three days and the lens rereads it hundreds of times a
 * session, and a median of one lot repeated is that lot, not the market.
 */
/** Learned-median price above which any item earns focus by itself. */
const FOCUS_MARKET_FLOOR = 5000;

const LEDGER_KEY = 'aow5.market.ledger';
const LEDGER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LEDGER_DEDUP_MS = 24 * 60 * 60 * 1000;
const LEDGER_PER_ITEM = 40;
const LEDGER_MIN_SAMPLES = 3;

type Ledger = Record<string, { g: number; t: number }[]>;

function loadLedger(): Ledger {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEDGER_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Ledger) : {};
  } catch {
    return {};
  }
}

/** In memory for the session; parsing a growing ledger per frame would not fly. */
const ledger: Ledger = loadLedger();
let ledgerDirty = false;

function noteListing(id: string, gold: number): void {
  const now = Date.now();
  const rows = (ledger[id] ?? []).filter((r) => now - r.t < LEDGER_TTL_MS);
  // The same asking price within a day is the same lot seen again.
  if (!rows.some((r) => r.g === gold && now - r.t < LEDGER_DEDUP_MS)) {
    rows.push({ g: gold, t: now });
    if (rows.length > LEDGER_PER_ITEM) rows.splice(0, rows.length - LEDGER_PER_ITEM);
    ledgerDirty = true;
  }
  ledger[id] = rows;
}

/** Persisted at most once a second; localStorage writes are not free. */
let lastSave = 0;
function saveLedger(): void {
  if (!ledgerDirty || Date.now() - lastSave < 1000) return;
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    ledgerDirty = false;
    lastSave = Date.now();
  } catch {
    // A full quota loses history, not correctness: verdicts fall back.
  }
}

/** Fresh sightings so far — the learning badge's progress number. */
function ledgerCount(id: string): number {
  const now = Date.now();
  return (ledger[id] ?? []).filter((r) => now - r.t < LEDGER_TTL_MS).length;
}

/**
 * What this item trades around — as a shape, not one number.
 *
 * One number cannot describe this market: rerolled gear lists under the same
 * name as the plain piece at a multiple of its price, so the sightings for a
 * traded item are two populations in one ledger. The quartiles say which kind
 * of market it is — `wide` (p75 well above p25) means mixed — and the verdict
 * logic treats the two kinds differently rather than pretending a median of a
 * mixture means anything.
 */
interface MarketStats {
  n: number;
  p25: number;
  median: number;
  p75: number;
  /** Mixed market: rerolled and plain listings sharing one name. */
  wide: boolean;
}

function marketStats(id: string): MarketStats | null {
  const now = Date.now();
  const sorted = (ledger[id] ?? [])
    .filter((r) => now - r.t < LEDGER_TTL_MS)
    .map((r) => r.g)
    .sort((a, b) => a - b);
  if (sorted.length < LEDGER_MIN_SAMPLES) return null;
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))]!;
  const p25 = at(0.25);
  const p75 = at(0.75);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  return { n: sorted.length, p25, median, p75, wide: p75 > p25 * 1.6 };
}

/** The single-number view, for callers that price rather than verdict. */
function marketPrice(id: string): number | null {
  return marketStats(id)?.median ?? null;
}

/** Essence: the learned market first, any sighting second, the table last. */
function essencePrice(id: string): number {
  const learned = marketPrice(id);
  if (learned !== null) return learned;
  const any = ledger[id]?.at(-1);
  if (any && Date.now() - any.t < LEDGER_DEDUP_MS) return any.g;
  return ESSENCE_TABLE_COST[id] ?? 0;
}


const STOP_PHRASES = ['за каждый предмет', 'for each item', 'страница', 'купить'];

/** One frame of OCR text -> badge per row we could read with confidence. */
function readFrame(frame: MarketFrame, index: NameIndex, unit: (id: string) => number, itemTable: ReturnType<typeof useItems>): Badge[] {
  // Anchor on prices: a row without a readable price has nothing to verdict.
  const prices = frame.lines
    .map((line) => ({ line, gold: parsePrice(line.text) }))
    .filter((p): p is { line: MarketTextLine; gold: number } => p.gold !== null && p.gold > 0)
    .filter((p) => p.line.x > frame.screenW * 0.5)
    .sort((a, b) => a.line.y - b.line.y)
    // One price per row: whatever two things in a band both parse, a listing
    // has one price, and a second badge on the row draws over the first.
    .filter((p, i, all) => i === 0 || p.line.y - all[i - 1]!.line.y > p.line.h * 1.5);

  const badges: Badge[] = [];
  for (const { line, gold } of prices) {
    // The item name: left of the price, same row band, none of the boilerplate.
    const candidates = frame.lines.filter(
      (l) =>
        l !== line &&
        l.x < frame.screenW * 0.5 &&
        Math.abs(l.y - line.y) < l.h + line.h &&
        l.text.length >= 4 &&
        !STOP_PHRASES.some((s) => fold(l.text).includes(s)),
    );
    if (candidates.length === 0) continue;
    // The name is the tallest text in the band; ties go to the leftmost.
    candidates.sort((a, b) => b.h - a.h || a.x - b.x);
    const nameLine = candidates[0]!;

    const id = resolveName(index, nameLine.text);
    if (id === null) continue;

    // Every resolved listing is a price report; the ledger is how the lens
    // learns what things actually trade for.
    noteListing(id, gold);

    const info = itemTable.get(id);

    /*
     * Badges are for the goods the money lives in. Beyond the legendary and
     * mythic tiers and the essences, three classes trade well below quality
     * five and earn their badge by what they fetch, not what they are: rune
     * bags (the P31x potion families), pets (equip in name only — a level-3
     * rabbit sells for 25k), and epic-or-better runes, which the table types
     * as gems. Everything else still feeds the ledger above; it just does not
     * get a verdict drawn over it.
     */
    const pet = id.startsWith('item_pet_');
    const focus =
      info.quality >= QUALITY_LEGENDARY ||
      ESSENCE_TABLE_COST[id] !== undefined ||
      id === GUILD_CONTRACT_ID ||
      id === 'item_M318' || // Таинственный ключ: epic-tier material, prime trade good
      pet ||
      /^item_P31\d/.test(id) ||
      (info.type === 'gem' && info.quality >= 4) ||
      // The self-widening rule: anything the ledger has learned trades above
      // this floor earns verdicts on its own, whatever tier the table filed
      // it under. The ledger records every resolved listing regardless of
      // focus, so three sightings of any genuinely traded good promote it —
      // no hand-kept list of "things players happen to sell dear".
      (marketPrice(id) ?? 0) >= FOCUS_MARKET_FLOOR;
    if (!focus) continue;

    /*
     * Salvage first: gear listed under what its essence sells for is profit
     * regardless of what the piece itself is worth, and the floor is built on
     * the worst case (neutral yield, exchange cut), so this badge can only
     * understate. The community's whole trade lives in this branch. Equipment
     * only — the type gate inside these calls is what stopped the lens
     * advising players to disassemble essence into essence.
     */
    // Pets type as equipment but nobody has shown the essence rule applies
    // to them; a wrong "disassemble your mythic pet" is not a badge to risk.
    const floor = pet ? null : salvageFloor(info.quality, info.level, info.type, essencePrice);
    if (floor !== null && gold < floor) {
      const y = salvageYield(info.quality, info.level, info.type)!;
      badges.push({
        key: `${id}:${line.y}`,
        y: Math.min(nameLine.y, line.y) - 6,
        h: Math.max(nameLine.h, line.h) + 12,
        verdict: 'salvage',
        deltaPct: Math.round(((floor - gold) / gold) * 100),
        name: info.name,
        essMin: y.min,
        essMythic: y.essenceId === MYTHIC_ESSENCE_ID,
      });
      continue;
    }

    /*
     * The reference is the learned market when there is one. The table cost
     * is only ever allowed to say "cheap": for traded goods it sits far below
     * what players pay, so "expensive against the table" was condemning fair
     * listings by +2000%, while "cheap against the table" is a real find at
     * any market price.
     */
    const stats = marketStats(id);
    if (stats !== null && stats.p25 > 0) {
      const base = {
        key: `${id}:${line.y}`,
        y: Math.min(nameLine.y, line.y) - 6,
        h: Math.max(nameLine.h, line.h) + 12,
        name: info.name,
      };
      /*
       * "Take it" hangs off the lower quartile, not the median: cheaper than
       * the cheap ones is a find whether the piece is rerolled or plain —
       * eight sightings of one pendant ran 145k to 2.5M, and a median of that
       * mixture prices nothing that exists.
       */
      if (gold <= stats.p25 * 0.9) {
        badges.push({ ...base, verdict: 'buy', deltaPct: Math.round(((gold - stats.p25) / stats.p25) * 100) });
      } else if (!stats.wide) {
        // A tight market is one population; the median means what it says.
        const deltaPct = Math.round(((gold - stats.median) / stats.median) * 100);
        badges.push({ ...base, verdict: gold <= stats.median * 1.2 ? 'fair' : 'skip', deltaPct });
      } else if (gold <= stats.p75) {
        badges.push({ ...base, verdict: 'fair', deltaPct: Math.round(((gold - stats.median) / stats.median) * 100) });
      } else {
        /*
         * Mixed market, upper tail: this is where rerolled gear lives, and
         * where "overpriced" is a guess dressed as a verdict. Show the spread
         * instead — a price at the top of it is probably a reroll, and the
         * player is the one who can see the stats.
         */
        badges.push({
          ...base,
          verdict: 'range',
          deltaPct: 0,
          rangeLo: compact(stats.p25),
          rangeHi: compact(stats.p75),
        });
      }
      continue;
    }

    const worth = unit(id);
    if (worth > 0 && gold <= worth * 0.7) {
      badges.push({
        key: `${id}:${line.y}`,
        y: Math.min(nameLine.y, line.y) - 6,
        h: Math.max(nameLine.h, line.h) + 12,
        verdict: 'buy',
        deltaPct: Math.round(((gold - worth) / worth) * 100),
        name: info.name,
      });
      continue;
    }

    // Nothing to verdict from yet — say so. A silent row on a mythic reads
    // as "the lens did not see this one"; a learning count reads as what it
    // is, and tells the player when the median will start speaking.
    badges.push({
      key: `${id}:${line.y}`,
      y: Math.min(nameLine.y, line.y) - 6,
      h: Math.max(nameLine.h, line.h) + 12,
      verdict: 'learn',
      deltaPct: Math.min(ledgerCount(id), LEDGER_MIN_SAMPLES - 1),
      name: info.name,
    });
  }
  return badges;
}

const COLORS: Record<Verdict, { border: string; bg: string; text: string }> = {
  buy: { border: '#4ade80', bg: 'rgba(22, 101, 52, 0.92)', text: '#dcfce7' },
  fair: { border: '#9ca3af', bg: 'rgba(55, 65, 81, 0.92)', text: '#e5e7eb' },
  skip: { border: '#f87171', bg: 'rgba(127, 29, 29, 0.92)', text: '#fee2e2' },
  // The money badge, in the colour of the gear it actually applies to. It was
  // purple first, and purple is the *epic* quality here — the one tier that
  // never salvages — so the badge read as advice about exactly the wrong
  // items. Orange is the mythic tier and close kin to the legendary pink.
  salvage: { border: '#fb923c', bg: 'rgba(154, 52, 18, 0.94)', text: '#ffedd5' },
  // Quiet on purpose: it reports progress, not an opinion.
  learn: { border: '#4b5563', bg: 'rgba(17, 24, 39, 0.85)', text: '#9ca3af' },
  // Information, not advice: the spread of a market that has two kinds of
  // the same item in it.
  range: { border: '#38bdf8', bg: 'rgba(12, 74, 110, 0.9)', text: '#e0f2fe' },
};

export function MarketOverlay() {
  const { config } = useOverlay();
  const itemTable = useItems();
  const [frame, setFrame] = useState<MarketFrame | null>(null);
  const index = useMemo(buildIndex, []);

  useEffect(() => window.tracker.onMarket(setFrame), []);

  const priced = useMemo(
    () => pricing(config?.prices, config?.halvePrices ?? true),
    [config],
  );

  const badges = useMemo(() => {
    if (frame === null || !frame.open) return [];
    const out = readFrame(frame, index, priced.unit, itemTable);
    saveLedger();
    return out;
  }, [frame, index, priced, itemTable]);

  // The badge column sits just left of the listing card, over the game's own
  // backdrop — measured against the same 2560-wide frame the watcher uses.
  const badgeRight = frame === null ? 0 : Math.round((512 / 2560) * frame.screenW);

  return (
    <div className="pointer-events-none fixed inset-0">
      {/* The lens's pulse, while the feature is young: what the last frame
          held and what the parser made of it. Bottom-right, out of the way of
          both the listing and the tracker's own panels. */}
      {frame !== null && frame.open && (
        <div
          className="absolute rounded px-2 py-0.5 text-[11px] tabular-nums"
          style={{ right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.75)', color: '#9ca3af' }}
        >
          {tf('lens: {0} lines, {1} rows', frame.lines.length, badges.length)}
        </div>
      )}
      {badges.map((badge) => (
        <div
          key={badge.key}
          className="absolute flex items-center justify-end"
          style={{ top: badge.y, height: badge.h, left: 0, width: badgeRight }}
          title={badge.name}
        >
          <span
            className="rounded-md px-2 py-1 text-sm font-bold tabular-nums"
            style={{
              backgroundColor: COLORS[badge.verdict].bg,
              color: COLORS[badge.verdict].text,
              border: `2px solid ${COLORS[badge.verdict].border}`,
            }}
          >
            {badge.verdict === 'salvage' &&
              (badge.essMythic
                ? tf('salvage {0}+ myth ess +{1}%', badge.essMin ?? 0, badge.deltaPct)
                : tf('salvage {0}+ leg ess +{1}%', badge.essMin ?? 0, badge.deltaPct))}
            {badge.verdict === 'buy' && tf('{0}% — take it', badge.deltaPct)}
            {badge.verdict === 'fair' && tf('{0}% — fair', badge.deltaPct)}
            {badge.verdict === 'skip' && tf('+{0}% — pass', badge.deltaPct)}
            {badge.verdict === 'learn' && tf('learning {0}/3', badge.deltaPct)}
            {badge.verdict === 'range' && tf('market {0}–{1}', badge.rangeLo ?? '', badge.rangeHi ?? '')}
          </span>
        </div>
      ))}
    </div>
  );
}
