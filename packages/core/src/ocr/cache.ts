import type { StorageAdapter } from '../adapters';
import type { Cue } from '../types';
import { MAX_OCR_TEXT } from './frame';

/**
 * Sentences read from the picture, kept on the device per video so reopening it shows them
 * again without reading the video a second time. Only the most recent videos are kept.
 */

const INDEX_KEY = 'ocr:index';
const VIDEO_ID = /^[\w-]{6,20}$/;
/** Videos kept. */
export const OCR_CACHE_VIDEOS = 15;
/** Lines kept per video (hours of video). */
export const OCR_CACHE_CUES = 1500;

const keyOf = (videoId: string) => `ocr:${videoId}`;

function isCue(v: unknown): v is Cue {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.start === 'number' &&
    typeof c.end === 'number' &&
    Number.isFinite(c.start) &&
    Number.isFinite(c.end) &&
    c.start >= 0 &&
    c.end >= c.start &&
    typeof c.text === 'string' &&
    c.text.length > 0 &&
    c.text.length <= MAX_OCR_TEXT
  );
}

/** Index entries: [videoId, last used], newest first. */
function readIndex(raw: unknown): [string, number][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is [string, number] =>
        Array.isArray(e) &&
        typeof e[0] === 'string' &&
        VIDEO_ID.test(e[0]) &&
        typeof e[1] === 'number' &&
        Number.isFinite(e[1]),
    )
    .slice(0, OCR_CACHE_VIDEOS);
}

/** The lines saved for a video (checked), or null. */
export async function loadOcrCues(area: StorageAdapter, videoId: string): Promise<Cue[] | null> {
  if (!VIDEO_ID.test(videoId)) return null;
  const raw = await area.get<unknown>(keyOf(videoId));
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cues = raw.slice(0, OCR_CACHE_CUES).filter(isCue);
  return cues.length ? cues.map(({ start, end, text }) => ({ start, end, text })) : null;
}

/** Saves a video's lines and forgets the oldest videos beyond OCR_CACHE_VIDEOS. */
export async function saveOcrCues(
  area: StorageAdapter,
  videoId: string,
  cues: readonly Cue[],
  now = Date.now(),
): Promise<void> {
  if (!VIDEO_ID.test(videoId) || cues.length === 0) return;
  const kept = cues
    .slice(0, OCR_CACHE_CUES)
    .map(({ start, end, text }) => ({ start, end, text: text.slice(0, MAX_OCR_TEXT) }));
  await area.set(keyOf(videoId), kept);
  const index = readIndex(await area.get<unknown>(INDEX_KEY)).filter(([id]) => id !== videoId);
  index.unshift([videoId, now]);
  for (const [id] of index.splice(OCR_CACHE_VIDEOS)) await area.remove(keyOf(id));
  await area.set(INDEX_KEY, index);
}
