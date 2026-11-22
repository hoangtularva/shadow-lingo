/**
 * Messages between the MAIN-world caption hook and the isolated content script,
 * sent with window.postMessage on the page's own origin.
 */

export const CAPTION_MESSAGE = 'shadow-lingo:caption';
export const REPLAY_MESSAGE = 'shadow-lingo:replay';

/** Only these fields leave the MAIN world. Tokens and other URL params never do. */
export interface CaptionMessage {
  source: typeof CAPTION_MESSAGE;
  videoId: string;
  lang: string;
  /** "asr" for auto-generated captions, "" for human ones. */
  kind: string;
  /** Present when the player shows a translated track (tlang). */
  tlang: string;
  body: string;
}

export interface ReplayMessage {
  source: typeof REPLAY_MESSAGE;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Any script on the page can post messages: keep fields to sane sizes so a forged
 * message cannot make the panel parse megabytes of junk.
 */
export const MAX_CAPTION_BODY = 8_000_000;
const VIDEO_ID = /^[\w-]{1,64}$/;
const SHORT = /^[\w-]{0,32}$/;

export function isCaptionMessage(v: unknown): v is CaptionMessage {
  return (
    isRecord(v) &&
    v.source === CAPTION_MESSAGE &&
    typeof v.videoId === 'string' &&
    VIDEO_ID.test(v.videoId) &&
    typeof v.lang === 'string' &&
    SHORT.test(v.lang) &&
    typeof v.kind === 'string' &&
    SHORT.test(v.kind) &&
    typeof v.tlang === 'string' &&
    SHORT.test(v.tlang) &&
    typeof v.body === 'string' &&
    v.body.length <= MAX_CAPTION_BODY
  );
}

/** Sent by the background when the toolbar icon is clicked: show or hide the panel. */
export const TOGGLE_PANEL_MESSAGE = 'shadow-lingo:toggle-panel';

export interface TogglePanelMessage {
  type: typeof TOGGLE_PANEL_MESSAGE;
}

export function isTogglePanelMessage(v: unknown): v is TogglePanelMessage {
  return isRecord(v) && v.type === TOGGLE_PANEL_MESSAGE;
}

export function isReplayMessage(v: unknown): v is ReplayMessage {
  return isRecord(v) && v.source === REPLAY_MESSAGE;
}
