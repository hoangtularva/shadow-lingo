// Downloads Tesseract's English data (tessdata_fast, Apache-2.0) at a pinned commit into
// .cache/ocr, checking its hash. wxt.config.ts copies it into the extension, so the extension
// never fetches it at run time.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '87416418657359cb625c412a48b6e1d6d41c29bd';
const FILE = {
  name: 'eng.traineddata',
  size: 4113088,
  sha256: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
};

const NOTICE = `Tesseract OCR English data (tessdata_fast, eng.traineddata), Apache License 2.0.
https://github.com/tesseract-ocr/tessdata_fast (commit ${COMMIT}).
Tesseract.js and tesseract.js-core: Apache License 2.0 (license files next to this one).
Frames are read on this device only; nothing is sent anywhere.
`;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OCR_DATA = join(root, '.cache', 'ocr', FILE.name);
export const OCR_NOTICE = join(root, '.cache', 'ocr', 'NOTICE.txt');

function ok(buf) {
  return buf.length === FILE.size && createHash('sha256').update(buf).digest('hex') === FILE.sha256;
}

export async function fetchOcrData() {
  mkdirSync(dirname(OCR_DATA), { recursive: true });
  writeFileSync(OCR_NOTICE, NOTICE);
  if (existsSync(OCR_DATA) && ok(readFileSync(OCR_DATA))) return OCR_DATA;
  const url = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${COMMIT}/${FILE.name}`;
  console.log(`downloading ${FILE.name} (${(FILE.size / 1e6).toFixed(1)} MB)`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!ok(buf)) throw new Error(`${FILE.name}: hash mismatch`);
  writeFileSync(`${OCR_DATA}.part`, buf);
  renameSync(`${OCR_DATA}.part`, OCR_DATA);
  return OCR_DATA;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await fetchOcrData();
  console.log(`OCR data ready: ${OCR_DATA}`);
}
