/**
 * Tesseract in the offscreen document, loaded on first use. Every file comes from the
 * extension package (worker, WebAssembly core, English data): nothing is fetched online.
 */
import { closeWhenIdle, ENGINE_IDLE_MS, keepSureWords } from '@shadow-lingo/core';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { OCR_CORE, OCR_DIR, OCR_WORKER, type OcrResponse } from '@/lib/ocr';

let worker: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!worker) {
    const dir = browser.runtime.getURL(OCR_DIR as '/');
    worker = createWorker('eng', 1, {
      workerPath: dir + OCR_WORKER,
      corePath: dir + OCR_CORE,
      langPath: dir.replace(/\/$/, ''),
      gzip: false,
      cacheMethod: 'none',
      workerBlobURL: false,
    })
      .then(async (w) => {
        // A subtitle: one or two lines of text.
        await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
        return w;
      })
      .catch((err: unknown) => {
        worker = null;
        throw err;
      });
  }
  return worker;
}

/** Frees the engine's memory once reading has stopped for a while. */
const withEngine = closeWhenIdle(ENGINE_IDLE_MS, () => {
  const w = worker;
  worker = null;
  void w?.then((x) => x.terminate()).catch(() => undefined);
});

export function recognize(image: string): Promise<OcrResponse> {
  return withEngine(async () => {
    const w = await getWorker();
    const { data } = await w.recognize(image, {}, { text: true, blocks: true });
    const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    return { ok: true, ...keepSureWords(lines.map((line) => line.words)) };
  });
}
