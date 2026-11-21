import { CAPTION_MESSAGE, isReplayMessage, type CaptionMessage } from './messages';
import { MAX_CAPTION_BYTES, parseTimedTextUrl } from './timedtext';

const BUFFER_SIZE = 12;

/**
 * Runs in the page's MAIN world. Observes, read-only, the caption responses the player
 * itself requested from /api/timedtext and forwards their text to the content script.
 * It never issues requests, never changes requests or responses, and never touches tokens.
 */
export function installCaptionHook(win: Window & typeof globalThis): () => void {
  const buffer: CaptionMessage[] = [];

  const emit = (url: string, body: string) => {
    const info = parseTimedTextUrl(url, win.location.href);
    if (!info || !body || body.length > MAX_CAPTION_BYTES) return;
    const msg: CaptionMessage = { source: CAPTION_MESSAGE, ...info, body };
    buffer.push(msg);
    if (buffer.length > BUFFER_SIZE) buffer.shift();
    win.postMessage(msg, win.location.origin);
  };

  // XMLHttpRequest: remember the URL in open(), read the body on load.
  const XHR = win.XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const urls = new WeakMap<XMLHttpRequest, string>();
  const onLoad = function (this: XMLHttpRequest) {
    const url = urls.get(this);
    if (!url) return;
    try {
      if (this.responseType === '' || this.responseType === 'text') emit(url, this.responseText);
      else if (this.responseType === 'json' && this.response !== null) {
        emit(url, JSON.stringify(this.response));
      }
    } catch {
      // Reading the body must never break the player.
    }
  };
  function patchedOpen(this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest['open']>) {
    const rawUrl = args[1];
    const url = typeof rawUrl === 'string' ? rawUrl : rawUrl.href;
    if (url.includes('/api/timedtext')) {
      if (!urls.has(this)) this.addEventListener('load', onLoad);
      urls.set(this, url);
    } else {
      urls.delete(this);
    }
    return originalOpen.apply(this, args);
  }
  XHR.open = patchedOpen as XMLHttpRequest['open'];

  // fetch: read a clone of the response; the player gets the original untouched.
  const originalFetch = win.fetch;
  const patchedFetch: typeof fetch = (input, init) => {
    const promise = originalFetch.call(win, input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/timedtext')) {
      promise
        .then((res) => (res.ok ? res.clone().text() : ''))
        .then((body) => emit(url, body))
        .catch(() => undefined);
    }
    return promise;
  };
  win.fetch = patchedFetch;

  // The content script loads later than this hook; it asks for anything already seen.
  const onMessage = (e: MessageEvent<unknown>) => {
    if (e.source !== win || !isReplayMessage(e.data)) return;
    for (const msg of buffer) win.postMessage(msg, win.location.origin);
  };
  win.addEventListener('message', onMessage);

  return () => {
    XHR.open = originalOpen;
    win.fetch = originalFetch;
    win.removeEventListener('message', onMessage);
  };
}
