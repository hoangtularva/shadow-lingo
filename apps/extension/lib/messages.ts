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

export function isCaptionMessage(v: unknown): v is CaptionMessage {
  return (
    isRecord(v) &&
    v.source === CAPTION_MESSAGE &&
    typeof v.videoId === 'string' &&
    typeof v.lang === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.tlang === 'string' &&
    typeof v.body === 'string'
  );
}

export function isReplayMessage(v: unknown): v is ReplayMessage {
  return isRecord(v) && v.source === REPLAY_MESSAGE;
}
