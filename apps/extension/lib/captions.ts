import type { CaptionsAdapter, CaptionsState } from '@shadow-lingo/core';

/** YouTube's own CC button in the player controls. */
export const CC_BUTTON_SELECTOR = '#movie_player .ytp-subtitles-button';

/**
 * The player's captions switch, read from its CC button (aria-pressed). Turning captions
 * on presses that button, as the learner would; nothing in the player is hidden or changed.
 */
export function createYouTubeCaptions(doc: Document): CaptionsAdapter {
  const button = (): HTMLElement | null => {
    const el = doc.querySelector(CC_BUTTON_SELECTOR);
    return el instanceof HTMLElement ? el : null;
  };
  const getState = (): CaptionsState => {
    const pressed = button()?.getAttribute('aria-pressed');
    if (pressed === 'true') return 'on';
    if (pressed === 'false') return 'off';
    return 'unknown';
  };
  return {
    getState,
    turnOn() {
      const b = button();
      if (b && b.getAttribute('aria-pressed') === 'false') b.click();
    },
    onChange(listener) {
      let last = getState();
      const check = () => {
        const next = getState();
        if (next !== last) {
          last = next;
          listener(next);
        }
      };
      // The button may be created late or replaced: watch the whole document, cheaply.
      const mo = new MutationObserver(check);
      mo.observe(doc.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-pressed'],
      });
      return () => mo.disconnect();
    },
  };
}
