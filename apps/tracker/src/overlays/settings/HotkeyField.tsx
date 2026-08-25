import { useCallback, useEffect, useState } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import { t } from '@core/i18n.ts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Rebinds the key that lets the mouse reach the overlay.
 *
 * This one setting had no control at all, which is worse than it sounds: the
 * overlay ignores the mouse by design — that is what makes it an overlay
 * rather than a window in the way — and this key is the only thing that hands
 * the mouse back. If the combination is taken by something else (and Ctrl+Alt
 * plus a letter is popular with capture software, launchers and IME switchers)
 * the panel becomes permanently unclickable, with the fix living behind the
 * key that does not work.
 *
 * Captured by pressing rather than typed, because an Electron accelerator is a
 * string with a spelling — `Control`, not `Ctrl`; `Super`, not `Win` — and a
 * field that accepts prose would mostly collect combinations that silently
 * fail to register.
 */

/** The default, offered as a way back when an experiment did not work out. */
const FALLBACK = 'Control+Alt+T';

/**
 * A DOM key event as Electron spells accelerators.
 *
 * Null while the pressed key is only a modifier: holding Ctrl is the start of
 * a combination, not one, and binding it would swallow the key globally.
 */
function accelerator(e: React.KeyboardEvent): string | null {
  const key = e.key;
  if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  // A bare letter would bind that letter everywhere in Windows, including
  // inside the game — so a modifier is required rather than merely advised.
  if (parts.length === 0) return null;

  if (/^[a-z]$/i.test(key)) parts.push(key.toUpperCase());
  else if (/^F\d{1,2}$/.test(key)) parts.push(key);
  else if (/^\d$/.test(key)) parts.push(key);
  else if (key === ' ') parts.push('Space');
  else if (key.length === 1) parts.push(key.toUpperCase());
  else return null;

  return parts.join('+');
}

export function HotkeyField({ hotkey }: { hotkey: string }) {
  const [listening, setListening] = useState(false);

  const save = useCallback((next: string) => {
    setListening(false);
    void window.tracker.setConfig({ hotkey: next });
  }, []);

  // Listening is a mode, and a mode the player can leave by clicking away.
  useEffect(() => {
    if (!listening) return;
    const off = () => setListening(false);
    window.addEventListener('blur', off);
    return () => window.removeEventListener('blur', off);
  }, [listening]);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[0.625rem] text-muted-foreground">{t('Click-through hotkey')}</span>
        <button
          type="button"
          onClick={() => setListening(true)}
          onKeyDown={(e) => {
            if (!listening) return;
            // Every press belongs to the capture while it is open, or Escape
            // would leave the settings window instead of cancelling.
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape') return setListening(false);
            const next = accelerator(e);
            if (next !== null) save(next);
          }}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[0.625rem]',
            listening ? 'bg-primary/20 text-foreground' : 'bg-black/25 text-foreground hover:bg-white/10',
          )}
        >
          <Keyboard className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate tabular-nums">
            {listening ? t('Press a combination…') : hotkey}
          </span>
        </button>
        {hotkey !== FALLBACK && !listening && (
          <Button
            variant="outline"
            className="h-7 shrink-0 px-2 text-xs"
            title={t('Back to the default')}
            onClick={() => save(FALLBACK)}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        )}
      </div>
      <p className="text-[0.625rem] text-muted-foreground">
        {listening
          ? t('Esc cancels. A modifier is required — Ctrl, Alt or Shift.')
          : t('The key that lets the mouse reach the panel. Held by the whole system, so another program can own it.')}
      </p>
    </div>
  );
}
