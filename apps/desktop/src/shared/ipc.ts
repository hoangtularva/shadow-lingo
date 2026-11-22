/** IPC channel names shared by the main process, the preload and the renderer. */
export const CAPTION_CHANNEL = 'shadow-lingo:caption';
export const OPEN_EXTERNAL_CHANNEL = 'shadow-lingo:open-external';
export const AD_CHANNEL = 'shadow-lingo:ad';

/** What the preload exposes to the renderer as `window.shadowLingo`. */
export interface DesktopBridge {
  /** Captions the embedded player loaded (already filtered by the main process). */
  onCaption(
    listener: (c: {
      videoId: string;
      lang: string;
      kind: string;
      tlang: string;
      body: string;
    }) => void,
  ): () => void;
  /** Whether the embedded player shows an ad (read only; ads are never skipped). */
  onAd(listener: (showing: boolean) => void): () => void;
  /** Opens an allowed link (YouTube, Cambridge, Wiktionary, GitHub) in the system browser. */
  openExternal(url: string): void;
}
