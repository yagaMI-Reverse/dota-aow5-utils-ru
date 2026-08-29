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
 * The cat watch: how often the minimap corner is counted. A cat lives for
 * minutes, so this can afford to be slow — and it has to be, because every
 * count is a screen capture and captures are what the mouse feels.
 */
const CAT_MS = 4000;
/** Floor between rings, guarding against a marker blinking across the line. */
const CAT_RING_COOLDOWN_MS = 30_000;
/** Frames above baseline before the meow — a cat stays up, capture junk does not. */
const CAT_STREAK = 3;
/** Frames back at baseline before the next rise counts as a new cat. */
const CAT_CALM = 2;
/** Non-zero counts that vote a new room's baseline in. */
const CAT_LEARN_SAMPLES = 4;
/** Frames stably below baseline before the smaller count is believed. */
const CAT_BELOW_STABLE = 8;
/**
 * Grace after entering a room, during which nothing is even captured. The log
 * announces `room_enter` while the screen is still a loading fade with no
 * minimap on it, and counting those frames is how this feature once meowed
 * twice at a perfectly normal map.
 */
const CAT_SETTLE_MS = 8_000;

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
  private catCalm = 0;
  /** True after a ring, until the count has come back down to baseline. */
  private catEpisode = false;
  private catSamples: number[] = [];
  private catBelow: number[] = [];
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
    this.catCalm = 0;
    this.catEpisode = false;
    this.catSamples = [];
    this.catBelow = [];
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
   * price ledger, the watcher learns it. A new room's baseline is the upper
   * median of its first few non-zero counts: biased high on purpose, because
   * a baseline learned too high misses one cat, while one learned too low
   * meows at nothing all evening. A frame with no green at all is a frame
   * with no minimap on it — a loading screen, an alt-tab — and is ignored
   * rather than counted, which is the lesson of the double-meow bug.
   *
   * One ring per spawn: after a sustained rise the episode latches, and only
   * a return to baseline arms the next meow.
   */
  private async watchCat(sw: number, sh: number): Promise<void> {
    if (!this.catEnabled || this.currentRoom === null) return;
    const now = Date.now();
    if (now < this.catNextAt) return;
    // Settling means no capture at all, not a capture whose verdict is thrown
    // away — the screen would be a loading fade anyway.
    if (now - this.roomEnteredAt < CAT_SETTLE_MS) return;
    this.catNextAt = now + CAT_MS;
    this.loadBaselines();

    /*
     * Half resolution, and that is deliberate: a full-size grab is ~15MB
     * copied out of the compositor, and doing that every couple of seconds
     * during play was felt as a periodic mouse hitch. A minimap marker is
     * dozens of pixels across even at half scale, so nothing is lost — the
     * OCR path still pays for full frames, but only while the Exchange is
     * open and the game is not being played.
     */
    const fulls = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(sw / 2), height: Math.round(sh / 2) },
    });
    const frame = fulls[0]?.thumbnail;
    if (!frame || frame.isEmpty()) return;

    // The minimap corner: bottom-left, scaled off the 1440p reference — via
    // the capture's own size, because the capturer rounds as it pleases.
    const full = frame.getSize();
    const box = Math.round((420 * full.height) / 1440);
    const crop = frame.crop({ x: 0, y: full.height - box, width: box, height: box });
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
    // Sized off the capture, which is half the screen: a marker that fills
    // dozens of pixels there still dwarfs this floor, single-pixel noise not.
    const MIN_BLOB = Math.max(4, Math.round((full.height / 1440) * 12));
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

    // No green anywhere means no minimap in the corner, not a room with zero
    // markers. Believing such a frame once stomped a baseline to zero and had
    // the tracker meowing at a perfectly normal map.
    if (clusters === 0) {
      this.catStreak = 0;
      return;
    }

    const room = this.currentRoom;
    const learned = this.catBaselines.get(room);

    if (learned === undefined) {
      // A new room: the first few real counts vote, the upper median wins.
      this.catSamples.push(clusters);
      if (this.catSamples.length < CAT_LEARN_SAMPLES) return;
      const sorted = [...this.catSamples].sort((a, b) => a - b);
      this.catBaselines.set(room, sorted[Math.floor(sorted.length / 2)] as number);
      this.catSamples = [];
      this.saveBaselines();
      return;
    }

    if (clusters > learned) {
      this.catCalm = 0;
      this.catBelow = [];
      this.catStreak++;
      if (this.catStreak >= CAT_STREAK && !this.catEpisode && now - this.catLastRing > CAT_RING_COOLDOWN_MS) {
        this.catEpisode = true;
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
      return;
    }

    this.catStreak = 0;
    this.catCalm++;
    // Back at baseline long enough: the cat is gone, the next rise is a new one.
    if (this.catEpisode && this.catCalm >= CAT_CALM) this.catEpisode = false;

    if (clusters < learned) {
      // Below the remembered count. Transient — two markers standing so close
      // they merge into one blob, an icon drawn over a triangle — is common,
      // so the smaller number is only believed after it holds for a stretch,
      // and then the largest count of that stretch is what is adopted.
      this.catBelow.push(clusters);
      if (this.catBelow.length >= CAT_BELOW_STABLE) {
        this.catBaselines.set(room, Math.max(...this.catBelow));
        this.catBelow = [];
        this.saveBaselines();
      }
    } else {
      this.catBelow = [];
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
