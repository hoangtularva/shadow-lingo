// Copies the README demo clips and screenshots into public/media, so the page shows the same
// pictures as the README without keeping a second copy in git.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, '../../docs/screenshots');
const to = join(root, 'public/media');
mkdirSync(to, { recursive: true });
for (const f of [
  'demo-subtitles.webp',
  'demo-word.webp',
  'demo-shadowing.webp',
  'demo-ocr.webp',
  'demo-review.webp',
]) {
  cpSync(join(from, f), join(to, f));
}
