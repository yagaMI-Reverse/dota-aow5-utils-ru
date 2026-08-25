import { useCallback, useEffect, useState } from 'react';
import { Check, CircleAlert, CircleHelp, Wrench, X } from 'lucide-react';
import type { CheckState, SetupStatus, SetupStepResult } from '@core/ipc.ts';
import { t, tf } from '@core/i18n.ts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The setup that used to be a page of instructions.
 *
 * Four things have to be true before a single number appears, and three of
 * them are done outside this app: a cfg in Dota's folder, a file on disk, and
 * a launch option in Steam. Every one of them fails silently — the overlay
 * shows zeros either way — so the panel that can check them is the panel that
 * should, rather than leaving the player to diff their setup against a web
 * page while wondering which step they got wrong.
 *
 * It reports before it offers to act. A row that is already right says so and
 * the button skips it, because the common case after the first run is that
 * nothing needs doing and the useful answer is "yes, still fine".
 *
 * The launch option is the one that cannot be done quietly. Steam keeps
 * `localconfig.vdf` in memory and writes it out when it exits, so an edit made
 * while it is running vanishes on the next quit — which would look like this
 * panel lying. So it is refused while Steam is up, and the row says why.
 */
export function SetupSection() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [results, setResults] = useState<SetupStepResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await window.tracker.getSetup();
    setStatus(next);
    // Follow Steam's signed-in account unless the player picked another.
    setAccount((prev) => prev ?? next.accounts.find((a) => a.active)?.id ?? next.accounts[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(async () => {
    if (account === null) return;
    setBusy(true);
    try {
      setResults(await window.tracker.applySetup(account));
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [account, refresh]);

  if (status === null) return <p className="text-[0.625rem] text-muted-foreground">{t('Checking…')}</p>;

  const chosen = status.accounts.find((a) => a.id === account) ?? null;
  const launch = status.steamRunning ? 'unknown' : (chosen?.logFlag ?? 'unknown');
  const done =
    status.autoexec === 'ok' && status.logExists && chosen?.logFlag === 'ok' && chosen.display !== 'fullscreen';

  return (
    <div className="space-y-1.5">
      <Row
        state={status.steamPath ? 'ok' : 'missing'}
        label={t('Steam')}
        value={status.steamPath ?? t('Not found')}
      />
      <Row
        state={status.dotaPath ? 'ok' : 'missing'}
        label={t('Dota 2')}
        value={status.dotaPath ?? t('Not found')}
      />
      <Row
        state={status.autoexec}
        label={t('Console tuning')}
        value={
          status.autoexec === 'ok'
            ? t('autoexec.cfg is in place')
            : status.autoexec === 'different'
              ? t('another autoexec.cfg is there — it will be backed up')
              : t('autoexec.cfg is missing')
        }
      />
      <Row
        state={status.logExists ? 'ok' : 'missing'}
        label={t('Log file')}
        value={status.logFile}
      />
      <Row
        state={launch}
        label={t('Launch option')}
        value={
          status.steamRunning
            ? t('Steam is open — close it to check and set this')
            : chosen?.logFlag === 'ok'
              ? t('-con_logfile points at the file')
              : t('-con_logfile is not set')
        }
      />
      {chosen !== null && chosen.display !== 'unknown' && (
        <Row
          state={chosen.display === 'fullscreen' ? 'different' : 'ok'}
          label={t('Display mode')}
          value={
            chosen.display === 'fullscreen'
              ? t('Exclusive fullscreen hides every overlay — switch Dota to windowed or borderless')
              : chosen.display === 'borderless'
                ? t('Borderless window')
                : t('Windowed')
          }
        />
      )}

      {/* Only worth a chooser when there is a choice. The launch option is per
          account, and writing it for the wrong one does nothing visible. */}
      {status.accounts.length > 1 && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="shrink-0 text-[0.625rem] text-muted-foreground">{t('Steam account')}</span>
          <select
            value={account ?? ''}
            onChange={(e) => setAccount(e.target.value)}
            className="min-w-0 flex-1 rounded-md bg-black/25 px-1.5 py-1 text-[0.625rem] text-foreground"
          >
            {status.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.active ? tf('{0} — signed in', a.id) : a.id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        <Button variant="outline" className="h-7 shrink-0 text-xs" onClick={() => void run()} disabled={busy}>
          <Wrench className="size-3.5" />
          {busy ? t('Working…') : t('Set it all up')}
        </Button>
        {done && <span className="text-[0.625rem] text-muted-foreground">{t('Everything is ready.')}</span>}
      </div>

      {results !== null && (
        <ul className="space-y-0.5 pt-0.5">
          {results.map((r) => (
            <li key={r.step} className="text-[0.625rem] text-muted-foreground">
              {stepLine(r)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One check: an icon that carries the state, and the sentence beside it. */
function Row({ state, label, value }: { state: CheckState; label: string; value: string }) {
  const Icon = state === 'ok' ? Check : state === 'missing' ? X : state === 'different' ? CircleAlert : CircleHelp;
  return (
    <div className="flex items-start gap-1.5">
      {/* The icon says the state as well as the colour does: a red dot and a
          green one are the same dot to a good number of players. */}
      <Icon
        className={cn(
          'mt-px size-3.5 shrink-0',
          state === 'ok' ? 'text-primary' : state === 'missing' ? 'text-destructive' : 'text-muted-foreground',
        )}
      />
      <span className="w-24 shrink-0 text-[0.625rem] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-[0.625rem] break-words text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

/** What one step did, in a sentence rather than a status code. */
function stepLine(r: SetupStepResult): string {
  const name =
    r.step === 'autoexec' ? t('Console tuning') : r.step === 'logfile' ? t('Log file') : t('Launch option');

  if (r.state === 'done') return tf('{0}: done', name);
  if (r.state === 'already') return tf('{0}: already fine', name);
  if (r.state === 'failed') return tf('{0}: failed ({1})', name, r.note ?? '');

  const why =
    r.note === 'steam-running'
      ? t('close Steam first')
      : r.note === 'no-dota'
        ? t('Dota was not found')
        : r.note === 'no-steam'
          ? t('Steam was not found')
          : r.note === 'no-dota-entry'
            ? t('Steam has no Dota entry for this account yet')
            : (r.note ?? '');
  return tf('{0}: skipped — {1}', name, why);
}
