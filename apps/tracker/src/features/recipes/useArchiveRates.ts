import { useEffect, useState } from 'react';
import { archiveRates, type ArchiveRates } from '@core/history-stats.ts';

/**
 * How fast things have actually been dropping, for the panel that wants to
 * turn "you still need four" into "about two hours".
 *
 * Read once when the overlay mounts, not kept live. The archive only gains a
 * record when a run *finishes*, so it moves a handful of times an hour, and an
 * estimate that twitched mid-room would be worse than one that is a few
 * minutes stale — this is a figure you glance at to decide whether to keep
 * going, not a clock.
 *
 * Null while it loads, and null is a real answer here: a fresh install has no
 * archive, so there is nothing to extrapolate from and the panel says nothing
 * rather than guessing.
 */
export function useArchiveRates(): ArchiveRates | null {
  const [rates, setRates] = useState<ArchiveRates | null>(null);

  useEffect(() => {
    let live = true;
    void window.tracker.getHistory().then((sessions) => {
      if (live) setRates(archiveRates(sessions));
    });
    return () => {
      live = false;
    };
  }, []);

  return rates;
}
