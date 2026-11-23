import {
  BandReader,
  grabPixels,
  keepSureWords,
  type OcrAdapter,
  type OcrReading,
  type OcrRegion,
} from '@shadow-lingo/core';
import type { Worker } from 'tesseract.js';
import type { PlayerRect } from './bridge';

/**
 * "Đọc chữ trên hình" in the apps: the platform hands over the picture of the player's
 * subtitle band (`capture`), and Tesseract reads it here, in a Web Worker, from files shipped
 * with the app (`ocr/`). Nothing is fetched online and no picture is kept.
 */

/** Reads text from a black-and-white PNG (data URL). */
export type Recognize = (png: string) => Promise<OcrReading>;

/** The video inside the player box, assuming 16:9 (the embed letterboxes other shapes). */
export function videoArea(box: PlayerRect): PlayerRect {
  const ratio = 16 / 9;
  if (box.width / box.height > ratio) {
    const width = box.height * ratio;
    return { x: box.x + (box.width - width) / 2, y: box.y, width, height: box.height };
  }
  const height = box.width / ratio;
  return { x: box.x, y: box.y + (box.height - height) / 2, width: box.width, height };
}

/** Where rows `region` of the video sit on the page. */
export function regionRect(box: PlayerRect, region: OcrRegion): PlayerRect {
  const video = videoArea(box);
  return {
    x: video.x,
    y: video.y + video.height * region.from,
    width: video.width,
    height: video.height * (region.to - region.from),
  };
}

/** OCR for an app page; `setPlayer` tells it which element shows the video. */
export interface AppOcr extends OcrAdapter {
  setPlayer(el: Element | null): void;
}

export function createAppOcr(deps: {
  doc: Document;
  capture: (rect: PlayerRect) => Promise<Uint8Array | null>;
  recognize: Recognize;
}): AppOcr {
  const canvas = deps.doc.createElement('canvas');
  let warm: Promise<void> | null = null;
  let player: Element | null = null;
  return {
    setPlayer(el) {
      player = el;
    },
    prepare() {
      warm ??= deps.recognize(new BandReader(deps.doc).blank()).then(
        () => undefined,
        () => {
          warm = null;
        },
      );
      return warm;
    },
    async grab(region, maxWidth) {
      if (!player?.isConnected) return null;
      const r = player.getBoundingClientRect();
      if (r.width < 64 || r.height < 36) return null;
      const png = await deps.capture(
        regionRect({ x: r.left, y: r.top, width: r.width, height: r.height }, region),
      );
      if (!png) return null;
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(png)], { type: 'image/png' }),
      );
      try {
        // The picture already is the region: take all of it.
        const size = { width: bitmap.width, height: bitmap.height };
        return grabPixels(canvas, bitmap, size, { from: 0, to: 1 }, maxWidth);
      } finally {
        bitmap.close();
      }
    },
    recognize: (png) => deps.recognize(png).catch(() => null),
  };
}

/** Tesseract from the app's own `ocr/` folder, started on first use. */
export function createTesseract(base: string): Recognize {
  let worker: Promise<Worker> | null = null;
  const getWorker = () => {
    worker ??= import('tesseract.js')
      .then(async ({ createWorker, PSM }) => {
        const dir = new URL('ocr/', base).href;
        const w = await createWorker('eng', 1, {
          workerPath: `${dir}worker.min.js`,
          corePath: `${dir}tesseract-core-simd-lstm.wasm.js`,
          langPath: dir.replace(/\/$/, ''),
          gzip: false,
          cacheMethod: 'none',
          workerBlobURL: false,
        });
        // A subtitle: one or two lines of text.
        await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
        return w;
      })
      .catch((err: unknown) => {
        worker = null;
        throw err;
      });
    return worker;
  };
  return async (png) => {
    const w = await getWorker();
    const { data } = await w.recognize(png, {}, { text: true, blocks: true });
    const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    return keepSureWords(lines.map((line) => line.words));
  };
}
