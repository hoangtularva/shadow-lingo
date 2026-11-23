# Reading burned-in subtitles ("Đọc chữ trên hình")

For videos whose subtitles are part of the picture. Everything runs on the device: frames are
looked at in memory and never kept or sent; Tesseract and its English data ship inside each
build (`packages/core/scripts/fetch-ocr-data.mjs` fetches the data at a pinned commit and checks
its hash).

## Pipeline

```
platform grab(region)  →  core: textMask + binarize  →  platform recognize(png)  →  core: cues
(pixels of part of           (white/yellow letters,       (Tesseract, words with      (OcrCueBuilder →
 the frame)                   Otsu fallback; skip an       confidence ≥ 80 kept)        buildOcrTrack)
                              unchanged band)
```

- **Core** (`packages/core/src/ocr/`): types, the image code (`frame.ts`), the cue builder
  (`index.ts`), the per-video cache (`cache.ts`), idle shutdown (`idle.ts`). `panel/useOcr.ts`
  runs the loop twice a second while the video plays and no ad shows.
- **Extension**: the content script draws the `<video>` element to a canvas (`lib/ocr.ts`);
  Tesseract runs in the offscreen document (`entrypoints/recorder/ocr-engine.ts`). Messages go
  content script → background → offscreen and are validated at each hop (PNG data URL only,
  size-capped; replies checked).
- **Desktop**: the main process copies the requested rectangle of the window
  (`webContents.capturePage`, rectangle clamped to the window, only for our own main frame);
  the page runs Tesseract in a Web Worker (`packages/shell/src/ocr.ts`).
- **Android**: `ShadowLingoPlugin.captureFrame` copies the rectangle of our own WebView with
  `PixelCopy` (it includes the playing video). Capacitor only accepts bridge calls from the
  app's origin, so the YouTube frame cannot call it.
- **iOS**: not yet (the embed is a separate native WebView; a snapshot of it is untested).

## Where to read

- **Tự tìm** (default): every 2 s (1 s until settled) the whole frame is looked at small
  (`findTextRegion`: rows with several narrow bright strokes brighter than both sides; a bright
  shape is one wide stroke and does not count). A new place is a _candidate_: it is read, but
  provisionally (`OcrCueBuilder.checkpoint`); it is confirmed when text is still found there
  4 s later, and given up (`rollback`) after 2.5 s without text. This drops the player's own
  title and controls, which show for a few seconds when playback starts.
- **Dưới / Trên**: fixed bands (72–97 % / 3–28 % of the height).
- **Chọn vùng**: the learner drags a band on a sketch of the frame in the panel (no picture is
  copied into the panel, nothing is drawn over the video).
- Screen captures (desktop, Android) also include the player's title and controls, so reading
  waits 3.5 s after playback starts (`OcrAdapter.showsPlayerUi`).

## From readings to sentences

- Text below 55 confidence, or with fewer than two real words, counts as no text.
- A line counts once seen twice (≥ 0.9 s); it is listed while still on screen and gets its end
  when it disappears or changes.
- Readings of the same line merge (similar, or one contains the other); the fuller one wins.
- Lines are saved per video on the device (newest 15 videos), so reopening a video shows them
  at once and reading again continues from them.

## Pitfalls

- In `packages/core`, never name anything `storage`: the extension build auto-imports WXT's
  `storage` for that name and fails (lint enforces this).
- The video being read is fixed when reading starts; the panel may already show another video
  when reading stops, so lines are published and saved only for the video they came from.
- Tests: `packages/core/test/ocr*.test.ts(x)`; e2e with burned-in canvas videos in
  `apps/extension/e2e` (bottom and middle of the frame, reopen) and `apps/desktop/e2e`.
