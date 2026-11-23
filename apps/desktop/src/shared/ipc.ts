/** IPC channel names shared by the main process, the preload and the renderer. */
export const CAPTION_CHANNEL = 'shadow-lingo:caption';
export const OPEN_EXTERNAL_CHANNEL = 'shadow-lingo:open-external';
export const AD_CHANNEL = 'shadow-lingo:ad';
export const OCR_CAPTURE_CHANNEL = 'shadow-lingo:ocr-capture';

/** What the preload exposes to the renderer as `window.shadowLingo`. */
export type { AppBridge as DesktopBridge } from '@shadow-lingo/shell';
