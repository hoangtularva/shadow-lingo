/** A caption file the embedded player loaded (read passively by the platform). */
export interface CapturedCaption {
  videoId: string;
  lang: string;
  kind: string;
  tlang: string;
  body: string;
}

/**
 * What each platform (Electron preload, Android WebView) gives the app page as
 * `window.shadowLingo`. Ads are only reported, never skipped.
 */
export interface AppBridge {
  /** Captions the embedded player loaded (already filtered by the platform). */
  onCaption(listener: (c: CapturedCaption) => void): () => void;
  /** Whether the embedded player shows an ad (read only; ads are never skipped). */
  onAd(listener: (showing: boolean) => void): () => void;
  /** Opens an allowed link (YouTube, Cambridge, Wiktionary, GitHub) outside the app. */
  openExternal(url: string): void;
  /** Links shared to the app from another app (Android share sheet), if the platform has it. */
  onShared?(listener: (text: string) => void): () => void;
}

export function getBridge(): AppBridge | undefined {
  return (window as unknown as { shadowLingo?: AppBridge }).shadowLingo;
}
