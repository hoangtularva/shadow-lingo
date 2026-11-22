import { describe, expect, it, vi } from 'vitest';
import { APP_BASE, appFile, isExternalLink } from '../src/main/app-origin';
import { watchCaptions, type DebuggerLike } from '../src/main/captions';
import { createEmbedPlayer, parsePlayerMessage, YOUTUBE_ORIGIN } from '../src/shared/embed-player';
import { embedUrl, startFromInput, videoIdFromInput, watchUrl } from '../src/shared/youtube';

describe('pasted links', () => {
  it('finds the video id in every common link shape', () => {
    const id = 'dQw4w9WgXcQ';
    for (const link of [
      id,
      `https://www.youtube.com/watch?v=${id}`,
      `youtube.com/watch?v=${id}&t=90`,
      `https://m.youtube.com/watch?feature=share&v=${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `  https://www.youtube-nocookie.com/embed/${id}  `,
    ]) {
      expect(videoIdFromInput(link), link).toBe(id);
    }
    for (const bad of [
      '',
      'hello world',
      `https://evil.example/watch?v=${id}`,
      `javascript:alert(1)//youtube.com/watch?v=${id}`,
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/channel/abc',
    ]) {
      expect(videoIdFromInput(bad), bad).toBeNull();
    }
  });

  it('reads start times and builds embed and watch links', () => {
    expect(startFromInput('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(90);
    expect(startFromInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toBe(90);
    expect(startFromInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s')).toBe(3723);
    expect(startFromInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=x')).toBe(0);
    const url = new URL(embedUrl('dQw4w9WgXcQ', 'https://app.example', 90));
    expect(url.origin + url.pathname).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(url.searchParams.get('enablejsapi')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('https://app.example');
    expect(url.searchParams.get('start')).toBe('90');
    expect(watchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

describe('embed player over postMessage', () => {
  const msg = (data: unknown, origin = YOUTUBE_ORIGIN) => ({
    origin,
    data: typeof data === 'string' ? data : JSON.stringify(data),
  });

  it('accepts only the embed’s own messages', () => {
    expect(
      parsePlayerMessage(
        msg({ event: 'infoDelivery', info: { currentTime: 1.5, playerState: 1 } }),
      ),
    ).toEqual({ currentTime: 1.5, playerState: 1 });
    expect(
      parsePlayerMessage(msg({ event: 'infoDelivery', info: {} }, 'https://evil.example')),
    ).toBeNull();
    expect(parsePlayerMessage(msg('not json'))).toBeNull();
    expect(parsePlayerMessage(msg({ event: 'onStateChange', info: 1 }))).toEqual({
      playerState: 1,
    });
    expect(parsePlayerMessage(msg({ event: 'onPlaybackRateChange', info: 0.5 }))).toEqual({
      playbackRate: 0.5,
    });
    expect(parsePlayerMessage(msg({ event: 'other', info: {} }))).toBeNull();
    expect(
      parsePlayerMessage(
        msg({ event: 'infoDelivery', info: { playbackRate: 99, playerState: 7 } }),
      ),
    ).toEqual({});
  });

  it('sends commands in seconds and reports time in ms', () => {
    vi.useFakeTimers();
    const sent: { func?: string; args?: unknown[]; event: string }[] = [];
    const target = {
      postMessage: (m: string, origin: string) => {
        expect(origin).toBe(YOUTUBE_ORIGIN);
        sent.push(JSON.parse(m) as { func?: string; args?: unknown[]; event: string });
      },
    };
    let handler: ((e: MessageEvent) => void) | null = null;
    const source = {
      addEventListener: (_t: 'message', l: (e: MessageEvent) => void) => {
        handler = l;
      },
      removeEventListener: () => {
        handler = null;
      },
    };
    const player = createEmbedPlayer(() => target, source);
    const times: number[] = [];
    player.onTimeUpdate((ms) => times.push(ms));
    player.connect();
    vi.advanceTimersByTime(600);
    expect(sent.filter((m) => m.event === 'listening').length).toBeGreaterThan(1);
    const deliver = (info: object) =>
      (handler as unknown as (e: unknown) => void)(msg({ event: 'infoDelivery', info }));
    deliver({
      currentTime: 12.5,
      playerState: 2,
      playbackRate: 0.75,
      videoData: { title: 'Talk' },
    });
    const listening = sent.filter((m) => m.event === 'listening').length;
    vi.advanceTimersByTime(1000);
    expect(sent.filter((m) => m.event === 'listening').length).toBe(listening);
    expect(times).toEqual([12500]);
    expect(player.getCurrentTime()).toBe(12500);
    expect(player.isPaused()).toBe(true);
    expect(player.getPlaybackRate()).toBe(0.75);
    expect(player.getTitle()).toBe('Talk');
    player.seekTo(3000);
    player.play();
    player.setPlaybackRate(1);
    expect(sent.filter((m) => m.event === 'command').map((m) => [m.func, m.args])).toEqual([
      ['addEventListener', ['onStateChange']],
      ['addEventListener', ['onPlaybackRateChange']],
      ['seekTo', [3, true]],
      ['playVideo', []],
      ['setPlaybackRate', [1]],
    ]);
    player.dispose();
    expect(handler).toBeNull();
    vi.useRealTimers();
  });
});

describe('caption capture through the debugger', () => {
  function fakeDebugger() {
    let listener: ((e: unknown, m: string, p: unknown, s?: string) => void) | null = null;
    let attached = false;
    const commands: [string, object | undefined, string | undefined][] = [];
    const bodies = new Map<string, string>();
    const dbg: DebuggerLike = {
      attach: () => {
        attached = true;
      },
      detach: () => {
        attached = false;
      },
      isAttached: () => attached,
      sendCommand: (method, params, sessionId) => {
        commands.push([method, params, sessionId]);
        if (method === 'Network.getResponseBody') {
          const id = (params as { requestId: string }).requestId;
          return Promise.resolve({ body: bodies.get(id) ?? '', base64Encoded: false });
        }
        return Promise.resolve({});
      },
      on: (_e, l) => {
        listener = l;
      },
      removeListener: () => {
        listener = null;
      },
    };
    const emit = (method: string, params: unknown, sessionId?: string) =>
      listener?.({}, method, params, sessionId);
    return { dbg, emit, commands, bodies, isAttached: () => attached };
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('reads the player’s caption responses in the iframe session, nothing else', async () => {
    const f = fakeDebugger();
    const got = vi.fn();
    const stop = watchCaptions(f.dbg, got);
    expect(f.isAttached()).toBe(true);
    f.emit('Target.attachedToTarget', { sessionId: 'iframe' });
    expect(f.commands.some(([m, , s]) => m === 'Network.enable' && s === 'iframe')).toBe(true);

    f.bodies.set('r1', '{"events":[]}');
    f.emit(
      'Network.responseReceived',
      {
        requestId: 'r1',
        response: {
          url: 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en&kind=asr&pot=SECRET&fmt=json3',
          status: 200,
        },
      },
      'iframe',
    );
    f.emit('Network.responseReceived', {
      requestId: 'r2',
      response: { url: 'https://www.youtube.com/s/player/base.js', status: 200 },
    });
    f.emit('Network.loadingFinished', { requestId: 'r2' });
    f.emit('Network.loadingFinished', { requestId: 'r1' }, 'iframe');
    await flush();
    expect(got).toHaveBeenCalledTimes(1);
    expect(got).toHaveBeenCalledWith({
      videoId: 'dQw4w9WgXcQ',
      lang: 'en',
      kind: 'asr',
      tlang: '',
      body: '{"events":[]}',
    });
    // The token is never passed on.
    expect(JSON.stringify(got.mock.calls)).not.toContain('SECRET');
    stop();
    expect(f.isAttached()).toBe(false);
  });
});

describe('app origin', () => {
  it('serves files only from the app folder', () => {
    const root = process.platform === 'win32' ? 'C:\\app\\renderer' : '/app/renderer';
    const sep = process.platform === 'win32' ? '\\' : '/';
    expect(appFile(APP_BASE, root)).toBe(`${root}${sep}index.html`);
    expect(appFile(`${APP_BASE}dev.js`, root)).toBe(`${root}${sep}dev.js`);
    expect(appFile(`${APP_BASE}..%2F..%2Fsecret.txt`, root)).toBeNull();
    expect(appFile('https://hoangtularva.github.io/other/', root)).toBeNull();
  });

  it('opens only known sites in the system browser', () => {
    expect(isExternalLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isExternalLink('https://dictionary.cambridge.org/dictionary/english/show')).toBe(true);
    expect(isExternalLink('http://www.youtube.com/')).toBe(false);
    expect(isExternalLink('file:///C:/Windows')).toBe(false);
    expect(isExternalLink('https://evil.example/')).toBe(false);
  });
});
