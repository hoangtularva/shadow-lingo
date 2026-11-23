import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { MAX_CAPTION_BYTES, parseTimedTextUrl } from '@shadow-lingo/core/timedtext';
import type { AppBridge, CapturedCaption } from '@shadow-lingo/shell';
import { isExternalLink } from '@shadow-lingo/shell/links';

/** The app's own Android plugin (android/app/src/main/java/.../ShadowLingoPlugin.java). */
export interface NativeShadowLingo {
  addListener(
    event: 'caption',
    listener: (data: { url: unknown; body: unknown }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'ad',
    listener: (data: { showing: unknown }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'shared',
    listener: (data: { text: unknown }) => void,
  ): Promise<PluginListenerHandle>;
  openExternal(options: { url: string }): Promise<void>;
  setDark(options: { dark: boolean }): Promise<void>;
}

/** Longest shared text taken from another app (a link plus a title). */
export const MAX_SHARED_CHARS = 2000;

/** A caption the embed's player loaded, checked like the other platforms do. */
export function toCaption(url: unknown, body: unknown): CapturedCaption | null {
  if (typeof url !== 'string' || typeof body !== 'string') return null;
  if (!body || body.length > MAX_CAPTION_BYTES) return null;
  const info = parseTimedTextUrl(url);
  return info ? { ...info, body } : null;
}

function subscribe(handle: Promise<PluginListenerHandle>): () => void {
  return () => {
    void handle.then((h) => h.remove()).catch(() => undefined);
  };
}

/** `window.shadowLingo` for the Android app. */
export function createAndroidBridge(native: NativeShadowLingo): AppBridge {
  return {
    onCaption(listener) {
      return subscribe(
        native.addListener('caption', ({ url, body }) => {
          const c = toCaption(url, body);
          if (c) listener(c);
        }),
      );
    },
    onAd(listener) {
      return subscribe(
        native.addListener('ad', ({ showing }) => {
          if (typeof showing === 'boolean') listener(showing);
        }),
      );
    },
    onShared(listener) {
      return subscribe(
        native.addListener('shared', ({ text }) => {
          if (typeof text === 'string' && text.length <= MAX_SHARED_CHARS) listener(text);
        }),
      );
    },
    setDark(dark) {
      void native.setDark({ dark }).catch(() => undefined);
    },
    openExternal(url) {
      if (isExternalLink(url)) void native.openExternal({ url }).catch(() => undefined);
    },
  };
}

export function nativePlugin(): NativeShadowLingo {
  return registerPlugin<NativeShadowLingo>('ShadowLingo');
}
