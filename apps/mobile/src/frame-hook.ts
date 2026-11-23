// Injected by the app into the YouTube embed frame only (never into other pages). Reads,
// without changing anything, the caption files the player loads and whether it shows an ad,
// and passes them to the app. No request is made and no token is read.
import { observeCaptionResponses } from '@shadow-lingo/core/caption-hook';
import { MAX_CAPTION_BYTES, parseTimedTextUrl } from '@shadow-lingo/core/timedtext';

interface NativeChannel {
  postMessage(message: string): void;
}

const native = (globalThis as { shadowLingoNative?: NativeChannel }).shadowLingoNative;

if (native && location.pathname.startsWith('/embed/')) {
  observeCaptionResponses(window, (url, body) => {
    if (!body || body.length > MAX_CAPTION_BYTES) return;
    // Only the video id and languages leave the frame: the URL (with its tokens) never does.
    const info = parseTimedTextUrl(url, location.href);
    if (!info) return;
    native.postMessage(JSON.stringify({ type: 'caption', ...info, body }));
  });

  // The player's own "ad-showing" class (read only; ads are never skipped).
  let showing = false;
  setInterval(() => {
    const now = document.querySelector('.html5-video-player.ad-showing') !== null;
    if (now !== showing) {
      showing = now;
      native.postMessage(JSON.stringify({ type: 'ad', showing }));
    }
  }, 1000);
}
