import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useOverlay } from '@/shell/useOverlay';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { t } from '@core/i18n.ts';
import { LEGENDARY_ESSENCE_ID, MYTHIC_ESSENCE_ID } from '@core/salvage.ts';
import { useItems } from '@/features/items/table';
import { compact } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The market ledger, readable: what the lens has learned things trade for.
 *
 * The lens writes this while the Exchange is open; this is the only place it
 * can be read outside a badge. It answers the question the badges cannot —
 * "what is worth hunting" — because a hunt starts from the list, not from
 * whichever page happens to be on screen.
 *
 * Same localStorage, different window: every overlay loads the same origin,
 * so the ledger written by the market lens is readable here as-is. Reads are
 * on demand (open the section, press refresh) rather than live — this is a
 * reference table, not a ticker.
 */

const LEDGER_KEY = 'aow5.market.ledger';
const LEDGER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Row {
  id: string;
  name: string;
  median: number | null;
  n: number;
  lo: number | null;
  hi: number | null;
  essence: boolean;
}

/** The ledger's numbers for one id, or blanks for an item it has not met. */
function ledgerStats(raw: Record<string, { g: number; t: number }[]>, id: string) {
  const now = Date.now();
  const golds = (raw[id] ?? [])
    .filter((o) => now - o.t < LEDGER_TTL_MS)
    .map((o) => o.g)
    .sort((a, b) => a - b);
  if (golds.length === 0) return { median: null, n: 0, lo: null, hi: null };
  const mid = Math.floor(golds.length / 2);
  return {
    median: golds.length % 2 === 1 ? golds[mid]! : Math.round((golds[mid - 1]! + golds[mid]!) / 2),
    n: golds.length,
    lo: golds[0]!,
    hi: golds[golds.length - 1]!,
  };
}

function loadLedgerRaw(): Record<string, { g: number; t: number }[]> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEDGER_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, { g: number; t: number }[]>)
      : {};
  } catch {
    return {};
  }
}

function readRows(itemTable: ReturnType<typeof useItems>, query: string): Row[] {
  const raw = loadLedgerRaw();

  // A query switches the list from "what the lens has learned" to "the whole
  // catalog": every matching item, learned or not, ready to be priced by hand.
  const q = query.trim();
  if (q !== '') {
    return itemTable.search(q, 30).map((item) => {
      const s = ledgerStats(raw, item.id);
      return {
        id: item.id,
        name: item.name,
        median: s.median,
        n: s.n,
        lo: s.lo,
        hi: s.hi,
        essence: item.id === LEGENDARY_ESSENCE_ID || item.id === MYTHIC_ESSENCE_ID,
      };
    });
  }

  const rows: Row[] = [];
  for (const id of Object.keys(raw)) {
    const s = ledgerStats(raw, id);
    if (s.n === 0) continue;
    rows.push({
      id,
      name: itemTable.get(id).name,
      ...s,
      essence: id === LEGENDARY_ESSENCE_ID || id === MYTHIC_ESSENCE_ID,
    });
  }
  // Essences first — they anchor every salvage verdict — then by price.
  return rows.sort((a, b) => Number(b.essence) - Number(a.essence) || (b.median ?? 0) - (a.median ?? 0));
}

export function MarketLedger() {
  const itemTable = useItems();
  const { config } = useOverlay();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [generation, setGeneration] = useState(0);
  const rows = useMemo(() => readRows(itemTable, query), [generation, open, itemTable, query]);

  const prices = config?.prices ?? {};
  const setPrice = (id: string, text: string) => {
    const next = { ...prices };
    const value = Number(text.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(value) || value <= 0) delete next[id];
    else next[id] = value;
    void window.tracker.setConfig({ prices: next });
  };

  if (!open && rows.length === 0) return null;

  return (
    <section className="rounded-md bg-black/25">
      <div className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-white/5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate font-semibold">{t('Market prices the lens has learned')}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{rows.length}</span>
        </button>
        {open && (
          <button
            type="button"
            onClick={() => setGeneration((g) => g + 1)}
            title={t('Refresh')}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-white/10"
          >
            <RefreshCw className="size-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-0.5 px-2 pb-2">
          {/* Empty shows what the lens learned; typing searches the whole
              catalog, so any item can be priced before it is ever seen. */}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search all items…')}
            className="h-6 text-[0.625rem]"
          />
          <div className="flex items-center gap-1.5 text-[0.5625rem] tracking-wide text-muted-foreground uppercase">
            <span className="min-w-0 flex-1">{t('item')}</span>
            <span className="w-14 shrink-0 text-right">{t('median')}</span>
            <span className="w-7 shrink-0 text-right">{t('seen')}</span>
            <span className="w-20 shrink-0 text-right">{t('range')}</span>
            <span className="w-16 shrink-0 text-right">{t('your price')}</span>
          </div>

          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5 text-[0.625rem]">
              <span
                className={cn('min-w-0 flex-1 truncate', row.essence && 'font-semibold text-primary')}
                title={row.id}
              >
                {row.name}
              </span>
              <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-gold">
                {row.median !== null ? compact(row.median) : '—'}
              </span>
              {/* One sighting is an asking price, not a market; it reads dim
                  until the median has something to stand on. */}
              <span
                className={cn(
                  'w-7 shrink-0 text-right tabular-nums',
                  row.n >= 3 ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {row.n}
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                {row.lo !== null && row.hi !== null ? `${compact(row.lo)}–${compact(row.hi)}` : '—'}
              </span>
              {/* The override feeds pricing.unit, so a number typed here moves
                  every verdict, card and salvage floor in the same broadcast. */}
              <Input
                key={`${row.id}:${prices[row.id] ?? ''}`}
                defaultValue={prices[row.id] !== undefined ? String(prices[row.id]) : ''}
                placeholder={row.median !== null ? compact(row.median) : '—'}
                onBlur={(e) => setPrice(row.id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className={cn(
                  'h-5 w-16 shrink-0 px-1 text-right text-[0.625rem] tabular-nums',
                  prices[row.id] !== undefined && 'text-primary',
                )}
              />
            </div>
          ))}

          <p className="pt-1 text-[0.5625rem] text-muted-foreground">
            {t('Filled in by the Exchange lens as you browse. A wide range is the trade: catch the low end, relist at the median.')}
          </p>
        </div>
      )}
    </section>
  );
}
