/** Metadata read from a player caption request URL. Only harmless fields are kept. */
export interface TimedTextInfo {
  videoId: string;
  lang: string;
  kind: string;
  tlang: string;
}

const VIDEO_ID = /^[\w-]{6,20}$/;
const LANG = /^[\w-]{1,20}$/;

/**
 * Returns caption metadata when `url` is a YouTube /api/timedtext request, else null.
 * Deliberately drops every other parameter (pot, signature, expire...): tokens are never
 * read, copied or forwarded.
 */
export function parseTimedTextUrl(
  url: string,
  base = 'https://www.youtube.com',
): TimedTextInfo | null {
  let u: URL;
  try {
    u = new URL(url, base);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/.test(u.hostname) || u.pathname !== '/api/timedtext') return null;
  const videoId = u.searchParams.get('v') ?? '';
  const lang = u.searchParams.get('lang') ?? '';
  if (!VIDEO_ID.test(videoId) || !LANG.test(lang)) return null;
  const kind = u.searchParams.get('kind') === 'asr' ? 'asr' : '';
  const tlang = u.searchParams.get('tlang') ?? '';
  return { videoId, lang, kind, tlang: LANG.test(tlang) ? tlang : '' };
}

/** Checks caption metadata received from another context (frame, native side, IPC). */
export function isTimedTextInfo(v: unknown): v is TimedTextInfo {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.videoId === 'string' &&
    VIDEO_ID.test(r.videoId) &&
    typeof r.lang === 'string' &&
    LANG.test(r.lang) &&
    (r.kind === '' || r.kind === 'asr') &&
    (r.tlang === '' || (typeof r.tlang === 'string' && LANG.test(r.tlang)))
  );
}

/** Video id of a watch page URL, or null for other pages. */
export function videoIdFromLocation(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.pathname !== '/watch') return null;
  const v = u.searchParams.get('v') ?? '';
  return VIDEO_ID.test(v) ? v : null;
}

/** Captured bodies larger than this are ignored (a 3-hour json3 track is ~3 MB). */
export const MAX_CAPTION_BYTES = 8 * 1024 * 1024;
