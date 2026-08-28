import { ru } from './locale.ru.ts';

/**
 * Translation by English source string, not by invented key.
 *
 * The fork tracks upstream, and upstream writes its UI in English literals.
 * Keying the dictionary on those literals means a merge that changes a string
 * shows up as one untranslated English label rather than as a missing key or a
 * crash — the app degrades to the original wording, which is the behaviour you
 * want from a translation layer you are not paid to maintain.
 *
 * It also makes English free. There is no `locale.en`: English *is* the keys,
 * so that language is an empty dictionary and every lookup falls through to
 * the string the developer wrote. A language that cannot drift from the source
 * is a language that cannot be half-translated.
 */
import type { Locale } from './locale.ts';

/**
 * This layer serves what upstream's catalog system does not cover: the main
 * process (tray, dialogs, setup notes) and the fork's own features (the
 * Exchange lens, the setup section, the market ledger). Renderer chrome is
 * upstream's `useMessages()` — this dictionary is the fork's, keyed by its
 * English source strings.
 */
const DICTIONARIES: Partial<Record<Locale, Record<string, string>>> = { ru };

let active: Record<string, string> = ru;
let current: Locale = 'ru';

/**
 * Switch languages. Locales without a fork dictionary — Chinese today — fall
 * through to the English source strings, which is the contract everywhere.
 */
export function setLanguage(language: Locale): void {
  current = language;
  active = DICTIONARIES[language] ?? {};
}

export function getLanguage(): Locale {
  return current;
}

/** The string, translated if we have it, else the English it was written in. */
export function t(s: string): string {
  return active[s] ?? s;
}

/**
 * The same, for the strings that carry a value: `{0}`, `{1}` in the Russian
 * stand for the arguments, in whatever order Russian word order wants them —
 * which is the reason the placeholders are numbered rather than positional.
 */
export function tf(s: string, ...args: Array<string | number>): string {
  return (active[s] ?? s).replace(/\{(\d+)\}/g, (whole, i) => {
    const v = args[Number(i)];
    return v === undefined ? whole : String(v);
  });
}
