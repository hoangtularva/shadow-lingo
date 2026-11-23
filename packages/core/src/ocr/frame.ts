import type { OcrPixels, OcrReading, OcrRegion } from './types';

/**
 * Image side of "Đọc chữ trên hình", shared by every platform: which part of the frame holds
 * subtitles, which pixels are text, and when the band has not changed. Frames are only
 * looked at in memory, never kept.
 */

/** The fixed bands: a quarter of the frame near the bottom or top edge. */
export const OCR_BANDS: Readonly<Record<'bottom' | 'top', OcrRegion>> = {
  bottom: { from: 0.72, to: 0.97 },
  top: { from: 0.03, to: 0.28 },
};
/** The whole frame (looked at small, to find where text sits). */
export const WHOLE_FRAME: OcrRegion = { from: 0, to: 1 };
/** Width the band is read at (subtitles stay legible, the picture stays small). */
export const OCR_READ_WIDTH = 960;
/** Width the whole frame is looked at when finding text. */
export const OCR_SCAN_WIDTH = 320;
/** Thinnest region the learner can choose. */
export const MIN_REGION = 0.06;
/** Below this share of text pixels the band holds no subtitle. */
const MIN_INK = 0.004;
/** Columns compared to tell whether the band changed since the last look. */
const SIGNATURE_COLUMNS = 96;
/** Words the OCR engine is less sure about are usually picture details read as letters. */
export const MIN_WORD_CONFIDENCE = 80;
/** Longest text a reading may carry. */
export const MAX_OCR_TEXT = 400;

/** Subtitle-like pixel: bright and nearly white, or bright yellow. */
export function isTextPixel(r: number, g: number, b: number): boolean {
  const white = r > 200 && g > 200 && b > 190;
  const yellow = r > 200 && g > 180 && b < 120;
  return white || yellow;
}

/**
 * Which pixels are text (1) in an RGBA band. Usual subtitles: bright white or yellow letters.
 * Otherwise (dark letters on a light box, say) the band is split at its Otsu threshold and the
 * smaller side is taken as text, when it looks like text (1–35 % of the band).
 */
export function textMask(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const n = w * h;
  const mask = new Uint8Array(n);
  let ink = 0;
  for (let p = 0; p < n; p++) {
    if (isTextPixel(rgba[p * 4] ?? 0, rgba[p * 4 + 1] ?? 0, rgba[p * 4 + 2] ?? 0)) {
      mask[p] = 1;
      ink++;
    }
  }
  if (ink >= n * MIN_INK) return mask;
  const lum = new Uint8Array(n);
  const hist = new Array<number>(256).fill(0);
  for (let p = 0; p < n; p++) {
    const v = Math.round(
      0.299 * (rgba[p * 4] ?? 0) + 0.587 * (rgba[p * 4 + 1] ?? 0) + 0.114 * (rgba[p * 4 + 2] ?? 0),
    );
    lum[p] = v;
    hist[v] = (hist[v] ?? 0) + 1;
  }
  // Otsu: the threshold that best separates two groups of brightness.
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (hist[i] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] ?? 0);
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  let dark = 0;
  for (let p = 0; p < n; p++) if ((lum[p] ?? 0) <= threshold) dark++;
  const darkIsText = dark <= n - dark;
  const share = (darkIsText ? dark : n - dark) / n;
  if (share < 0.01 || share > 0.35) return new Uint8Array(n);
  for (let p = 0; p < n; p++) mask[p] = (lum[p] ?? 0) <= threshold === darkIsText ? 1 : 0;
  return mask;
}

/**
 * Turns an RGBA band into black text on white, in place. Returns how many text pixels it has
 * and a per-column count of them (to spot an unchanged band cheaply).
 */
export function binarizeBand(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): { ink: number; signature: number[] } {
  const mask = textMask(rgba, w, h);
  const signature = new Array<number>(SIGNATURE_COLUMNS).fill(0);
  let ink = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const text = mask[p] === 1;
      const v = text ? 0 : 255;
      rgba[p * 4] = v;
      rgba[p * 4 + 1] = v;
      rgba[p * 4 + 2] = v;
      rgba[p * 4 + 3] = 255;
      if (text) {
        ink++;
        const col = Math.floor((x * SIGNATURE_COLUMNS) / w);
        signature[col] = (signature[col] ?? 0) + 1;
      }
    }
  }
  return { ink, signature };
}

/** The band looks the same as last time (allowing a little noise). */
export function sameBand(prev: readonly number[] | null, next: readonly number[], ink: number) {
  if (!prev) return false;
  return next.reduce((sum, n, i) => sum + Math.abs(n - (prev[i] ?? 0)), 0) < ink * 0.03 + 4;
}

/** What preparing a band gave: a black-and-white PNG to recognize, or why there is none. */
export type BandResult = { kind: 'text'; png: string } | { kind: 'empty' } | { kind: 'unchanged' };

/**
 * Prepares bands for the OCR engine: keeps the text pixels and skips bands that did not
 * change since the last look at the same region.
 */
export class BandReader {
  private readonly out: HTMLCanvasElement;
  private last: number[] | null = null;
  private lastKey = '';

  constructor(doc: Document) {
    this.out = doc.createElement('canvas');
  }

  /** Prepares `pixels` (changed in place); `key` names the region they show. */
  prepare(pixels: OcrPixels, key: string): BandResult {
    const { data, width: w, height: h } = pixels;
    const { ink, signature } = binarizeBand(data, w, h);
    const unchanged = this.lastKey === key && sameBand(this.last, signature, ink);
    this.last = signature;
    this.lastKey = key;
    if (unchanged) return { kind: 'unchanged' };
    if (ink < w * h * MIN_INK) return { kind: 'empty' };
    this.out.width = w;
    this.out.height = h;
    const g = this.out.getContext('2d');
    if (!g) return { kind: 'unchanged' };
    const image = g.createImageData(w, h);
    image.data.set(data);
    g.putImageData(image, 0, 0);
    return { kind: 'text', png: this.out.toDataURL('image/png') };
  }

  /** A small blank picture: recognizing it once loads the engine before the first frame. */
  blank(): string {
    this.out.width = 64;
    this.out.height = 16;
    const g = this.out.getContext('2d');
    if (g) {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 64, 16);
    }
    return this.out.toDataURL('image/png');
  }
}

/** Draws rows `region` of `source` (width × height) at most `maxWidth` wide; reads the pixels. */
export function grabPixels(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  size: { width: number; height: number },
  region: OcrRegion,
  maxWidth: number,
): OcrPixels | null | 'blocked' {
  const sy = Math.round(size.height * region.from);
  const sh = Math.round(size.height * (region.to - region.from));
  if (size.width < 1 || sh < 1) return null;
  const w = Math.min(maxWidth, Math.round(size.width));
  const h = Math.max(1, Math.round((sh * w) / size.width));
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  try {
    g.drawImage(source, 0, sy, size.width, sh, 0, 0, w, h);
    const { data } = g.getImageData(0, 0, w, h);
    return { data, width: w, height: h };
  } catch {
    // A protected video's pixels cannot be read.
    return 'blocked';
  }
}

/**
 * Where subtitle-like text sits in a whole (small) frame. Letters show as many narrow bright
 * strokes along a row, each clearly brighter than the pixels just past it; a bright shape
 * (a sky, a yellow shirt) is one wide run and does not count. Rows rich in strokes are grouped
 * into blocks of one or two lines, and the strongest block (a little favoured near the
 * bottom, where subtitles usually are) is returned with some margin, or null.
 */
export function findTextRegion(pixels: OcrPixels): OcrRegion | null {
  const { data, width: w, height: h } = pixels;
  const lum = (p: number) =>
    0.299 * (data[p * 4] ?? 0) + 0.587 * (data[p * 4 + 1] ?? 0) + 0.114 * (data[p * 4 + 2] ?? 0);
  const text = (p: number) =>
    isTextPixel(data[p * 4] ?? 0, data[p * 4 + 1] ?? 0, data[p * 4 + 2] ?? 0);
  const maxStroke = Math.max(3, Math.round(w * 0.015));
  const rows = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y++) {
    let x = 1;
    while (x < w - 1) {
      const p = y * w + x;
      if (!text(p)) {
        x++;
        continue;
      }
      let end = x;
      let bright = 0;
      while (end < w - 1 && text(y * w + end)) {
        bright = Math.max(bright, lum(y * w + end));
        end++;
      }
      const run = end - x;
      const before = lum(p - 1);
      const after = lum(y * w + end);
      if (run <= maxStroke && bright - before > 50 && bright - after > 50) {
        rows[y] = (rows[y] ?? 0) + 1;
      }
      x = end + 1;
    }
  }
  const textRow = 4;
  const gap = Math.max(1, Math.round(h * 0.015));
  let best: { y0: number; y1: number; score: number } | null = null;
  let y = 0;
  while (y < h) {
    if ((rows[y] ?? 0) < textRow) {
      y++;
      continue;
    }
    let y1 = y;
    let score = 0;
    let quiet = 0;
    for (let k = y; k < h && quiet <= gap; k++) {
      if ((rows[k] ?? 0) >= textRow) {
        y1 = k;
        quiet = 0;
        score += rows[k] ?? 0;
      } else quiet++;
    }
    const height = y1 - y + 1;
    if (height >= h * 0.025 && height <= h * 0.25 && score >= 24) {
      const weighted = (y + y1) / 2 > h * 0.6 ? score * 1.25 : score;
      if (!best || weighted > best.score) best = { y0: y, y1, score: weighted };
    }
    y = y1 + 1;
  }
  if (!best) return null;
  const pad = Math.max(h * 0.03, (best.y1 - best.y0 + 1) * 0.4);
  return {
    from: Math.max(0, (best.y0 - pad) / h),
    to: Math.min(1, (best.y1 + 1 + pad) / h),
  };
}

/** How much two regions share, relative to the thinner one (0–1). */
export function regionOverlap(a: OcrRegion, b: OcrRegion): number {
  const shared = Math.min(a.to, b.to) - Math.max(a.from, b.from);
  return shared <= 0 ? 0 : shared / Math.min(a.to - a.from, b.to - b.from);
}

/** Where a region sits, for the status line. */
export function regionPosition(r: OcrRegion): 'top' | 'middle' | 'bottom' {
  const mid = (r.from + r.to) / 2;
  return mid < 0.4 ? 'top' : mid > 0.6 ? 'bottom' : 'middle';
}

/** Text must keep being found in a new place this long before "Tự tìm" settles there. */
export const AUTO_CONFIRM_MS = 4000;
/** A candidate place with no text for longer than this is given up (gaps between lines are shorter). */
export const AUTO_MISS_MS = 2500;

/** What one scan changed in "Tự tìm". */
export interface AutoChange {
  /** A candidate place was given up (its readings should be taken back). */
  dropped: boolean;
  /** A new candidate place started being followed. */
  started: boolean;
  /** The candidate place was confirmed: it is `current` now. */
  confirmed: boolean;
}

/**
 * "Tự tìm": settles on the place subtitles are found in, and stays there. A new place is first
 * a candidate, confirmed once text is still found there AUTO_CONFIRM_MS later; it is given up
 * when no text shows there for AUTO_MISS_MS. The player's own title or controls, which show
 * for a few seconds when playback starts or the player is touched, are given up that way.
 */
export class AutoRegion {
  current: OcrRegion | null = null;
  candidate: OcrRegion | null = null;
  private since = 0;
  private seen = 0;

  update(found: OcrRegion | null, now: number): AutoChange {
    const change: AutoChange = { dropped: false, started: false, confirmed: false };
    const same = (a: OcrRegion | null) => !!a && !!found && regionOverlap(a, found) > 0.5;
    if (same(this.current)) {
      change.dropped = !!this.candidate;
      this.candidate = null;
      return change;
    }
    if (!found) {
      // A short gap between lines keeps the candidate; text gone for longer drops it.
      if (this.candidate && now - this.seen > AUTO_MISS_MS) {
        this.candidate = null;
        change.dropped = true;
      }
      return change;
    }
    if (!same(this.candidate)) {
      change.dropped = !!this.candidate;
      change.started = true;
      this.candidate = found;
      this.since = now;
      this.seen = now;
      return change;
    }
    this.seen = now;
    if (now - this.since >= AUTO_CONFIRM_MS) {
      this.current = this.candidate;
      this.candidate = null;
      change.confirmed = true;
    }
    return change;
  }
}

/** A recognized word, as OCR engines report them (Tesseract's shape). */
export interface OcrWord {
  text: string;
  confidence: number;
}

/**
 * Keeps the words the engine is sure of, line by line, with their mean confidence. "I" is often
 * read, unsure, as "|" or "l"; it is kept when a lowercase word follows.
 */
export function keepSureWords(lines: readonly (readonly OcrWord[])[]): OcrReading {
  const out: string[] = [];
  let sum = 0;
  let count = 0;
  for (const line of lines) {
    const words = line.filter(
      (word, i) =>
        (word.confidence >= MIN_WORD_CONFIDENCE && /[A-Za-z0-9]/.test(word.text)) ||
        (/^[|lI]$/.test(word.text) && /^[a-z]/.test(line[i + 1]?.text ?? '')),
    );
    if (words.length === 0) continue;
    out.push(words.map((word) => word.text).join(' '));
    for (const word of words) sum += word.confidence;
    count += words.length;
  }
  return { text: out.join('\n').slice(0, MAX_OCR_TEXT), confidence: count ? sum / count : 0 };
}
