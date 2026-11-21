// Renders assets/logo.svg into the PNG icons committed to the repo.
// Extension: public/icon/{16,32,48,128}.png. Desktop (phase 7): assets/brand/{512,1024}.png.
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'assets/logo.svg'));

const targets = [
  ...[16, 32, 48, 128].map((size) => ({ size, out: `public/icon/${size}.png` })),
  ...[512, 1024].map((size) => ({ size, out: `assets/brand/${size}.png` })),
];

for (const { size, out } of targets) {
  const file = join(root, out);
  await mkdir(dirname(file), { recursive: true });
  await sharp(svg, { density: Math.ceil((72 * size) / 128) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`wrote ${out}`);
}
