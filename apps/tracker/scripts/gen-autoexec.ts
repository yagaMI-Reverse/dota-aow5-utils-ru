/**
 * Bakes `assets/autoexec.cfg` into a module the main process can write out.
 *
 * The file is a shipped asset rather than a string in the source because it is
 * the same text the site publishes and the player may already have on disk —
 * one copy, in a file, diffable against what is in the cfg folder. It becomes
 * a module because reading it at runtime would mean knowing where it landed in
 * a packaged build, and `extraResources` is a second thing to get wrong for no
 * gain on a 6 KB file.
 *
 * Run after editing the cfg:  node scripts/gen-autoexec.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, '..', 'assets', 'autoexec.cfg');
const target = path.join(here, '..', 'electron', 'autoexec.data.ts');

const text = fs.readFileSync(source, 'utf8');

// A template literal, so the file reads as itself in the generated module.
// Only the two sequences that would end it early need escaping.
const literal = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const out = `/**
 * Generated from assets/autoexec.cfg by scripts/gen-autoexec.ts. Do not edit.
 *
 * Channel names move between Dota patches. A line naming a channel that no
 * longer exists simply fails at exec and that channel keeps logging — nothing
 * else breaks — so a stale copy degrades into a bigger log rather than a
 * broken client.
 */
export const AUTOEXEC_CFG = \`${literal}\`;

/** Marks a cfg as ours, so setup can tell it from one the player wrote. */
export const AUTOEXEC_MARK = 'AOW5 farm tracker';
`;

fs.writeFileSync(target, out, 'utf8');
console.log(`wrote ${path.relative(process.cwd(), target)} — ${out.length} bytes from ${text.length}`);
