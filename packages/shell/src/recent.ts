/** "Video gần đây" on the home screen, kept on this device. */
export const RECENT_KEY = 'recentVideos';
export const MAX_RECENT = 8;

export interface RecentVideo {
  id: string;
  title: string;
  channel: string;
  /** Furthest sentence reached ("đã học N câu"). */
  learned: number;
  openedAt: number;
}

const VIDEO_ID = /^[\w-]{11}$/;

export function isRecent(v: unknown): v is RecentVideo {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    VIDEO_ID.test(r.id) &&
    typeof r.title === 'string' &&
    r.title.length <= 300 &&
    typeof r.channel === 'string' &&
    r.channel.length <= 200 &&
    Number.isInteger(r.learned) &&
    (r.learned as number) >= 0 &&
    typeof r.openedAt === 'number'
  );
}

/** Moves (or adds) a video to the top, newest first, at most MAX_RECENT. */
export function rememberVideo(
  list: readonly RecentVideo[],
  video: { id: string },
  now = Date.now(),
): RecentVideo[] {
  const old = list.find((r) => r.id === video.id);
  const entry: RecentVideo = old
    ? { ...old, openedAt: now }
    : { id: video.id, title: '', channel: '', learned: 0, openedAt: now };
  return [entry, ...list.filter((r) => r.id !== video.id)].slice(0, MAX_RECENT);
}
