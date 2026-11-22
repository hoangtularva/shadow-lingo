/** YouTube video ids are 11 characters of [A-Za-z0-9_-]. */
const VIDEO_ID = /^[\w-]{11}$/;

/**
 * The video id in a link the learner pasted: watch?v=, youtu.be/, /shorts/, /embed/, /live/,
 * with or without "https://" and "www.", on youtube.com, m.youtube.com, music.youtube.com
 * or youtube-nocookie.com. A bare 11-character id is accepted too.
 */
export function videoIdFromInput(input: string): string | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

/** Start time in a pasted link (t=90, t=1m30s, start=90), in seconds. */
export function startFromInput(input: string): number {
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return 0;
  }
  const raw = url.searchParams.get('t') ?? url.searchParams.get('start') ?? '';
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw);
  if (!raw || !m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * The official embed for a video. enablejsapi lets our own postMessage client drive it
 * (no YouTube script runs in the app's page); origin must match the page that embeds it.
 */
export function embedUrl(videoId: string, origin: string, start = 0): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    origin,
    rel: '0',
    playsinline: '1',
    cc_load_policy: '1',
    cc_lang_pref: 'en',
    hl: 'vi',
  });
  if (start > 0) params.set('start', String(Math.floor(start)));
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

/** The video on youtube.com (the "Mở trên YouTube" link). */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
