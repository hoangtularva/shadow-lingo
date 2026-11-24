import { CAPTION_MESSAGE, isReplayMessage, type CaptionMessage } from './messages';
import { observeCaptionResponses } from '@shadow-lingo/core/caption-hook';
import { MAX_CAPTION_BYTES, parseTimedTextUrl } from './timedtext';

const BUFFER_SIZE = 12;
/** Marks a page that already has the hook (it is injected again into open tabs on install). */
const INSTALLED = Symbol.for('shadow-lingo:caption-hook');

/**
 * Runs in the page's MAIN world. Observes, read-only, the caption responses the player
 * itself requested from /api/timedtext and forwards their text to the content script.
 * It never issues requests, never changes requests or responses, and never touches tokens.
 */
export function installCaptionHook(win: Window & typeof globalThis): () => void {
  if (Reflect.has(win, INSTALLED)) return () => undefined;
  Object.defineProperty(win, INSTALLED, { value: true, configurable: true });
  const buffer: CaptionMessage[] = [];

  const emit = (url: string, body: string) => {
    const info = parseTimedTextUrl(url, win.location.href);
    if (!info || !body || body.length > MAX_CAPTION_BYTES) return;
    const msg: CaptionMessage = { source: CAPTION_MESSAGE, ...info, body };
    buffer.push(msg);
    if (buffer.length > BUFFER_SIZE) buffer.shift();
    win.postMessage(msg, win.location.origin);
  };

  const stop = observeCaptionResponses(win, emit);

  // The content script loads later than this hook; it asks for anything already seen.
  const onMessage = (e: MessageEvent<unknown>) => {
    if (e.source !== win || !isReplayMessage(e.data)) return;
    for (const msg of buffer) win.postMessage(msg, win.location.origin);
  };
  win.addEventListener('message', onMessage);

  return () => {
    stop();
    win.removeEventListener('message', onMessage);
    Reflect.deleteProperty(win, INSTALLED);
  };
}
