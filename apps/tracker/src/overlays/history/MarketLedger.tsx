import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { getLanguage, t } from '@core/i18n.ts';
import { LEGENDARY_ESSENCE_ID, MYTHIC_ESSENCE_ID } from '@core/salvage.ts';
import ruNames from 'aow5-shared/public/data/locale.ru.names.json';
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
  median: number;
  n: number;
  lo: number;
  hi: number;
  essence: boolean;
}

function readRows(itemTable: ReturnType<typeof useItems>): Row[] {
  let raw: Record<string, { g: number; t: number }[]>;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEDGER_KEY) ?? '{}');
    raw = typeof parsed === 'object' && parsed !== null ? (parsed as typeof raw) : {};
  } catch {
    return [];
  }

  const russian = getLanguage() === 'ru';
  const localized = (ruNames as { names?: Record<string, string> }).names ?? {};
  const now = Date.now();
  const rows: Row[] = [];
  for (const [id, obs] of Object.entries(raw)) {
    const golds = obs
      .filter((o) => now - o.t < LEDGER_TTL_MS)
      .map((o) => o.g)
      .sort((a, b) => a - b);
    if (golds.length === 0) continue;
    const mid = Math.floor(golds.length / 2);
    rows.push({
      id,
      name: (russian ? localized[id] : undefined) ?? itemTable.get(id).name,
      median: golds.length % 2 === 1 ? golds[mid]! : Math.round((golds[mid - 1]! + golds[mid]!) / 2),
      n: golds.length,
      lo: golds[0]!,
      hi: golds[golds.length - 1]!,
      essence: id === LEGENDARY_ESSENCE_ID || id === MYTHIC_ESSENCE_ID,
    });
  }
  // Essences first — they anchor every salvage verdict — then by price.
  return rows.sort((a, b) => Number(b.essence) - Number(a.essence) || b.median - a.median);
}

export function MarketLedger() {
  const itemTable = useItems();
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const rows = useMemo(() => readRows(itemTable), [generation, open, itemTable]);

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
          <div className="flex items-center gap-1.5 text-[0.5625rem] tracking-wide text-muted-foreground uppercase">
            <span className="min-w-0 flex-1">{t('item')}</span>
            <span className="w-14 shrink-0 text-right">{t('median')}</span>
            <span className="w-7 shrink-0 text-right">{t('seen')}</span>
            <span className="w-20 shrink-0 text-right">{t('range')}</span>
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
                {compact(row.median)}
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
                {compact(row.lo)}–{compact(row.hi)}
              </span>
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
