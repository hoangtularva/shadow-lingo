import type { PlayerAdapter } from '@shadow-lingo/core';

/**
 * PlayerAdapter for the official YouTube embed, spoken to over the documented postMessage
 * protocol of the IFrame Player API (the one its own iframe_api script uses), so no YouTube
 * script ever runs in the app's page.
 */

export const YOUTUBE_ORIGIN = 'https://www.youtube.com';

/** Player states from the API: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. */
type PlayerState = -1 | 0 | 1 | 2 | 3 | 5;

interface Info {
  currentTime?: number;
  playerState?: PlayerState;
  playbackRate?: number;
  videoData?: { video_id?: string; title?: string; author?: string };
}

export interface EmbedTarget {
  postMessage(message: string, targetOrigin: string): void;
}

export interface MessageSource {
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Reads one message from the embed; anything else (other frames, junk) gives null. */
export function parsePlayerMessage(e: { origin: string; data: unknown }): Info | null {
  if (e.origin !== YOUTUBE_ORIGIN || typeof e.data !== 'string' || e.data.length > 200_000) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(e.data);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  // State and rate changes come as their own events with a bare number.
  if (data.event === 'onStateChange' && typeof data.info === 'number') {
    return [-1, 0, 1, 2, 3, 5].includes(data.info) ? { playerState: data.info as PlayerState } : {};
  }
  if (data.event === 'onPlaybackRateChange' && typeof data.info === 'number') {
    return data.info > 0 && data.info <= 4 ? { playbackRate: data.info } : {};
  }
  if (!isRecord(data.info)) return null;
  if (data.event !== 'infoDelivery' && data.event !== 'initialDelivery') return null;
  const i = data.info;
  const out: Info = {};
  if (typeof i.currentTime === 'number' && Number.isFinite(i.currentTime)) {
    out.currentTime = Math.max(0, i.currentTime);
  }
  if (typeof i.playerState === 'number' && [-1, 0, 1, 2, 3, 5].includes(i.playerState)) {
    out.playerState = i.playerState as PlayerState;
  }
  if (typeof i.playbackRate === 'number' && i.playbackRate > 0 && i.playbackRate <= 4) {
    out.playbackRate = i.playbackRate;
  }
  if (isRecord(i.videoData)) {
    const v = i.videoData;
    out.videoData = {
      ...(typeof v.video_id === 'string' ? { video_id: v.video_id.slice(0, 64) } : {}),
      ...(typeof v.title === 'string' ? { title: v.title.slice(0, 300) } : {}),
      ...(typeof v.author === 'string' ? { author: v.author.slice(0, 200) } : {}),
    };
  }
  return out;
}

export interface EmbedPlayer extends PlayerAdapter {
  /** Starts listening; call once the iframe has loaded. */
  connect(): void;
  /** Title the embed reported for the current video, if any. */
  getTitle(): string;
  /** Title and channel as the embed reports them. */
  onInfo(listener: (info: { title?: string; author?: string }) => void): () => void;
  dispose(): void;
}

/**
 * `frame` is the iframe's contentWindow; `source` the window that receives its messages.
 * Times in the PlayerAdapter are milliseconds, the API speaks seconds.
 */
export function createEmbedPlayer(
  frame: () => EmbedTarget | null,
  source: MessageSource,
  id = 1,
): EmbedPlayer {
  let time = 0;
  let timeAt = 0;
  let state: PlayerState = -1;
  let rate = 1;
  let title = '';
  const listeners = new Set<(ms: number) => void>();
  const infoListeners = new Set<(info: { title?: string; author?: string }) => void>();
  let listenTimer: ReturnType<typeof setInterval> | null = null;
  // Between the embed's reports (about 4 a second), report extrapolated time while playing
  // so the spoken sentence changes on time.
  let tick: ReturnType<typeof setInterval> | null = null;
  let author = '';

  const send = (payload: Record<string, unknown>) =>
    frame()?.postMessage(JSON.stringify({ ...payload, id, channel: 'widget' }), YOUTUBE_ORIGIN);
  const command = (func: string, args: unknown[] = []) => send({ event: 'command', func, args });

  // The embed reports about four times a second; between reports, extrapolate while playing.
  const now = () => (state === 1 ? time + (performance.now() - timeAt) * rate : time);

  const onMessage = (e: MessageEvent) => {
    const info = parsePlayerMessage(e);
    if (!info) return;
    if (listenTimer) {
      clearInterval(listenTimer);
      listenTimer = null;
      // The embed reports state and rate changes only to listeners that ask for them.
      command('addEventListener', ['onStateChange']);
      command('addEventListener', ['onPlaybackRateChange']);
    }
    if (info.currentTime !== undefined) {
      time = info.currentTime * 1000;
      timeAt = performance.now();
    }
    if (info.playerState !== undefined) state = info.playerState;
    if (info.playbackRate !== undefined) rate = info.playbackRate;
    const v = info.videoData;
    if ((v?.title && v.title !== title) || (v?.author && v.author !== author)) {
      if (v.title) title = v.title;
      if (v.author) author = v.author;
      for (const l of infoListeners) l({ title, author });
    }
    if (info.currentTime !== undefined) for (const l of listeners) l(time);
  };

  return {
    connect() {
      source.addEventListener('message', onMessage);
      // The embed answers "listening" once it is ready; ask until it does.
      send({ event: 'listening' });
      listenTimer = setInterval(() => send({ event: 'listening' }), 250);
      tick = setInterval(() => {
        if (state !== 1) return;
        const ms = now();
        for (const l of listeners) l(ms);
      }, 100);
    },
    getCurrentTime: () => now(),
    seekTo(ms) {
      time = Math.max(0, ms);
      timeAt = performance.now();
      command('seekTo', [time / 1000, true]);
    },
    play() {
      state = 1;
      timeAt = performance.now();
      command('playVideo');
    },
    pause() {
      time = now();
      state = 2;
      command('pauseVideo');
    },
    isPaused: () => state !== 1,
    getPlaybackRate: () => rate,
    setPlaybackRate(r) {
      rate = r;
      command('setPlaybackRate', [r]);
    },
    onTimeUpdate(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getTitle: () => title,
    onInfo(listener) {
      infoListeners.add(listener);
      return () => infoListeners.delete(listener);
    },
    dispose() {
      if (tick) clearInterval(tick);
      tick = null;
      infoListeners.clear();
      source.removeEventListener('message', onMessage);
      if (listenTimer) clearInterval(listenTimer);
      listenTimer = null;
      listeners.clear();
    },
  };
}
