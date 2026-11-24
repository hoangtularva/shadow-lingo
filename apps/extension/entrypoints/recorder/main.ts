/**
 * Offscreen document (Chrome): records the learner's voice for shadowing and reads burned-in
 * subtitles, for the background, which has no DOM.
 */
import { isOcrOffscreenRequest, type OcrResponse } from '@/lib/ocr';
import { isRecOffscreenRequest, type RecResponse } from '@/lib/recorder';
import { handleRecAction } from '@/lib/recorder-engine';

// "Đọc chữ trên hình": the background forwards the subtitle band; Tesseract loads on first use.
browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (sender.id !== browser.runtime.id || sender.tab || !isOcrOffscreenRequest(message)) {
    return undefined;
  }
  return import('./ocr-engine')
    .then((m) => m.recognize(message.image))
    .catch((): OcrResponse => ({ ok: false }));
});

browser.runtime.onMessage.addListener((message: unknown, sender) => {
  // Only the background (no tab) may drive the recorder; content scripts go through it.
  if (sender.id !== browser.runtime.id || sender.tab || !isRecOffscreenRequest(message)) {
    return undefined;
  }
  return handleRecAction(message.action).catch((): RecResponse => ({
    ok: false,
    reason: 'failed',
  }));
});
