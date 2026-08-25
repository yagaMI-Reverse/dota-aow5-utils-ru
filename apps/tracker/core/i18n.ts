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
export type Language = 'ru' | 'en';

export const LANGUAGES: Language[] = ['ru', 'en'];

/** What each language calls itself, which is the only sane thing to list. */
export const LANGUAGE_NAMES: Record<Language, string> = { ru: 'Русский', en: 'English' };

const DICTIONARIES: Record<Language, Record<string, string>> = { ru, en: {} };

let active: Record<string, string> = ru;
let current: Language = 'ru';

/**
 * Switch languages.
 *
 * Both processes call it — main for its menus and dialogs, each renderer for
 * its own window — because a module-level dictionary is per-process and there
 * is no shared memory between them. Config is what keeps them agreeing.
 */
export function setLanguage(language: Language): void {
  current = DICTIONARIES[language] ? language : 'en';
  active = DICTIONARIES[current] ?? {};
}

export function getLanguage(): Language {
  return current;
}

/** Anything that is not a language we ship reads as English. */
export function readLanguage(value: unknown): Language {
  return value === 'ru' || value === 'en' ? value : 'ru';
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
