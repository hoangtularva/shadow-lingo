import type { OcrAdapter, OcrBand, OcrReading } from '@shadow-lingo/core';

/**
 * "Đọc chữ trên hình". The content script looks at the subtitle band of the frame now showing
 * (in memory, never stored), keeps only bright text pixels, and sends that small black-and-white
 * picture to the extension's offscreen document, where Tesseract reads it: content script →
 * background (OCR_READ) → offscreen document (OCR_OFFSCREEN). Nothing leaves the device.
 */
export const OCR_READ = 'shadow-lingo:ocr-read';
export const OCR_OFFSCREEN = 'shadow-lingo:ocr-offscreen';
/** Files the offscreen document loads (copied into the build by wxt.config.ts). */
export const OCR_DIR = '/ocr/';
export const OCR_WORKER = 'worker.min.js';
export const OCR_CORE = 'tesseract-core-simd-lstm.wasm.js';

/** A PNG of the band, 1280 px wide at most, black and white: well under this. */
export const MAX_IMAGE_CHARS = 400_000;
const MAX_TEXT = 400;
const PNG_PREFIX = 'data:image/png;base64,';

export interface OcrReadRequest {
  type: typeof OCR_READ;
  image: string;
}

export interface OcrOffscreenRequest {
  type: typeof OCR_OFFSCREEN;
  image: string;
}

export type OcrResponse = { ok: true; text: string; confidence: number } | { ok: false };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isImage(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.startsWith(PNG_PREFIX) &&
    v.length <= MAX_IMAGE_CHARS &&
    /^[A-Za-z0-9+/=]*$/.test(v.slice(PNG_PREFIX.length))
  );
}

export function isOcrReadRequest(v: unknown): v is OcrReadRequest {
  return isRecord(v) && v.type === OCR_READ && isImage(v.image);
}

export function isOcrOffscreenRequest(v: unknown): v is OcrOffscreenRequest {
  return isRecord(v) && v.type === OCR_OFFSCREEN && isImage(v.image);
}

export function isOcrResponse(v: unknown): v is OcrResponse {
  if (!isRecord(v) || typeof v.ok !== 'boolean') return false;
  if (!v.ok) return true;
  return (
    typeof v.text === 'string' &&
    v.text.length <= MAX_TEXT &&
    typeof v.confidence === 'number' &&
    v.confidence >= 0 &&
    v.confidence <= 100
  );
}

/** Background side: opens the offscreen document if needed and forwards the picture. */
export function createOcrHandler(deps: {
  ensureOffscreen(): Promise<void>;
  forward(message: OcrOffscreenRequest): Promise<unknown>;
}) {
  return async (req: OcrReadRequest): Promise<OcrResponse> => {
    try {
      await deps.ensureOffscreen();
      const res = await deps.forward({ type: OCR_OFFSCREEN, image: req.image });
      return isOcrResponse(res) ? res : { ok: false };
    } catch {
      return { ok: false };
    }
  };
}

/** Width the band is read at (subtitles stay legible, the picture stays small). */
const READ_WIDTH = 960;
/** Share of the frame height looked at, from the edge. */
const BAND: Record<OcrBand, [number, number]> = { bottom: [0.72, 0.97], top: [0.03, 0.28] };
/** Below this share of text pixels the band holds no subtitle. */
const MIN_INK = 0.004;
/** Columns compared to tell whether the band changed since the last look. */
const SIGNATURE_COLUMNS = 96;

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

/** Content script side: reads the YouTube player's frame. */
export function createYouTubeOcr(
  doc: Document,
  send: (message: OcrReadRequest) => Promise<unknown>,
): OcrAdapter {
  const frame = doc.createElement('canvas');
  const out = doc.createElement('canvas');
  let last: number[] | null = null;
  let lastBand: OcrBand | null = null;

  let warm: Promise<void> | null = null;
  return {
    prepare() {
      if (!warm) {
        out.width = 64;
        out.height = 16;
        const g = out.getContext('2d');
        if (g) {
          g.fillStyle = '#fff';
          g.fillRect(0, 0, 64, 16);
        }
        warm = send({ type: OCR_READ, image: out.toDataURL('image/png') }).then(
          () => undefined,
          () => {
            warm = null;
          },
        );
      }
      return warm;
    },
    async read(band: OcrBand): Promise<OcrReading | null | 'blocked'> {
      const video = doc.querySelector<HTMLVideoElement>('#movie_player video, video');
      if (!video || video.videoWidth === 0 || video.readyState < 2) return null;
      const [from, to] = BAND[band];
      const sx = 0;
      const sy = Math.round(video.videoHeight * from);
      const sw = video.videoWidth;
      const sh = Math.round(video.videoHeight * (to - from));
      const w = Math.min(READ_WIDTH, sw);
      const h = Math.max(1, Math.round((sh * w) / sw));
      frame.width = w;
      frame.height = h;
      const g = frame.getContext('2d', { willReadFrequently: true });
      if (!g) return null;
      let pixels: ImageData;
      try {
        g.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
        pixels = g.getImageData(0, 0, w, h);
      } catch {
        // A protected video's pixels cannot be read.
        return 'blocked';
      }
      // Black text on white, and a per-column ink count to spot an unchanged band.
      const d = pixels.data;
      const mask = textMask(d, w, h);
      const sig = new Array<number>(SIGNATURE_COLUMNS).fill(0);
      let ink = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = y * w + x;
          const text = mask[p] === 1;
          const v = text ? 0 : 255;
          d[p * 4] = v;
          d[p * 4 + 1] = v;
          d[p * 4 + 2] = v;
          d[p * 4 + 3] = 255;
          if (text) {
            ink++;
            const col = Math.floor((x * SIGNATURE_COLUMNS) / w);
            sig[col] = (sig[col] ?? 0) + 1;
          }
        }
      }
      const unchanged =
        last !== null &&
        lastBand === band &&
        sig.reduce((sum, n, i) => sum + Math.abs(n - (last?.[i] ?? 0)), 0) < ink * 0.03 + 4;
      last = sig;
      lastBand = band;
      if (unchanged) return null;
      if (ink < w * h * MIN_INK) return { text: '', confidence: 0 };
      out.width = w;
      out.height = h;
      out.getContext('2d')?.putImageData(pixels, 0, 0);
      const res = await send({ type: OCR_READ, image: out.toDataURL('image/png') });
      if (!isOcrResponse(res) || !res.ok) return null;
      return { text: res.text, confidence: res.confidence };
    },
  };
}
