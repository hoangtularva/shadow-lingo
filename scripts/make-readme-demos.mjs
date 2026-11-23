// Remakes the README demo clips (docs/screenshots/demo-*.webp), the desktop app screenshot
// (docs/screenshots/desktop-dark.png) and the store screenshots (docs/store/screenshot-*.png):
// builds the extension and the desktop app, films each feature with Playwright
// (apps/*/e2e/demo/readme.demo.ts), then encodes the frames.
//
// Encoding uses sharp, installed into a temporary folder at a pinned version only when this
// script runs, so the project itself does not depend on it. Usage: `pnpm demos`.
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARP = 'sharp@0.35.5';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extension = join(root, 'apps/extension');
const desktop = join(root, 'apps/desktop');
const frames = join(extension, 'demo-frames');
const desktopFrames = join(desktop, 'demo-frames');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

rmSync(frames, { recursive: true, force: true });
rmSync(desktopFrames, { recursive: true, force: true });
run('pnpm --filter @shadow-lingo/extension build');
run('npx playwright test -c playwright.demo.config.ts', extension);
run('pnpm --filter @shadow-lingo/desktop build');
run('npx playwright test -c playwright.demo.config.ts', desktop);

const tools = mkdtempSync(join(tmpdir(), 'sl-demos-'));
run(`npm install --no-save --no-audit --no-fund --prefix "${tools}" ${SHARP}`);
const sharp = createRequire(join(tools, 'package.json'))('sharp');

/** Clips in README order, with the background of their theme for the store screenshots. */
const CLIPS = [
  ['subtitles', '#0f1115'],
  ['word', '#f4f5f7'],
  ['shadowing', '#0f1115'],
  ['ocr', '#0f1115'],
  ['review', '#f4f5f7'],
];
mkdirSync(join(root, 'docs/store'), { recursive: true });
for (const [i, [name, background]] of CLIPS.entries()) {
  const dir = join(frames, name);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort();
  // File names hold the time since the frame before: each frame shows until the next one.
  const gaps = files.map((f) => Number(f.split('_')[1].replace('.png', '')));
  const delay = files.map((_, k) => Math.min(400, Math.max(60, gaps[k + 1] ?? 1800)));
  delay[delay.length - 1] = 1800;
  const scaled = await Promise.all(
    files.map((f) => sharp(join(dir, f)).resize({ width: 880 }).png().toBuffer()),
  );
  const clip = join(root, `docs/screenshots/demo-${name}.webp`);
  await sharp(scaled, { join: { animated: true } })
    .webp({ quality: 72, effort: 6, loop: 0, delay })
    .toFile(clip);
  // The last frame, centred on 1280×800, for the store listing.
  const last = await sharp(join(dir, files[files.length - 1])).toBuffer();
  const { width, height } = await sharp(last).metadata();
  await sharp({ create: { width: 1280, height: 800, channels: 3, background } })
    .composite([
      { input: last, left: Math.round((1280 - width) / 2), top: Math.round((800 - height) / 2) },
    ])
    .png({ compressionLevel: 9 })
    .toFile(join(root, `docs/store/screenshot-${i + 1}-${name}.png`));
  console.log(`${name}: ${files.length} frames, ${Math.round(statSync(clip).size / 1024)} KB`);
}
await sharp(join(desktopFrames, 'desktop-dark.png'))
  .png({ compressionLevel: 9, palette: true, quality: 92 })
  .toFile(join(root, 'docs/screenshots/desktop-dark.png'));
console.log('desktop screenshot');

// Windows keeps sharp's library loaded until this process ends: the OS cleans the temp folder.
try {
  rmSync(tools, { recursive: true, force: true });
} catch {
  console.log(`(left ${tools} for the system to clean)`);
}
