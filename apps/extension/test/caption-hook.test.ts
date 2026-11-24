import { afterEach, describe, expect, it, vi } from 'vitest';
import { installCaptionHook } from '@/lib/caption-hook';
import type { CaptionMessage } from '@/lib/messages';

/** Minimal XHR that "loads" a canned body when sent. */
class FakeXHR extends EventTarget {
  static bodies = new Map<string, string>();
  responseType: XMLHttpRequestResponseType = '';
  responseText = '';
  response: unknown = null;
  url = '';
  open(_method: string, url: string | URL) {
    this.url = String(url);
  }
  send() {
    const body = [...FakeXHR.bodies.entries()].find(([k]) => this.url.includes(k))?.[1] ?? '';
    this.responseText = body;
    this.response = this.responseType === 'json' ? JSON.parse(body || 'null') : body;
    this.dispatchEvent(new Event('load'));
  }
}

function makeWindow() {
  const posted: unknown[] = [];
  const listeners = new Set<(e: MessageEvent<unknown>) => void>();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = [...FakeXHR.bodies.entries()].find(([k]) => url.includes(k))?.[1] ?? '';
    return Promise.resolve(new Response(body, { status: 200 }));
  });
  const win = {
    XMLHttpRequest: FakeXHR,
    fetch: fetchMock,
    location: {
      href: 'https://www.youtube.com/watch?v=video000001',
      origin: 'https://www.youtube.com',
    },
    postMessage: (data: unknown) => {
      posted.push(data);
    },
    addEventListener: (_t: string, l: (e: MessageEvent<unknown>) => void) => listeners.add(l),
    removeEventListener: (_t: string, l: (e: MessageEvent<unknown>) => void) => listeners.delete(l),
  };
  const typed = win as unknown as Window & typeof globalThis;
  const sendMessage = (data: unknown) => {
    for (const l of listeners) l({ source: typed, data } as unknown as MessageEvent<unknown>);
  };
  return { win: typed, posted, sendMessage, fetchMock, listeners };
}

const BODY = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hi.' }] }],
});
const URL_A = '/api/timedtext?v=video000001&lang=en&fmt=json3&pot=TOKEN123';

afterEach(() => {
  FakeXHR.bodies.clear();
});

describe('installCaptionHook', () => {
  it('installs once per page, even when added again to an open tab', () => {
    FakeXHR.bodies.set('timedtext', BODY);
    const { win, posted } = makeWindow();
    const uninstall = installCaptionHook(win);
    const again = installCaptionHook(win);
    const xhr = new win.XMLHttpRequest();
    xhr.open('GET', URL_A);
    xhr.send();
    expect(posted).toHaveLength(1);
    again();
    uninstall();
    // Uninstalled: a later install works again.
    installCaptionHook(win)();
  });

  it('forwards XHR caption bodies without the token', () => {
    FakeXHR.bodies.set('timedtext', BODY);
    const { win, posted } = makeWindow();
    installCaptionHook(win);
    const xhr = new win.XMLHttpRequest();
    xhr.open('GET', URL_A);
    xhr.send();
    expect(posted).toHaveLength(1);
    const msg = posted[0] as CaptionMessage;
    expect(msg).toMatchObject({ videoId: 'video000001', lang: 'en', kind: '', body: BODY });
    expect(JSON.stringify(msg)).not.toContain('TOKEN123');
  });

  it('handles json responseType and ignores other requests', () => {
    FakeXHR.bodies.set('timedtext', BODY);
    FakeXHR.bodies.set('/api/stats', 'nope');
    const { win, posted } = makeWindow();
    installCaptionHook(win);
    const a = new win.XMLHttpRequest();
    a.responseType = 'json';
    a.open('GET', URL_A);
    a.send();
    const b = new win.XMLHttpRequest();
    b.open('GET', '/api/stats?v=video000001');
    b.send();
    expect(posted).toHaveLength(1);
    expect((posted[0] as CaptionMessage).body).toBe(BODY);
  });

  it('reads a clone of fetch responses and returns the original', async () => {
    FakeXHR.bodies.set('timedtext', BODY);
    const { win, posted } = makeWindow();
    installCaptionHook(win);
    const res = await win.fetch(URL_A);
    expect(await res.text()).toBe(BODY);
    await new Promise((r) => setTimeout(r, 0));
    expect(posted).toHaveLength(1);
  });

  it('replays the buffer on request and restores originals on uninstall', () => {
    FakeXHR.bodies.set('timedtext', BODY);
    const { win, posted, sendMessage, fetchMock, listeners } = makeWindow();
    const originalOpen = FakeXHR.prototype.open;
    const uninstall = installCaptionHook(win);
    const xhr = new win.XMLHttpRequest();
    xhr.open('GET', URL_A);
    xhr.send();
    sendMessage({ source: 'shadow-lingo:replay' });
    sendMessage({ source: 'something-else' });
    expect(posted).toHaveLength(2);
    uninstall();
    expect(win.fetch).toBe(fetchMock);
    expect(FakeXHR.prototype.open).toBe(originalOpen);
    expect(listeners.size).toBe(0);
  });
});
