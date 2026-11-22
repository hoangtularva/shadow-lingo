import type { AdsAdapter } from '@shadow-lingo/core';

const PLAYER = '#movie_player';
/** How often to look for a new player element (YouTube may replace it on navigation). */
const RESCAN_MS = 1000;

/**
 * Reads whether YouTube's player shows an ad (its own "ad-showing" class). Read only:
 * ads are never blocked, hidden, skipped or changed.
 */
export function createYouTubeAds(doc: Document): AdsAdapter {
  const player = () => doc.querySelector(PLAYER);
  const showing = () => player()?.classList.contains('ad-showing') ?? false;
  return {
    isShowing: showing,
    onChange(listener) {
      let last = showing();
      let watched: Element | null = null;
      const check = () => {
        const p = player();
        if (p && p !== watched) {
          observer.disconnect();
          observer.observe(p, { attributes: true, attributeFilter: ['class'] });
          watched = p;
        }
        const now = showing();
        if (now !== last) {
          last = now;
          listener(now);
        }
      };
      const observer = new MutationObserver(check);
      const timer = setInterval(check, RESCAN_MS);
      check();
      return () => {
        observer.disconnect();
        clearInterval(timer);
      };
    },
  };
}
