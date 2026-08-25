/**
 * What a piece of gear is worth taken apart, which the Exchange never says.
 *
 * The rules are the community's, confirmed across players who live off them:
 * a legendary disassembles into legendary essence equal to its item level, a
 * neutral legendary into half that, a mythic into mythic essence at half its
 * level rounded down. Essence itself trades on the Exchange all day — which
 * is the whole trick: gear listed below its own salvage is free money, and
 * pages of it appear whenever someone prices a piece as a piece rather than
 * as the essence inside it.
 *
 * The data cannot tell a neutral legendary from a regular one, so the yield
 * is a range: `min` assumes neutral (half), `max` assumes regular. A verdict
 * built on `min` can only understate the profit — the one direction a wrong
 * guess is allowed to point when it is spending the player's gold.
 */

/** Quality tiers as the item table numbers them. */
export const QUALITY_LEGENDARY = 5;
export const QUALITY_MYTHIC = 6;

/** The two essences salvage pays in. */
export const LEGENDARY_ESSENCE_ID = 'item_M315';
export const MYTHIC_ESSENCE_ID = 'item_M507';

/**
 * The guild contract — the players' "конверт".
 *
 * Listing anything valuable on the Exchange consumes these on top of the gold
 * fee, so a salvage plan that ends in "sell the essence" ends in spending a
 * contract. Its table cost is 20; it trades around nine thousand. The table
 * is not wrong about anything else by a factor of 450, which is why the
 * contract price must come from watching the market, never from the table.
 */
export const GUILD_CONTRACT_ID = 'item_M408';

/** What a contract fetches when the lens has not seen one listed yet. */
export const CONTRACT_FALLBACK_PRICE = 9000;

/** Table prices, the floor the market rarely dips under for long. */
export const ESSENCE_TABLE_COST: Record<string, number> = {
  [LEGENDARY_ESSENCE_ID]: 8000,
  [MYTHIC_ESSENCE_ID]: 20000,
};

export interface SalvageYield {
  /** Which essence comes out. */
  essenceId: string;
  /** Assuming the worst case the data cannot rule out (neutral legendary). */
  min: number;
  /** Assuming a regular piece. Equal to `min` for mythics. */
  max: number;
}

/**
 * Essence out of one piece, or null for anything that does not salvage.
 *
 * Only equipment comes apart. Essence itself, chests, reagents — everything
 * the table types as something other than `equip` — shares the legendary and
 * mythic quality tiers, and a rule that only looked at quality was advising
 * players to disassemble mythic essence into mythic essence.
 *
 * Level 0 and 1 pieces yield nothing under the half rule and next to nothing
 * under the full one; null keeps them out of verdicts rather than promising a
 * profit of half an essence.
 */
export function salvageYield(quality: number, level: number, type: string): SalvageYield | null {
  if (type !== 'equip') return null;
  if (!Number.isFinite(level) || level < 2) return null;
  if (quality === QUALITY_LEGENDARY) {
    return { essenceId: LEGENDARY_ESSENCE_ID, min: Math.floor(level / 2), max: level };
  }
  if (quality === QUALITY_MYTHIC) {
    const half = Math.floor(level / 2);
    return half > 0 ? { essenceId: MYTHIC_ESSENCE_ID, min: half, max: half } : null;
  }
  return null;
}

/**
 * The Exchange's gold cut, measured off a real sell dialog: 4 995 on a
 * 99 888 listing — five percent, rounded up.
 */
export const EXCHANGE_GOLD_FEE = 0.05;

/**
 * The listing price under which buying-to-salvage is profit even if every
 * conservative assumption lands: neutral yield, and the five-percent gold fee
 * on the way back out.
 *
 * No guild contracts in this sum, and that is a measured fact, not an
 * assumption: contracts are charged for listing *gear*, and essence lists
 * without them — confirmed at the sell dialog by the player. It is the whole
 * reason the salvage trade works at all: the piece you buy pays its seller's
 * contracts, and what you sell back is contract-free material.
 */
export function salvageFloor(
  quality: number,
  level: number,
  type: string,
  essencePrice: (id: string) => number,
): number | null {
  const y = salvageYield(quality, level, type);
  if (y === null) return null;
  const gross = y.min * essencePrice(y.essenceId);
  const net = Math.floor(gross * (1 - EXCHANGE_GOLD_FEE));
  return net > 0 ? net : null;
}
