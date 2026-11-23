import type { PluginListenerHandle } from '@capacitor/core';
import { describe, expect, it, vi } from 'vitest';
import {
  createAndroidBridge,
  MAX_SHARED_CHARS,
  toCaption,
  type NativeShadowLingo,
} from '../src/bridge';

type Listener = (data: Record<string, unknown>) => void;

function fakeNative() {
  const listeners = new Map<string, Set<Listener>>();
  const removed: string[] = [];
  const native = {
    addListener(event: string, l: Listener): Promise<PluginListenerHandle> {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(l);
      return Promise.resolve({
        remove: () => {
          listeners.get(event)?.delete(l);
          removed.push(event);
          return Promise.resolve();
        },
      });
    },
    openExternal: vi.fn(() => Promise.resolve()),
    setDark: vi.fn(() => Promise.resolve()),
  };
  const emit = (event: string, data: Record<string, unknown>) => {
    for (const l of listeners.get(event) ?? []) l(data);
  };
  return { native: native as unknown as NativeShadowLingo, raw: native, emit, removed };
}

const URL_EN =
  'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en&fmt=json3&kind=asr&pot=SECRET';

describe('android bridge', () => {
  it('passes on caption files the embed loaded, checked like the other platforms', () => {
    expect(toCaption(URL_EN, '{"events":[]}')).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      lang: 'en',
      body: '{"events":[]}',
    });
    expect(toCaption('https://evil.example/api/timedtext?v=dQw4w9WgXcQ', 'x')).toBeNull();
    expect(toCaption(URL_EN, '')).toBeNull();
    expect(toCaption(42, 'x')).toBeNull();
  });

  it('forwards captions, ads and shared links, and unsubscribes', async () => {
    const { native, emit, removed } = fakeNative();
    const bridge = createAndroidBridge(native);
    const captions: string[] = [];
    const ads: boolean[] = [];
    const shared: string[] = [];
    const stop = bridge.onCaption((c) => captions.push(c.videoId));
    bridge.onAd((s) => ads.push(s));
    bridge.onShared?.((t) => shared.push(t));
    emit('caption', { url: URL_EN, body: 'x' });
    emit('caption', { url: 'nope', body: 'x' });
    emit('ad', { showing: true });
    emit('ad', { showing: 'yes' });
    emit('shared', { text: 'https://youtu.be/dQw4w9WgXcQ' });
    emit('shared', { text: 'x'.repeat(MAX_SHARED_CHARS + 1) });
    expect(captions).toEqual(['dQw4w9WgXcQ']);
    expect(ads).toEqual([true]);
    expect(shared).toEqual(['https://youtu.be/dQw4w9WgXcQ']);
    stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(removed).toContain('caption');
  });

  it('opens only allowed links outside the app, and colours the system bars', () => {
    const { native, raw } = fakeNative();
    const bridge = createAndroidBridge(native);
    bridge.openExternal('https://dictionary.cambridge.org/dictionary/english/figure');
    bridge.openExternal('https://evil.example/');
    bridge.openExternal('javascript:alert(1)');
    expect(raw.openExternal).toHaveBeenCalledTimes(1);
    bridge.setDark?.(true);
    expect(raw.setDark).toHaveBeenCalledWith({ dark: true });
  });
});
