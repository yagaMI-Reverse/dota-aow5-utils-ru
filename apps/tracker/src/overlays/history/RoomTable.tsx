import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Skull } from 'lucide-react';
import type { SessionHistory } from '@core/history.ts';
import { roomProfit } from '@core/history-stats.ts';
import { t, tf } from '@core/i18n.ts';
import type { Pricing } from '@/features/items/prices';
import { roomTable } from '@/features/rooms/table';
import { clock, compact } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Which rooms pay for the time they take, across everything recorded.
 *
 * The panel over the game answers this for the room you are standing in and
 * for the evening so far. Neither is the question you actually want answered,
 * which is comparative and needs more than one evening to answer at all: is
 * this room worth running, against the others you could be running instead.
 *
 * Gold per minute rather than per run, because runs are not the same length —
 * and the total, which is the figure that looks most authoritative, mostly
 * measures which room you happen to have run most.
 *
 * Closed by default. It is a thing you consult when deciding where to farm,
 * not a thing you read every time you open the window to check last night.
 */
export function RoomTable({ sessions, pricing }: { sessions: SessionHistory[] | null; pricing: Pricing }) {
  const [open, setOpen] = useState(false);
  const rooms = useMemo(() => (sessions === null ? [] : roomProfit(sessions, pricing.value)), [sessions, pricing]);

  if (rooms.length === 0) return null;

  // The best row is the yardstick every other row is read against.
  const top = rooms[0]?.perMinute ?? 0;

  return (
    <section className="rounded-md bg-black/25">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-white/5"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-semibold">{t('Rooms by the minute')}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{tf('{0} rooms', rooms.length)}</span>
      </button>

      {open && (
        <div className="space-y-0.5 px-2 pb-2">
          <div className="flex items-center gap-1.5 text-[0.5625rem] tracking-wide text-muted-foreground uppercase">
            <span className="min-w-0 flex-1">{t('room')}</span>
            <span className="w-12 shrink-0 text-right">{t('g/min')}</span>
            <span className="w-10 shrink-0 text-right">{t('runs')}</span>
            <span className="w-12 shrink-0 text-right">{t('time')}</span>
          </div>

          {rooms.map((room) => (
            <div key={room.room} className="flex items-center gap-1.5 text-[0.625rem]">
              {/* The bar is the comparison the numbers make you do in your
                  head: every room against the best one, at a glance. */}
              <span className="relative min-w-0 flex-1 truncate" title={room.room}>
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 -z-10 rounded-sm bg-primary/15"
                  style={{ width: `${top > 0 ? Math.round((room.perMinute / top) * 100) : 0}%` }}
                />
                {roomTable.name(room.room)}
              </span>
              <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-foreground">
                {compact(Math.round(room.perMinute))}
              </span>
              <span className="flex w-10 shrink-0 items-center justify-end gap-0.5 tabular-nums text-muted-foreground">
                {/* Deaths ride with the run count rather than taking a column
                    of their own: they are a qualifier on it, and most rooms
                    have none to show. */}
                {room.deaths > 0 && (
                  <span
                    className="flex items-center text-destructive"
                    title={tf('{0} of these ended in a death', room.deaths)}
                  >
                    <Skull className="size-2.5" />
                    {room.deaths}
                  </span>
                )}
                <span className={cn(room.deaths > 0 && 'opacity-60')}>{room.runs}</span>
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{clock(room.time)}</span>
            </div>
          ))}

          <p className="pt-1 text-[0.5625rem] text-muted-foreground">
            {t('Priced at today’s prices, deaths included — they cost the time either way.')}
          </p>
        </div>
      )}
    </section>
  );
}
