/**
 * A warm line to the Windows OCR engine.
 *
 * One PowerShell process for the app's lifetime, speaking the one-line
 * protocol described in `ocr-server.data.ts`. Requests are serialised — the
 * watcher only ever wants the newest frame anyway, so a queue deeper than one
 * would be latency spent recognising screens nobody is looking at.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { OCR_SERVER_PS1 } from './ocr-server.data.ts';

export interface OcrLine {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export class OcrService {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private waiter: ((lines: OcrLine[] | null) => void) | null = null;
  private scriptPath: string | null = null;

  /** Spawns the engine. Safe to call twice; the second is a no-op. */
  start(): void {
    if (this.child) return;

    this.scriptPath = path.join(os.tmpdir(), `aow5-ocr-${process.pid}.ps1`);
    fs.writeFileSync(this.scriptPath, OCR_SERVER_PS1, 'utf8');

    const child = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    this.child = child;

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let parsed: { ready?: boolean; lines?: OcrLine[]; error?: string; fatal?: string };
      try {
        parsed = JSON.parse(line);
      } catch {
        return; // stray output; the protocol says drop it
      }
      if (parsed.ready) {
        this.ready = true;
        return;
      }
      const waiter = this.waiter;
      this.waiter = null;
      // ConvertTo-Json collapses a one-element list to the element, so
      // normalise back to an array before anyone iterates it.
      const lines = parsed.lines === undefined ? null : Array.isArray(parsed.lines) ? parsed.lines : [parsed.lines];
      waiter?.(lines);
    });

    child.on('exit', () => {
      // Whatever was in flight is not coming.
      const waiter = this.waiter;
      this.waiter = null;
      waiter?.(null);
      this.child = null;
      this.ready = false;
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Recognise one PNG. Null when the engine is busy, dead or unparseable —
   * the caller treats all three as "skip this frame", which is always right
   * for a watcher: the next frame is already on its way.
   */
  recognize(pngPath: string): Promise<OcrLine[] | null> {
    const child = this.child;
    if (!child || !this.ready || this.waiter !== null) return Promise.resolve(null);

    return new Promise((resolve) => {
      this.waiter = resolve;
      child.stdin.write(`${pngPath}\n`);
      // A request that outlives its usefulness is abandoned, not awaited: the
      // exit handler or the next line will already have resolved it, and this
      // timer only covers an engine that has silently wedged.
      setTimeout(() => {
        if (this.waiter === resolve) {
          this.waiter = null;
          resolve(null);
        }
      }, 3000);
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.ready = false;
    if (this.scriptPath) {
      try {
        fs.unlinkSync(this.scriptPath);
      } catch {
        // Temp files are the OS's problem eventually.
      }
      this.scriptPath = null;
    }
  }
}
