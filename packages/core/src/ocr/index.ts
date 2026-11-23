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
}

/**
 * Turns frame-by-frame readings into timed cues: a subtitle starts when its text appears and
 * ends when it disappears or changes. Readings of the same line are merged, keeping the most
 * confident one; a line read again after a seek is not added twice.
 */
export class OcrCueBuilder {
  private cues: Cue[] = [];
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
        open.text = text;
        open.confidence = confidence;
      }
      return changed;
    }
    if (open) changed = this.close(timeMs) || changed;
    this.open = { text, confidence, start: timeMs, lastSeen: timeMs };
    return changed;
  }

  /** The frame did not change: whatever shows is still showing. */
  same(timeMs: number): void {
    this.lastTime = timeMs;
    if (this.open) this.open.lastSeen = timeMs;
  }

  /** Closes the open line (e.g. the learner stopped reading). */
  flush(): boolean {
    return this.open ? this.close(this.open.lastSeen + 500) : false;
  }

  getCues(): readonly Cue[] {
    return this.cues;
  }

  private close(end: number): boolean {
    const open = this.open;
    this.open = null;
    if (!open || end - open.start < MIN_CUE_MS) return false;
    const cue = { start: open.start, end, text: open.text };
    const twin = this.cues.find(
      (c) => c.start < cue.end && cue.start < c.end && sameLine(c.text, cue.text),
    );
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
