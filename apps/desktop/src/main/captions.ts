import {
  MAX_CAPTION_BYTES,
  parseTimedTextUrl,
  type TimedTextInfo,
} from '@shadow-lingo/core/timedtext';

/**
 * Reads the caption responses the embedded YouTube player fetches for itself, through the
 * Chrome DevTools Protocol of the app's own window (Electron's webContents.debugger).
 * Same rule as the extension: only the player's own responses are read; no request is
 * made, and no token is read, copied or replayed. The player sits in a cross-site iframe,
 * so its network is reached by auto-attaching to child targets.
 */

/** The parts of Electron's Debugger used here (a fake in tests). */
export interface DebuggerLike {
  attach(protocolVersion?: string): void;
  detach(): void;
  isAttached(): boolean;
  sendCommand(method: string, params?: object, sessionId?: string): Promise<unknown>;
  on(
    event: 'message',
    listener: (event: unknown, method: string, params: unknown, sessionId?: string) => void,
  ): void;
  removeListener(
    event: 'message',
    listener: (event: unknown, method: string, params: unknown, sessionId?: string) => void,
  ): void;
}

export interface CaptionPayload extends TimedTextInfo {
  body: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** How often the embed is asked whether it plays an ad. */
export const AD_POLL_MS = 1000;
/** Read-only check of the player's own "ad-showing" class (the extension reads the same). */
export const AD_EXPRESSION = "!!document.querySelector('.html5-video-player.ad-showing')";

/** Starts watching; returns a function that stops and detaches. */
export function watchCaptions(
  dbg: DebuggerLike,
  onCaption: (c: CaptionPayload) => void,
  onAd: (showing: boolean) => void = () => undefined,
): () => void {
  // The YouTube embed's session, to read whether it shows an ad.
  let embed: string | undefined;
  let adShowing = false;
  const pollAd = () => {
    if (!embed) return;
    dbg
      .sendCommand('Runtime.evaluate', { expression: AD_EXPRESSION, returnByValue: true }, embed)
      .then((res) => {
        const r = isRecord(res) && isRecord(res.result) ? res.result.value : undefined;
        if (typeof r === 'boolean' && r !== adShowing) {
          adShowing = r;
          onAd(r);
        }
      })
      .catch(() => undefined);
  };
  const adTimer = setInterval(pollAd, AD_POLL_MS);
  // requestId → caption info, per session, until the body has arrived.
  const pending = new Map<string, TimedTextInfo>();
  const key = (sessionId: string | undefined, requestId: string) =>
    `${sessionId ?? ''}|${requestId}`;

  const enable = (sessionId?: string) => {
    void dbg
      .sendCommand('Network.enable', { maxResourceBufferSize: MAX_CAPTION_BYTES }, sessionId)
      .catch(() => undefined);
    void dbg
      .sendCommand(
        'Target.setAutoAttach',
        { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
        sessionId,
      )
      .catch(() => undefined);
  };

  const listener = (_e: unknown, method: string, params: unknown, sessionId?: string) => {
    if (!isRecord(params)) return;
    if (method === 'Target.attachedToTarget') {
      const child = typeof params.sessionId === 'string' ? params.sessionId : undefined;
      if (!child) return;
      // The app page's own iframe is the YouTube embed (its URL may not be set yet here);
      // frames inside it (ads, trackers) attach through its session and are not it.
      const info = params.targetInfo;
      if (sessionId === undefined && isRecord(info) && info.type === 'iframe') embed = child;
      enable(child);
      return;
    }
    if (method === 'Target.detachedFromTarget' && params.sessionId === embed) {
      embed = undefined;
      if (adShowing) {
        adShowing = false;
        onAd(false);
      }
      return;
    }
    if (method === 'Network.responseReceived') {
      const response = params.response;
      const requestId = params.requestId;
      if (!isRecord(response) || typeof response.url !== 'string' || typeof requestId !== 'string')
        return;
      const info = parseTimedTextUrl(response.url);
      if (info && response.status === 200) pending.set(key(sessionId, requestId), info);
      return;
    }
    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      const requestId = params.requestId;
      if (typeof requestId !== 'string') return;
      const k = key(sessionId, requestId);
      const info = pending.get(k);
      pending.delete(k);
      if (!info || method === 'Network.loadingFailed') return;
      dbg
        .sendCommand('Network.getResponseBody', { requestId }, sessionId)
        .then((res) => {
          if (!isRecord(res) || typeof res.body !== 'string' || res.base64Encoded === true) return;
          if (!res.body || res.body.length > MAX_CAPTION_BYTES) return;
          onCaption({ ...info, body: res.body });
        })
        .catch(() => undefined);
    }
  };

  if (!dbg.isAttached()) dbg.attach('1.3');
  dbg.on('message', listener);
  enable();
  return () => {
    clearInterval(adTimer);
    dbg.removeListener('message', listener);
    pending.clear();
    try {
      if (dbg.isAttached()) dbg.detach();
    } catch {
      // Window already closed.
    }
  };
}
