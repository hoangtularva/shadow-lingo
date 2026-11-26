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

// Store listings: Chrome wants 96×96 artwork inside 16 px of transparent padding (128×128);
// Edge recommends a 300×300 logo.
// The SVG has its own margin: trim it so the artwork itself is `art` px.
const stores = [
  { size: 128, art: 96, trim: true, out: '../../docs/store/store-icon-128.png' },
  { size: 300, art: 300, trim: false, out: '../../docs/store/edge-logo-300.png' },
];
for (const { size, art, trim, out } of stores) {
  const big = await sharp(svg, { density: 72 * 8 })
    .png()
    .toBuffer();
  const drawn = await sharp(trim ? await sharp(big).trim().toBuffer() : big)
    .resize(art, art, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const pad = (size - art) / 2;
  await sharp(drawn)
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(join(root, out));
  console.log(`wrote ${out}`);
}
