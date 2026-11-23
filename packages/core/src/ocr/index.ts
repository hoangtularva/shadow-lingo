import { mergeSentences } from '../merger';
import type { CaptionTrack, Cue } from '../types';

export type { OcrAdapter, OcrPixels, OcrPlacement, OcrReading, OcrRegion } from './types';
import type { OcrReading } from './types';

/** Readings below this confidence are treated as no text. */
export const MIN_CONFIDENCE = 55;
/**
 * Text must stay at least this long (two readings in a row) to count: one-off readings are
 * usually the picture changing under a subtitle that is fading in or out.
 */
const MIN_CUE_MS = 900;
/** Readings this alike are the same subtitle (OCR differs a little between frames). */
const SAME_TEXT = 0.75;

/** Tidies OCR output: drops border noise like "|" and stray symbols, joins lines. */
export function cleanOcrText(raw: string): string {
  const text = raw
    // A lone "|" or "l" before a word is the pronoun "I" ("| think", "l think").
    .replace(/(^|[\s"“(])[|l](?=\s+[a-z])/g, '$1I')
    .replace(/[|¦_~`^<>{}[\]\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Leading or trailing punctuation left over from the frame edge.
    .replace(/^[\s.,;:'"\-–—]+/, '')
    .replace(/\s+[.,;:'"\-–—]+$/, '');
  // Needs at least two real words to be a subtitle.
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  return words.length >= 2 ? text : '';
}

/**
 * Two readings of the same subtitle: alike, or one is a part of the other (read while the
 * subtitle was still appearing).
 */
export function sameLine(a: string, b: string): boolean {
  if (similarity(a, b) >= SAME_TEXT) return true;
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const y = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 8 && long.includes(short);
}

/** Similarity of two strings, 0–1 (normalized Levenshtein on letters and digits). */
export function similarity(a: string, b: string): number {
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const y = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return 1 - (prev[y.length] ?? 0) / Math.max(x.length, y.length);
}

interface Open {
  text: string;
  confidence: number;
  start: number;
  lastSeen: number;
  /** Already listed (provisionally) while still on screen. */
  shown: boolean;
}

/** A line seen this long (two readings) is listed while it is still on screen. */
const SHOW_OPEN_MS = 450;

/**
 * Turns frame-by-frame readings into timed cues: a subtitle starts when its text appears and
 * ends when it disappears or changes. A line seen twice is listed right away, while it is
 * still on screen. Readings of the same line are merged, keeping the fullest or most
 * confident one; a line read again after a seek is not added twice.
 */
export class OcrCueBuilder {
  private cues: Cue[] = [];
  private saved: Cue[] | null = null;
  private open: Open | null = null;
  private lastTime = -1;

  /** Adds a reading at `timeMs`; returns true when the cues changed. */
  feed(timeMs: number, reading: OcrReading | null): boolean {
    let changed = false;
    // A jump back (seek) closes what was showing.
    if (this.lastTime >= 0 && timeMs < this.lastTime - 1000 && this.open) {
      changed = this.close(this.open.lastSeen) || changed;
    }
    this.lastTime = timeMs;
    const text = reading && reading.confidence >= MIN_CONFIDENCE ? cleanOcrText(reading.text) : '';
    const open = this.open;
    if (!text) {
      if (open) changed = this.close(timeMs) || changed;
      return changed;
    }
    const confidence = reading?.confidence ?? 0;
    if (open && sameLine(open.text, text)) {
      open.lastSeen = timeMs;
      // A fuller reading wins (the line was still appearing); otherwise the surer one.
      const longer = text.length > open.text.length + 3;
      const shorter = open.text.length > text.length + 3;
      if (longer || (!shorter && confidence > open.confidence)) {
        changed = (open.shown && open.text !== text) || changed;
        open.text = text;
        open.confidence = confidence;
      }
      return this.reveal() || changed;
    }
    if (open) changed = this.close(timeMs) || changed;
    this.open = { text, confidence, start: timeMs, lastSeen: timeMs, shown: false };
    return changed;
  }

  /** The frame did not change: whatever shows is still showing. Returns true when listed now. */
  same(timeMs: number): boolean {
    this.lastTime = timeMs;
    if (!this.open) return false;
    this.open.lastSeen = timeMs;
    return this.reveal();
  }

  /** Closes the open line (e.g. the learner stopped reading). */
  flush(): boolean {
    return this.open ? this.close(this.open.lastSeen + 500) : false;
  }

  /** Starts from lines read before (saved on the device), unless something was read already. */
  seed(cues: readonly Cue[]): void {
    if (this.cues.length > 0 || this.open) return;
    this.cues = cues.map((c) => ({ ...c })).sort((a, b) => a.start - b.start);
  }

  /** Finished lines, and the line on screen once it has been seen twice. */
  getCues(): readonly Cue[] {
    const open = this.open;
    if (!open?.shown) return this.cues;
    const cue = { start: open.start, end: open.lastSeen + 500, text: open.text };
    if (this.twinOf(cue)) return this.cues;
    return [...this.cues, cue].sort((a, b) => a.start - b.start);
  }

  /**
   * Remembers the cues as they are now, before reading a place that may turn out not to hold
   * subtitles (see AutoRegion).
   */
  checkpoint(): void {
    this.saved = this.cues.map((c) => ({ ...c }));
  }

  /** Keeps what was read since the checkpoint. */
  commit(): void {
    this.saved = null;
  }

  /** Takes back what was read since the checkpoint; returns true when the cues changed. */
  rollback(): boolean {
    const saved = this.saved;
    if (!saved) return false;
    const changed =
      !!this.open?.shown ||
      saved.length !== this.cues.length ||
      saved.some((c, i) => c.text !== this.cues[i]?.text || c.end !== this.cues[i]?.end);
    this.cues = saved;
    this.saved = null;
    this.open = null;
    return changed;
  }

  /** Lists the open line once it has been seen long enough. */
  private reveal(): boolean {
    const open = this.open;
    if (!open || open.shown || open.lastSeen - open.start < SHOW_OPEN_MS) return false;
    open.shown = true;
    return true;
  }

  private twinOf(cue: Cue): Cue | undefined {
    return this.cues.find(
      (c) => c.start < cue.end && cue.start < c.end && sameLine(c.text, cue.text),
    );
  }

  private close(end: number): boolean {
    const open = this.open;
    this.open = null;
    if (!open) return false;
    // Listed while on screen but too short after all: taking it away is a change too.
    if (end - open.start < MIN_CUE_MS) return open.shown;
    const cue = { start: open.start, end, text: open.text };
    const twin = this.twinOf(cue);
    if (twin) {
      twin.start = Math.min(twin.start, cue.start);
      twin.end = Math.max(twin.end, cue.end);
      if (cue.text.length > twin.text.length) twin.text = cue.text;
      return true;
    }
    this.cues.push(cue);
    this.cues.sort((a, b) => a.start - b.start);
    return true;
  }
}

/** Track made from OCR cues, ready for the panel. */
export function buildOcrTrack(videoId: string, cues: readonly Cue[]): CaptionTrack {
  return {
    videoId,
    lang: 'en',
    kind: 'unknown',
    source: 'ocr',
    timed: true,
    sentences: mergeSentences(cues.map((c) => ({ ...c }))),
  };
}

export * from './frame';
export * from './cache';
