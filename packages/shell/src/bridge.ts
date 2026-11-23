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
  /**
   * A player the platform shows itself over the page's player slot (iOS: the embed needs an
   * https page around it). Without it the page embeds the iframe directly.
   */
  nativePlayer?: NativePlayer;
  /** The system share sheet can send links here (Android), so the home screen says how. */
  sharesFromApps?: boolean;
  /**
   * The picture inside `rect` of the page (the player or its subtitle band), at most
   * `maxWidth` pixels wide, as PNG, for reading
   * burned-in subtitles on the device. Desktop only; null when there is none (minimized).
   */
  captureFrame?(rect: PlayerRect, maxWidth: number): Promise<Uint8Array | null>;
  /** Colours the system bars (status, navigation) to match the app's theme, if the platform has them. */
  setDark?(dark: boolean): void;
}

/** Where the player goes, in CSS pixels of the page's viewport. */
export interface PlayerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativePlayer {
  show(videoId: string, start: number, rect: PlayerRect): void;
  move(rect: PlayerRect): void;
  hide(): void;
  /** A message for the embed (the IFrame API's postMessage text). */
  post(data: string): void;
  /** Messages from the embed (already checked to come from YouTube). */
  onMessage(listener: (data: string) => void): () => void;
}

export function getBridge(): AppBridge | undefined {
  return (window as unknown as { shadowLingo?: AppBridge }).shadowLingo;
}
