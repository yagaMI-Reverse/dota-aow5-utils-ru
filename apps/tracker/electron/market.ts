/**
 * The Exchange watcher: reads the game's market window off the screen and
 * hands the overlay positioned text to draw verdicts over.
 *
 * Everything else in the tracker reads a log file. This one watches pixels,
 * because the market data reaches the client over channels that write nothing
 * anywhere — net tables into Panorama — which was measured, not assumed: six
 * engine log channels opened for a session produced zero market lines while
 * the Exchange was being browsed. The screen is the only place the listings
 * exist in readable form, so the screen is what gets read.
 *
 * It still touches nothing: no game memory, no game files, no injection. A
 * screenshot and an always-on-top window are the same machinery every voice
 * overlay uses.
 *
 * Two-speed loop, because capture is not free: a cheap thumbnail gate answers
 * "is the Exchange even open" a few times a second by looking for the column
 * of green buy buttons, and only a hit pays for the full-resolution frame,
 * the crop, the invert (the OCR engine reads dark-on-light far better) and
 * the ~90ms recognition.
 */
import { app, BrowserWindow, desktopCapturer, nativeImage, screen } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketFrame } from '../core/ipc.ts';
import { OcrService } from './ocr.ts';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where things sit in the Exchange window, measured on a 2560x1440 frame and
 * scaled linearly to the actual display. The dialog is centered and keeps its
 * proportions, which linear scaling survives; a resolution where it does not
 * will read as "market closed" rather than as wrong verdicts, because the
 * green-button gate misses too.
 */
const BASE = {
  w: 2560,
  h: 1440,
  /** The listing rows region: icons through prices, all eight rows. */
  list: { x: 530, y: 315, w: 1180, h: 810 },
  /** The buy-button column the gate probes for green. */
  buttons: { x: 1845, yTop: 350, yStep: 99, count: 8, sample: 60 },
};

/** Upscale factor for the OCR crop. The engine likes its glyphs big. */
const OCR_SCALE = 1.5;

const ACTIVE_MS = 250;
const IDLE_MS = 1200;

/**
 * The cat watch: how often the minimap corner is counted, and the calm-down
 * after a ring. Event cats live for minutes; thirty seconds between rings is
 * a reminder, not an alarm clock.
 */
const CAT_MS = 2500;
const CAT_RING_COOLDOWN_MS = 30_000;
/** How long after entering a room its baseline is still being learned. */
const CAT_LEARN_MS = 8_000;

export class MarketWatcher {
  private readonly ocr = new OcrService();
  private window: BrowserWindow | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private busy = false;
  /** A cheap signature of the last crop OCR'd, to skip identical frames. */
  private lastSig = 0;
  private lastLines: MarketFrame['lines'] = [];
  /**
   * Two capture files used alternately. One file raced: the next tick's write
   * began while the OCR process still held the previous read open, and every
   * second frame died on EBUSY dressed as UNKNOWN.
   */
  private readonly tmpPngs = [
    path.join(os.tmpdir(), `aow5-market-${process.pid}-a.png`),
    path.join(os.tmpdir(), `aow5-market-${process.pid}-b.png`),
  ] as const;
  private flip = 0;

  /** ---- the event-cat watch ---- */
  private catEnabled = false;
  private currentRoom: string | null = null;
  private roomEnteredAt = 0;
  private catBaselines = new Map<string, number>();
  private catStreak = 0;
  private catLastRing = 0;
  private catNextAt = 0;
  private baselinesLoaded = false;

  private baselinePath(): string {
    return path.join(app.getPath('userData'), 'cat-baseline.json');
  }

  private loadBaselines(): void {
    if (this.baselinesLoaded) return;
    this.baselinesLoaded = true;
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(this.baselinePath(), 'utf8'));
      if (typeof raw === 'object' && raw !== null) {
        for (const [room, n] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof n === 'number' && Number.isFinite(n)) this.catBaselines.set(room, n);
        }
      }
    } catch {
      // First run, or a bad file: baselines relearn themselves either way.
    }
  }

  private saveBaselines(): void {
    try {
      fs.writeFileSync(this.baselinePath(), JSON.stringify(Object.fromEntries(this.catBaselines)), 'utf8');
    } catch {
      // Losing a baseline costs one relearn pass, nothing more.
    }
  }

  setCatEnabled(next: boolean): void {
    this.catEnabled = next;
  }

  /** Main tells the watcher where the player is; the log already knows. */
  setRoom(room: string | null): void {
    this.currentRoom = room;
    this.roomEnteredAt = Date.now();
    this.catStreak = 0;
  }

  /** Starts the loop and puts the lens window up. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.ocr.start();
    this.createWindow();
    this.schedule(IDLE_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ocr.stop();
    this.window?.close();
    this.window = null;
    for (const tmp of this.tmpPngs) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // Already gone is the goal state.
      }
    }
  }

  private createWindow(): void {
    if (this.window && !this.window.isDestroyed()) return;
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;

    const win = new BrowserWindow({
      x: 0,
      y: 0,
      width,
      height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      fullscreenable: false,
      focusable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(dirname, '../preload/preload.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.window = win;

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Permanently click-through. This sheet is never interacted with: it is
    // a drawing surface, and a stray badge eating a buy click would be the
    // worst bug this feature could have.
    win.setIgnoreMouseEvents(true, { forward: false });

    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) void win.loadURL(`${devUrl}?overlay=market`);
    else void win.loadFile(path.join(dirname, '../renderer/index.html'), { query: { overlay: 'market' } });

    win.on('closed', () => {
      this.window = null;
    });
  }

  private schedule(ms: number): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  /**
   * A breadcrumb trail for a pipeline that fails silently by design.
   *
   * Every stage of a tick can go wrong without a symptom — a black capture, a
   * dead OCR engine, a gate that misses — and the overlay's answer to all of
   * them is the same correct nothing. This file is the difference between
   * "it does not work" and knowing which stage to fix.
   */
  private log(msg: string): void {
    try {
      fs.appendFileSync(
        path.join(os.tmpdir(), 'aow5-market-debug.log'),
        `${new Date().toISOString()} ${msg}\n`,
      );
    } catch {
      // Diagnostics must never take the watcher down.
    }
  }

  private async tick(): Promise<void> {
    if (!this.running || this.busy) return;
    this.busy = true;
    let nextDelay = IDLE_MS;
    try {
      const display = screen.getPrimaryDisplay();
      const { width: sw, height: sh } = display.size;

      // --- the gate: a thumbnail and a handful of pixel reads ---
      const gateW = 320;
      const gateH = Math.round((gateW * sh) / sw);
      const gates = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: gateW, height: gateH },
      });
      const gate = gates[0]?.thumbnail;
      if (!gate || gate.isEmpty()) return;

      if (!this.greenButtons(gate.toBitmap(), gate.getSize().width, gate.getSize().height)) {
        this.send({ t: Date.now(), screenW: sw, screenH: sh, open: false, lines: [] });
        // The Exchange hides the minimap, so the cat watch runs exactly when
        // the lens has nothing to read: while the player is out farming.
        await this.watchCat(sw, sh);
        return;
      }

      // --- the Exchange is open: pay for the full frame ---
      const fulls = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: sw, height: sh },
      });
      const frame = fulls[0]?.thumbnail;
      if (!frame || frame.isEmpty()) return;

      const sx = sw / BASE.w;
      const sy = sh / BASE.h;
      const region = {
        x: Math.round(BASE.list.x * sx),
        y: Math.round(BASE.list.y * sy),
        width: Math.round(BASE.list.w * sx),
        height: Math.round(BASE.list.h * sy),
      };
      const crop = frame.crop(region);
      const scaled = crop.resize({ width: Math.round(region.width * OCR_SCALE) });

      // Invert to dark-on-light: measured on a real frame, the engine found
      // one line of eight without this and all of them with it.
      const size = scaled.getSize();
      const bitmap = Buffer.from(scaled.toBitmap());
      /*
       * A page that has not changed does not need recognising again: the OCR
       * call is ~600ms of CPU, and while the player reads a page the lens was
       * spending it on the same pixels four times a second. The signature is a
       * strided sum — cheap, and any real change (a scroll, a refresh, one
       * price ticking over) moves it.
       */
      let sig = 0;
      for (let i = 0; i < bitmap.length; i += 1024) sig = (sig * 31 + (bitmap[i] as number)) | 0;
      if (sig === this.lastSig && this.lastLines.length > 0) {
        this.send({ t: Date.now(), screenW: sw, screenH: sh, open: true, lines: this.lastLines });
        nextDelay = ACTIVE_MS;
        return;
      }
      for (let i = 0; i < bitmap.length; i++) {
        if (i % 4 !== 3) bitmap[i] = 255 - (bitmap[i] as number);
      }
      const inverted = nativeImage.createFromBitmap(bitmap, { width: size.width, height: size.height });
      const tmpPng = this.tmpPngs[this.flip]!;
      this.flip = 1 - this.flip;
      fs.writeFileSync(tmpPng, inverted.toPNG());

      const lines = await this.ocr.recognize(tmpPng);
      if (lines !== null) {
        const factor = size.width / region.width;
        const mapped = lines.map((l) => ({
          x: Math.round(l.x / factor) + region.x,
          y: Math.round(l.y / factor) + region.y,
          w: Math.round(l.w / factor),
          h: Math.round(l.h / factor),
          text: l.text,
        }));
        this.lastSig = sig;
        this.lastLines = mapped;
        this.send({ t: Date.now(), screenW: sw, screenH: sh, open: true, lines: mapped });
      }
      nextDelay = ACTIVE_MS;
    } catch (error) {
      // A failed frame is just a skipped frame; the loop is the retry.
      this.log(`tick FAILED: ${String(error)}`);
    } finally {
      this.busy = false;
      this.schedule(nextDelay);
    }
  }

  /**
   * True when the buy-button column shows green where the Exchange draws it.
   *
   * Probes one pixel per row on the thumbnail. Three hits out of eight is the
   * bar: fewer rows than that can be green on a page filtered down to almost
   * nothing, but three green rectangles stacked in that exact column is not a
   * thing the game draws anywhere else.
   */
  private greenButtons(bitmap: Buffer, tw: number, th: number): boolean {
    // Everything is a fraction of the frame: the dialog scales with the
    // display and the thumbnail scales with the display, so base-frame
    // fractions apply to the thumbnail directly.
    const fx = (BASE.buttons.x + BASE.buttons.sample) / BASE.w;
    const px = Math.min(tw - 1, Math.round(fx * tw));
    let hits = 0;
    for (let row = 0; row < BASE.buttons.count; row++) {
      const fy = (BASE.buttons.yTop + row * BASE.buttons.yStep) / BASE.h;
      const py = Math.min(th - 1, Math.round(fy * th));
      const i = (py * tw + px) * 4;
      const b = bitmap[i] as number;
      const g = bitmap[i + 1] as number;
      const r = bitmap[i + 2] as number;
      if (g > 80 && g > r + 20 && g > b + 20) hits++;
    }
    return hits >= 3;
  }

  /**
   * Counts the green event markers on the minimap and rings on an extra one.
   *
   * There is no table of how many triangles each map draws — so, like the
   * price ledger, the watcher learns it: the first seconds in a room teach
   * that room its baseline (the minimum seen, so a cat already loose cannot
   * inflate it), and afterwards two consecutive counts above baseline mean
   * the event spawn is up.
   */
  private async watchCat(sw: number, sh: number): Promise<void> {
    if (!this.catEnabled || this.currentRoom === null) return;
    const now = Date.now();
    if (now < this.catNextAt) return;
    this.catNextAt = now + CAT_MS;
    this.loadBaselines();

    const fulls = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: sw, height: sh },
    });
    const frame = fulls[0]?.thumbnail;
    if (!frame || frame.isEmpty()) return;

    // The minimap corner: bottom-left, scaled off the 1440p reference.
    const box = Math.round((420 * sh) / 1440);
    const crop = frame.crop({ x: 0, y: sh - box, width: box, height: box });
    const size = crop.getSize();
    const bmp = crop.toBitmap(); // BGRA

    const w = size.width;
    const h = size.height;
    const mask = new Uint8Array(w * h);
    for (let i = 0, px = 0; px < w * h; px++, i += 4) {
      const b = bmp[i] as number;
      const g = bmp[i + 1] as number;
      const r = bmp[i + 2] as number;
      // The event triangle is pure bright green. Gold portals fail g>r*1.55,
      // white swirls fail both ratios, the teal hero portrait fails g>b*1.55.
      if (g > 140 && g > r * 1.55 && g > b * 1.55) mask[px] = 1;
    }

    // Connected components, 4-way; a marker is a blob, stray pixels are not.
    const MIN_BLOB = Math.max(8, Math.round((sh / 1440) * 12));
    let clusters = 0;
    const stack: number[] = [];
    for (let start = 0; start < mask.length; start++) {
      if (mask[start] !== 1) continue;
      let area = 0;
      stack.push(start);
      mask[start] = 2;
      while (stack.length > 0) {
        const px = stack.pop()!;
        area++;
        const x = px % w;
        const neighbours = [px - w, px + w, x > 0 ? px - 1 : -1, x < w - 1 ? px + 1 : -1];
        for (const n of neighbours) {
          if (n >= 0 && n < mask.length && mask[n] === 1) {
            mask[n] = 2;
            stack.push(n);
          }
        }
      }
      if (area >= MIN_BLOB) clusters++;
    }

    const room = this.currentRoom;
    const learned = this.catBaselines.get(room);
    const learning = now - this.roomEnteredAt < CAT_LEARN_MS;
    if (learning || learned === undefined) {
      // The minimum observed is the baseline: a cat on screen during the
      // learning window can only raise counts, never lower them.
      if (clusters > 0 || learned !== undefined) {
        this.catBaselines.set(room, learned === undefined ? clusters : Math.min(learned, clusters));
        this.saveBaselines();
      }
      return;
    }

    if (clusters > learned) {
      this.catStreak++;
      if (this.catStreak >= 2 && now - this.catLastRing > CAT_RING_COOLDOWN_MS) {
        this.catLastRing = now;
        const win = this.window;
        if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
          try {
            win.webContents.send('tracker:cat', { room, base: learned, seen: clusters });
          } catch {
            // Window mid-teardown; the cat will still be there next tick.
          }
        }
      }
    } else {
      this.catStreak = 0;
      // Self-correcting downwards: if the map genuinely has fewer markers
      // than remembered, adopt the smaller truth.
      if (clusters < learned && clusters > 0) {
        this.catBaselines.set(room, clusters);
        this.saveBaselines();
      }
    }
  }

  private send(frame: MarketFrame): void {
    const win = this.window;
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    try {
      win.webContents.send('tracker:market', frame);
    } catch {
      // Frame disposed mid-send; the next tick will find the window gone.
    }
  }
}
