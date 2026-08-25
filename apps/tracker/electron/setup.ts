/**
 * Finds Steam and Dota, and does the setup the player would otherwise do by
 * hand: the cfg that keeps the log small, the log file itself, and the launch
 * option without which Dota writes nothing at all.
 *
 * Everything here is Windows-only, which the app already is.
 *
 * The rule throughout is that nothing is overwritten blind. An `autoexec.cfg`
 * that someone else wrote is backed up before ours lands on it; launch options
 * already set are kept and only added to; `localconfig.vdf` is edited as text
 * rather than parsed and re-serialised, because a round trip through a
 * hand-written KeyValues parser is a good way to hand Steam back a file it
 * quietly discards along with everything else the player had configured.
 *
 * The one step that cannot be silent is the launch option. Steam holds
 * `localconfig.vdf` in memory and rewrites it on exit, so an edit made while
 * it runs is reverted the moment the player quits Steam. That is not a thing
 * to do behind their back and call done, so it is refused while Steam is up
 * and the UI says why.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { CheckState, DisplayMode, SetupStatus, SetupStepResult, SteamAccount } from '../core/ipc.ts';
import { AUTOEXEC_CFG, AUTOEXEC_MARK } from './autoexec.data.ts';

/** Dota 2. The number is the whole reason `libraryfolders.vdf` is read. */
const DOTA_APP_ID = '570';

/**
 * Where the log goes when the player has not said otherwise.
 *
 * `C:\Users\Public` because it spells the same on every Windows, needs no
 * elevation, and — the reason it matters — contains no Cyrillic. Dota writes
 * nothing at all to a path outside its codepage and reports no error doing it,
 * which looks exactly like a broken tracker; a Russian account name puts the
 * profile folder squarely in that trap.
 */
export const DEFAULT_LOG_FILE = 'C:\\Users\\Public\\aow5-console.log';

/** One registry value, or null. Never throws: absence is an answer. */
function regRead(key: string, value: string): string | null {
  try {
    const out = execFileSync('reg', ['query', key, '/v', value], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    // "    SteamPath    REG_SZ    c:/program files (x86)/steam"
    const m = out.match(new RegExp(`\\s${value}\\s+REG_\\w+\\s+(.+)`, 'i'));
    return m?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

/** Steam's own idea of where it is, falling back to the usual places. */
export function findSteam(): string | null {
  const fromRegistry =
    regRead('HKCU\\Software\\Valve\\Steam', 'SteamPath') ??
    regRead('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath') ??
    regRead('HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath');

  const candidates = [
    fromRegistry,
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Steam') : null,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Steam') : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    // The registry writes it lowercase with forward slashes; Windows does not
    // care but everything downstream reads better normalised.
    const normalised = path.win32.normalize(candidate.replace(/\//g, '\\'));
    if (fs.existsSync(path.join(normalised, 'steamapps'))) return normalised;
  }
  return null;
}

/**
 * The account Steam has signed in, as a `userdata` folder name.
 *
 * Stored as a DWORD and zero when nobody is signed in — which is also what it
 * reads while Steam is closed, so this identifies the active account rather
 * than proving one exists.
 */
function activeAccountId(): string | null {
  const raw = regRead('HKCU\\Software\\Valve\\Steam\\ActiveProcess', 'ActiveUser');
  if (!raw) return null;
  const id = Number.parseInt(raw, raw.toLowerCase().startsWith('0x') ? 16 : 10);
  return Number.isFinite(id) && id > 0 ? String(id) : null;
}

/** Whether Steam is up. It rewrites `localconfig.vdf` on the way out. */
export function steamRunning(): boolean {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    return /steam\.exe/i.test(out);
  } catch {
    // Better to claim it is running than to edit a file out from under it.
    return true;
  }
}

/**
 * The Dota folder, via the library that admits to holding app 570.
 *
 * Enough of KeyValues to walk one file: `libraryfolders.vdf` is a list of
 * blocks, each with a `path` and an `apps` block whose keys are app ids. The
 * install can be on any drive, so guessing the default library is wrong on
 * exactly the machines where guessing is least welcome.
 */
export function findDota(steamPath: string): string | null {
  const libraries: string[] = [steamPath];

  try {
    const vdf = fs.readFileSync(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    // Each library block, from its "path" to the end of its "apps" list.
    for (const block of vdf.split(/"\d+"\s*\{/).slice(1)) {
      const at = block.match(/"path"\s+"([^"]+)"/);
      if (!at?.[1]) continue;
      const folder = at[1].replace(/\\\\/g, '\\');
      // Only the library that lists Dota; a library may hold none of it.
      if (new RegExp(`"${DOTA_APP_ID}"\\s+"`).test(block)) libraries.unshift(folder);
      else libraries.push(folder);
    }
  } catch {
    // No library file: the default install is still worth a look.
  }

  for (const library of libraries) {
    const dota = path.join(library, 'steamapps', 'common', 'dota 2 beta');
    if (fs.existsSync(path.join(dota, 'game', 'dota'))) return dota;
  }
  return null;
}

/** The `dota\cfg\autoexec.cfg` this all hangs on. */
function autoexecPath(dotaPath: string): string {
  return path.join(dotaPath, 'game', 'dota', 'cfg', 'autoexec.cfg');
}

/** Ours, someone else's, or absent. */
function checkAutoexec(dotaPath: string | null): CheckState {
  if (!dotaPath) return 'unknown';
  const file = autoexecPath(dotaPath);
  if (!fs.existsSync(file)) return 'missing';
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(AUTOEXEC_MARK)) return 'different';
    // Ours, but from an older build — the channel list grows between patches.
    return text.includes('log_flags PanoramaScript -consoleonly') ? 'ok' : 'different';
  } catch {
    return 'unknown';
  }
}

/** VDF escapes backslashes and quotes; paths are mostly backslashes. */
const vdfEscape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const vdfUnescape = (s: string): string => s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

/** Any `-con_logfile <path>`, quoted or bare, so it can be replaced not doubled. */
const CON_LOGFILE = /-con_logfile\s+(?:"[^"]*"|\S+)/gi;

/**
 * Locates a `"<key>" { ... }` block and returns its span, braces included.
 *
 * Depth-counted rather than matched by regex, because the file nests and the
 * first closing brace after a key is very rarely the right one.
 */
function blockSpan(text: string, key: string, from = 0): { start: number; open: number; end: number } | null {
  // Case-insensitively: Steam writes `"Apps"` here and `"apps"` in
  // `libraryfolders.vdf`, and a reader that only knows one of those silently
  // reports the player has no launch options rather than failing loudly.
  const probe = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i');
  const found = text.slice(from).search(probe);
  if (found < 0) return null;
  const at = from + found;
  const open = text.indexOf('{', at);
  if (open < 0) return null;

  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { start: at, open, end: i };
    }
  }
  return null;
}

/** Dota's block inside one account's `localconfig.vdf`, if Steam wrote one. */
function dotaBlock(text: string): { start: number; open: number; end: number } | null {
  // "apps" appears under Software/Valve/Steam; the app id alone is ambiguous
  // (it is also a key in other lists), so descend rather than search.
  const apps = blockSpan(text, 'apps');
  if (!apps) return null;
  const dota = blockSpan(text.slice(apps.open, apps.end), DOTA_APP_ID);
  if (!dota) return null;
  return { start: dota.start + apps.open, open: dota.open + apps.open, end: dota.end + apps.open };
}

/** Launch options as Steam has them, unescaped, or null when there are none. */
function readLaunchOptions(localconfig: string): string | null {
  try {
    const text = fs.readFileSync(localconfig, 'utf8');
    const block = dotaBlock(text);
    if (!block) return null;
    const m = text.slice(block.open, block.end).match(/"LaunchOptions"\s+"([^"]*)"/);
    return m ? vdfUnescape(m[1] ?? '') : null;
  } catch {
    return null;
  }
}

/** From `video.txt`: the one mode that hides an always-on-top window. */
function readDisplay(videoTxt: string): DisplayMode {
  try {
    const text = fs.readFileSync(videoTxt, 'utf8');
    const full = text.match(/"setting\.fullscreen"\s+"(\d+)"/)?.[1];
    const borderless = text.match(/"setting\.nowindowborder"\s+"(\d+)"/)?.[1];
    if (full === undefined) return 'unknown';
    if (full === '1') return 'fullscreen';
    return borderless === '1' ? 'borderless' : 'windowed';
  } catch {
    return 'unknown';
  }
}

/** Every account with a `userdata` folder, newest-looking first is not a thing. */
function listAccounts(steamPath: string, logFile: string): SteamAccount[] {
  const root = path.join(steamPath, 'userdata');
  const active = activeAccountId();
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return [];
  }

  const accounts: SteamAccount[] = [];
  for (const id of entries) {
    if (!/^\d+$/.test(id) || id === '0') continue;
    const localconfig = path.join(root, id, 'config', 'localconfig.vdf');
    if (!fs.existsSync(localconfig)) continue;

    const options = readLaunchOptions(localconfig);
    const wanted = options?.match(CON_LOGFILE)?.[0] ?? null;
    const points = wanted !== null && wanted.replace(/"/g, '').toLowerCase().includes(logFile.toLowerCase());

    accounts.push({
      id,
      active: id === active,
      launchOptions: options,
      logFlag: options === null ? 'missing' : points ? 'ok' : wanted ? 'different' : 'missing',
      display: readDisplay(path.join(root, id, DOTA_APP_ID, 'local', 'cfg', 'video.txt')),
    });
  }
  // The signed-in account first: it is the one the player means.
  return accounts.sort((a, b) => Number(b.active) - Number(a.active));
}

/**
 * The log Dota is actually being told to write, per Steam's own launch options.
 *
 * The tracker ships pointing at the path the instructions tell people to make,
 * which is right for anyone who followed them and wrong for everyone who put
 * the file somewhere else — and being wrong here is invisible: the overlay
 * reads a file nothing writes to and shows zeros, which is indistinguishable
 * from a game that is not reporting. Steam already knows the answer, so ask it
 * rather than the player.
 *
 * The signed-in account first, since `listAccounts` sorts it there.
 */
export function logFileFromLaunchOptions(): string | null {
  const steamPath = findSteam();
  if (!steamPath) return null;

  for (const account of listAccounts(steamPath, '')) {
    const found = account.launchOptions?.match(/-con_logfile\s+(?:"([^"]*)"|(\S+))/i);
    const file = (found?.[1] ?? found?.[2] ?? '').trim();
    if (file !== '') return file;
  }
  return null;
}

/** The whole picture, read-only. */
export function readSetup(logFile: string): SetupStatus {
  const steamPath = findSteam();
  const dotaPath = steamPath ? findDota(steamPath) : null;
  return {
    steamPath,
    dotaPath,
    steamRunning: steamRunning(),
    logFile,
    accounts: steamPath ? listAccounts(steamPath, logFile) : [],
    autoexec: checkAutoexec(dotaPath),
    logExists: fs.existsSync(logFile),
  };
}

/** Writes our cfg, standing aside for one we did not write. */
function applyAutoexec(dotaPath: string | null): SetupStepResult {
  if (!dotaPath) return { step: 'autoexec', state: 'skipped', note: 'no-dota' };
  const file = autoexecPath(dotaPath);
  const state = checkAutoexec(dotaPath);
  if (state === 'ok') return { step: 'autoexec', state: 'already' };

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Someone else's config is not ours to replace without a copy of it.
    if (state === 'different' && !fs.readFileSync(file, 'utf8').includes(AUTOEXEC_MARK)) {
      fs.copyFileSync(file, `${file}.bak`);
    }
    fs.writeFileSync(file, AUTOEXEC_CFG, 'utf8');
    return { step: 'autoexec', state: 'done' };
  } catch (error) {
    return { step: 'autoexec', state: 'failed', note: String((error as NodeJS.ErrnoException).code ?? error) };
  }
}

/** Creates the log if it is not there. Never truncates one that is. */
function applyLogFile(logFile: string): SetupStepResult {
  try {
    if (fs.existsSync(logFile)) return { step: 'logfile', state: 'already' };
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(logFile, '', { flag: 'wx' });
    return { step: 'logfile', state: 'done' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Someone won the race; the file existing is the outcome we wanted.
    if (code === 'EEXIST') return { step: 'logfile', state: 'already' };
    return { step: 'logfile', state: 'failed', note: String(code ?? error) };
  }
}

/**
 * Adds `-con_logfile` to one account's launch options, keeping the rest.
 *
 * The file is edited as text and written back whole: only the one line moves,
 * and everything Steam keeps in there — and it keeps a great deal — is
 * byte-for-byte what it was. A copy goes to `.bak` first regardless.
 */
function applyLaunchOption(steamPath: string, accountId: string, logFile: string): SetupStepResult {
  if (steamRunning()) return { step: 'launch', state: 'skipped', note: 'steam-running' };

  const localconfig = path.join(steamPath, 'userdata', accountId, 'config', 'localconfig.vdf');
  try {
    const text = fs.readFileSync(localconfig, 'utf8');
    const block = dotaBlock(text);
    if (!block) return { step: 'launch', state: 'skipped', note: 'no-dota-entry' };

    const body = text.slice(block.open, block.end);
    const line = body.match(/([ \t]*)"LaunchOptions"\s+"([^"]*)"/);

    const existing = line ? vdfUnescape(line[2] ?? '') : '';
    // Drop any -con_logfile already there rather than ending up with two.
    const kept = existing.replace(CON_LOGFILE, '').replace(/\s+/g, ' ').trim();
    const wanted = `${kept} -con_logfile ${logFile}`.trim();
    if (existing.trim() === wanted) return { step: 'launch', state: 'already' };

    const written = `"LaunchOptions"\t\t"${vdfEscape(wanted)}"`;
    let next: string;
    if (line) {
      next = text.slice(0, block.open) + body.replace(line[0], `${line[1] ?? ''}${written}`) + text.slice(block.end);
    } else {
      // No entry yet: put one just inside the app's opening brace, indented
      // one level past whatever the file already uses there.
      const indent = body.match(/\n([ \t]+)"/)?.[1] ?? '\t\t\t\t\t\t';
      next = `${text.slice(0, block.open + 1)}\n${indent}${written}${text.slice(block.open + 1)}`;
    }

    fs.copyFileSync(localconfig, `${localconfig}.bak`);
    fs.writeFileSync(localconfig, next, 'utf8');
    return { step: 'launch', state: 'done' };
  } catch (error) {
    return { step: 'launch', state: 'failed', note: String((error as NodeJS.ErrnoException).code ?? error) };
  }
}

/** Every step, each answering for itself. */
export function applySetup(accountId: string, logFile: string): SetupStepResult[] {
  const steamPath = findSteam();
  const dotaPath = steamPath ? findDota(steamPath) : null;

  return [
    applyAutoexec(dotaPath),
    applyLogFile(logFile),
    steamPath
      ? applyLaunchOption(steamPath, accountId, logFile)
      : { step: 'launch' as const, state: 'skipped' as const, note: 'no-steam' },
  ];
}
