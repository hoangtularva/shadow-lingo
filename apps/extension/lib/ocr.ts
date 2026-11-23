import {
  BandReader,
  MAX_OCR_TEXT,
  OCR_BANDS,
  type OcrAdapter,
  type OcrBand,
  type OcrReading,
} from '@shadow-lingo/core';

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
    v.text.length <= MAX_OCR_TEXT &&
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

/** Content script side: reads the YouTube player's frame. */
export function createYouTubeOcr(
  doc: Document,
  send: (message: OcrReadRequest) => Promise<unknown>,
): OcrAdapter {
  const reader = new BandReader(doc);
  let warm: Promise<void> | null = null;
  return {
    prepare() {
      warm ??= send({ type: OCR_READ, image: reader.blank() }).then(
        () => undefined,
        () => {
          warm = null;
        },
      );
      return warm;
    },
    async read(band: OcrBand): Promise<OcrReading | null | 'blocked'> {
      const video = doc.querySelector<HTMLVideoElement>('#movie_player video, video');
      if (!video || video.videoWidth === 0 || video.readyState < 2) return null;
      const [from, to] = OCR_BANDS[band];
      const result = reader.read(
        video,
        {
          sx: 0,
          sy: Math.round(video.videoHeight * from),
          sw: video.videoWidth,
          sh: Math.round(video.videoHeight * (to - from)),
        },
        band,
      );
      if (result.kind === 'blocked') return 'blocked';
      if (result.kind === 'unchanged') return null;
      if (result.kind === 'empty') return { text: '', confidence: 0 };
      const res = await send({ type: OCR_READ, image: result.png });
      if (!isOcrResponse(res) || !res.ok) return null;
      return { text: res.text, confidence: res.confidence };
    },
  };
}
