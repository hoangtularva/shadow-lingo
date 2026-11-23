import type { OcrBand, OcrReading } from './types';

/**
 * Image side of "Đọc chữ trên hình", shared by every platform: which part of the frame holds
 * subtitles, which pixels are text, and when the band has not changed. Frames are only
 * looked at in memory, never kept.
 */

/** Share of the frame height looked at, from the edge. */
export const OCR_BANDS: Record<OcrBand, readonly [number, number]> = {
  bottom: [0.72, 0.97],
  top: [0.03, 0.28],
};
/** Width the band is read at (subtitles stay legible, the picture stays small). */
export const OCR_READ_WIDTH = 960;
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

/** What reading a band gave: a black-and-white PNG to recognize, or why there is none. */
export type BandResult =
  { kind: 'text'; png: string } | { kind: 'empty' } | { kind: 'unchanged' } | { kind: 'blocked' };

/**
 * Prepares bands for the OCR engine: scales the band of a frame source to the reading width,
 * keeps the text pixels and skips bands that did not change.
 */
export class BandReader {
  private readonly frame: HTMLCanvasElement;
  private readonly out: HTMLCanvasElement;
  private last: number[] | null = null;
  private lastBand: OcrBand | null = null;

  constructor(doc: Document) {
    this.frame = doc.createElement('canvas');
    this.out = doc.createElement('canvas');
  }

  /** Reads the area (sx, sy, sw, sh) of `source`, which shows `band` of the video. */
  read(
    source: CanvasImageSource,
    area: { sx: number; sy: number; sw: number; sh: number },
    band: OcrBand,
  ): BandResult {
    const { sx, sy, sw, sh } = area;
    if (sw < 1 || sh < 1) return { kind: 'unchanged' };
    const w = Math.min(OCR_READ_WIDTH, Math.round(sw));
    const h = Math.max(1, Math.round((sh * w) / sw));
    this.frame.width = w;
    this.frame.height = h;
    const g = this.frame.getContext('2d', { willReadFrequently: true });
    if (!g) return { kind: 'unchanged' };
    let pixels: ImageData;
    try {
      g.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
      pixels = g.getImageData(0, 0, w, h);
    } catch {
      // A protected video's pixels cannot be read.
      return { kind: 'blocked' };
    }
    const { ink, signature } = binarizeBand(pixels.data, w, h);
    const unchanged = this.lastBand === band && sameBand(this.last, signature, ink);
    this.last = signature;
    this.lastBand = band;
    if (unchanged) return { kind: 'unchanged' };
    if (ink < w * h * MIN_INK) return { kind: 'empty' };
    this.out.width = w;
    this.out.height = h;
    this.out.getContext('2d')?.putImageData(pixels, 0, 0);
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
