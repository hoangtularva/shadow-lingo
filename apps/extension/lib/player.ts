import type { PlayerAdapter } from '@shadow-lingo/core';

export const VIDEO_SELECTOR = '#movie_player video.html5-main-video, video.html5-main-video';
export const PLAYER_SELECTOR = '#movie_player';

/**
 * PlayerAdapter over YouTube's <video> element. The element is looked up on each call
 * because YouTube may replace it; time events are caught on the document (capture phase).
 */
export function createYouTubePlayer(doc: Document): PlayerAdapter {
  const video = (): HTMLVideoElement | null => {
    const el = doc.querySelector(VIDEO_SELECTOR);
    return el instanceof HTMLVideoElement ? el : null;
  };
  return {
    getCurrentTime: () => (video()?.currentTime ?? 0) * 1000,
    seekTo(ms) {
      const v = video();
      if (v) v.currentTime = Math.max(0, ms / 1000);
    },
    play() {
      void video()
        ?.play()
        .catch(() => undefined);
    },
    pause() {
      video()?.pause();
    },
    isPaused: () => video()?.paused ?? true,
    getPlaybackRate: () => video()?.playbackRate ?? 1,
    setPlaybackRate(rate) {
      const v = video();
      if (v) v.playbackRate = rate;
    },
    onTimeUpdate(listener) {
      const handler = (e: Event) => {
        const v = video();
        if (v && e.target === v) listener(v.currentTime * 1000);
      };
      for (const type of ['timeupdate', 'seeked', 'loadedmetadata']) {
        doc.addEventListener(type, handler, true);
      }
      return () => {
        for (const type of ['timeupdate', 'seeked', 'loadedmetadata']) {
          doc.removeEventListener(type, handler, true);
        }
      };
    },
  };
}
