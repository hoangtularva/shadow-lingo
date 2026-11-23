import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isTimedTextInfo, MAX_CAPTION_BYTES } from '@shadow-lingo/core/timedtext';
import type { AppBridge, CapturedCaption, NativePlayer, PlayerRect } from '@shadow-lingo/shell';
import { isExternalLink } from '@shadow-lingo/shell/links';

/** The app's own Android plugin (android/app/src/main/java/.../ShadowLingoPlugin.java). */
export interface NativeShadowLingo {
  addListener(
    event: 'caption',
    listener: (data: Record<string, unknown>) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'ad',
    listener: (data: { showing: unknown }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'shared',
    listener: (data: { text: unknown }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'playerMessage',
    listener: (data: { data: unknown }) => void,
  ): Promise<PluginListenerHandle>;
  openExternal(options: { url: string }): Promise<void>;
  setDark(options: { dark: boolean }): Promise<void>;
  playerShow(options: { videoId: string; start: number } & PlayerRect): Promise<void>;
  playerMove(options: PlayerRect): Promise<void>;
  playerHide(): Promise<void>;
  playerPost(options: { data: string }): Promise<void>;
}

/** Longest shared text taken from another app (a link plus a title). */
export const MAX_SHARED_CHARS = 2000;

/** A caption the embed's player loaded, checked like the other platforms do. */
export function toCaption(data: Record<string, unknown>): CapturedCaption | null {
  const { body } = data;
  if (typeof body !== 'string' || !body || body.length > MAX_CAPTION_BYTES) return null;
  const info = {
    videoId: data.videoId,
    lang: data.lang,
    kind: data.kind,
    tlang: data.tlang,
  };
  return isTimedTextInfo(info) ? { ...info, body } : null;
}

/** iOS: the embed runs in its own WebView over the page (see PlayerHost.swift). */
export function createNativePlayer(native: NativeShadowLingo): NativePlayer {
  const quiet = (p: Promise<void>) => void p.catch(() => undefined);
  return {
    show: (videoId, start, rect) =>
      quiet(native.playerShow({ videoId, start: Math.max(0, Math.floor(start)), ...rect })),
    move: (rect) => quiet(native.playerMove(rect)),
    hide: () => quiet(native.playerHide()),
    post: (data) => quiet(native.playerPost({ data })),
    onMessage(listener) {
      return subscribe(
        native.addListener('playerMessage', ({ data }) => {
          if (typeof data === 'string' && data.length <= 200_000) listener(data);
        }),
      );
    },
  };
}

function subscribe(handle: Promise<PluginListenerHandle>): () => void {
  return () => {
    void handle.then((h) => h.remove()).catch(() => undefined);
  };
}

/** `window.shadowLingo` for the Android and iOS apps. */
export function createAndroidBridge(native: NativeShadowLingo, platform = 'android'): AppBridge {
  return {
    // Android's share sheet; iOS has no share extension yet (links come by shadowlingo://).
    sharesFromApps: platform === 'android',
    // iOS pages are served from capacitor://, which YouTube's embed refuses (error 153).
    ...(platform === 'ios' ? { nativePlayer: createNativePlayer(native) } : {}),
    onCaption(listener) {
      return subscribe(
        native.addListener('caption', (data) => {
          const c = toCaption(data);
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
