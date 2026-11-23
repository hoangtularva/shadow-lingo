import type { PluginListenerHandle } from '@capacitor/core';
import { describe, expect, it, vi } from 'vitest';
import {
  createAndroidBridge,
  MAX_SHARED_CHARS,
  toCaption,
  toPngBytes,
  type NativeShadowLingo,
} from '../src/bridge';

type Listener = (data: Record<string, unknown>) => void;

/** The 8-byte PNG signature plus a little, in base64. */
const PNG_B64 = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0));

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
    playerShow: vi.fn(() => Promise.resolve()),
    playerMove: vi.fn(() => Promise.resolve()),
    playerHide: vi.fn(() => Promise.resolve()),
    playerPost: vi.fn(() => Promise.resolve()),
    captureFrame: vi.fn(() => Promise.resolve({ png: PNG_B64 as unknown })),
  };
  const emit = (event: string, data: Record<string, unknown>) => {
    for (const l of listeners.get(event) ?? []) l(data);
  };
  return { native: native as unknown as NativeShadowLingo, raw: native, emit, removed };
}

const EN = { videoId: 'dQw4w9WgXcQ', lang: 'en', kind: 'asr', tlang: '' };

describe('android bridge', () => {
  it('passes on caption files the embed loaded, checked like the other platforms', () => {
    expect(toCaption({ ...EN, body: '{"events":[]}' })).toEqual({ ...EN, body: '{"events":[]}' });
    expect(toCaption({ ...EN, videoId: '../../etc', body: 'x' })).toBeNull();
    expect(toCaption({ ...EN, kind: 'other', body: 'x' })).toBeNull();
    expect(toCaption({ ...EN, body: '' })).toBeNull();
    expect(toCaption({ ...EN, body: 42 })).toBeNull();
    // Extra fields (a URL with tokens, say) are dropped.
    expect(
      toCaption({ ...EN, body: 'x', url: 'https://www.youtube.com/api/timedtext?pot=X' }),
    ).not.toHaveProperty('url');
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
    emit('caption', { ...EN, body: 'x' });
    emit('caption', { videoId: 'nope', body: 'x' });
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

  it('on iOS the embed runs in a native view, driven over the plugin', () => {
    const { native, raw, emit } = fakeNative();
    expect(createAndroidBridge(native, 'android').nativePlayer).toBeUndefined();
    const player = createAndroidBridge(native, 'ios').nativePlayer;
    if (!player) throw new Error('no native player on iOS');
    player.show('dQw4w9WgXcQ', 12.7, { x: 0, y: 56, width: 390, height: 219 });
    expect(raw.playerShow).toHaveBeenCalledWith({
      videoId: 'dQw4w9WgXcQ',
      start: 12,
      x: 0,
      y: 56,
      width: 390,
      height: 219,
    });
    player.post('{"event":"listening"}');
    expect(raw.playerPost).toHaveBeenCalledWith({ data: '{"event":"listening"}' });
    const got: string[] = [];
    player.onMessage((d) => got.push(d));
    emit('playerMessage', { data: '{"event":"initialDelivery"}' });
    emit('playerMessage', { data: 42 });
    expect(got).toEqual(['{"event":"initialDelivery"}']);
    player.hide();
    expect(raw.playerHide).toHaveBeenCalled();
  });

  it('says the share sheet works on Android only', () => {
    expect(createAndroidBridge(fakeNative().native, 'android').sharesFromApps).toBe(true);
    expect(createAndroidBridge(fakeNative().native, 'ios').sharesFromApps).toBe(false);
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

  it('Android hands over the player band as PNG bytes for reading text; iOS does not', async () => {
    const { native, raw } = fakeNative();
    const capture = createAndroidBridge(native, 'android').captureFrame;
    if (!capture) throw new Error('no capture on Android');
    const bytes = await capture({ x: 0, y: 150, width: 390, height: 55 });
    expect(bytes?.[1]).toBe(0x50);
    expect(raw.captureFrame).toHaveBeenCalledWith({ x: 0, y: 150, width: 390, height: 55 });
    raw.captureFrame.mockResolvedValueOnce({ png: 42 });
    expect(await capture({ x: 0, y: 0, width: 100, height: 50 })).toBeNull();
    raw.captureFrame.mockRejectedValueOnce(new Error('no'));
    expect(await capture({ x: 0, y: 0, width: 100, height: 50 })).toBeNull();
    expect(createAndroidBridge(native, 'ios').captureFrame).toBeUndefined();
  });

  it('accepts only real PNG data from the plugin', () => {
    expect(toPngBytes(PNG_B64)).not.toBeNull();
    expect(toPngBytes(btoa('GIF89a....'))).toBeNull();
    expect(toPngBytes('not base64!')).toBeNull();
    expect(toPngBytes('')).toBeNull();
  });
});
