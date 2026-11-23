/**
 * Observes, read-only, the caption responses the YouTube player itself requested from
 * /api/timedtext. It never issues requests, never changes requests or responses, and never
 * touches tokens. Used by the extension (page MAIN world) and the Android app (embed frame).
 */
export function observeCaptionResponses(
  win: Window & typeof globalThis,
  onResponse: (url: string, body: string) => void,
): () => void {
  // XMLHttpRequest: remember the URL in open(), read the body on load.
  const XHR = win.XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const urls = new WeakMap<XMLHttpRequest, string>();
  const onLoad = function (this: XMLHttpRequest) {
    const url = urls.get(this);
    if (!url) return;
    try {
      if (this.responseType === '' || this.responseType === 'text') {
        onResponse(url, this.responseText);
      } else if (this.responseType === 'json' && this.response !== null) {
        onResponse(url, JSON.stringify(this.response));
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
        .then((body) => {
          try {
            onResponse(url, body);
          } catch {
            // Same as above.
          }
        })
        .catch(() => undefined);
    }
    return promise;
  };
  win.fetch = patchedFetch;

  return () => {
    XHR.open = originalOpen;
    win.fetch = originalFetch;
  };
}
