/**
 * Tesseract in the offscreen document, loaded on first use. Every file comes from the
 * extension package (worker, WebAssembly core, English data): nothing is fetched online.
 */
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { OCR_CORE, OCR_DIR, OCR_WORKER, type OcrResponse } from '@/lib/ocr';

/** Words Tesseract is less sure about are usually picture details read as letters. */
const MIN_WORD_CONFIDENCE = 80;

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

export async function recognize(image: string): Promise<OcrResponse> {
  const w = await getWorker();
  const { data } = await w.recognize(image, {}, { text: true, blocks: true });
  // Keep the words Tesseract is sure of, line by line.
  const lines: string[] = [];
  let sum = 0;
  let count = 0;
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const words = line.words.filter(
          (word, i) =>
            (word.confidence >= MIN_WORD_CONFIDENCE && /[A-Za-z0-9]/.test(word.text)) ||
            // "I" is often read, unsure, as "|" or "l"; kept when a lowercase word follows.
            (/^[|lI]$/.test(word.text) && /^[a-z]/.test(line.words[i + 1]?.text ?? '')),
        );
        if (words.length === 0) continue;
        lines.push(words.map((word) => word.text).join(' '));
        for (const word of words) sum += word.confidence;
        count += words.length;
      }
    }
  }
  const text = lines.join('\n').slice(0, 400);
  return { ok: true, text, confidence: count ? sum / count : 0 };
}
