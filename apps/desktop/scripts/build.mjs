// Builds the desktop app into dist/: main process and preload with esbuild (the preload runs
// sandboxed, so it is a single CommonJS file), the renderer with Vite, then copies the data
// the panel loads at run time (CMU Dict, Wiktionary shards, translation model, OCR, fonts).
import { readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { copyAppData } from '../../../packages/shell/scripts/copy-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });

const node = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
  legalComments: 'none',
};
await build({
  ...node,
  entryPoints: [join(root, 'src/main/main.ts')],
  outfile: join(out, 'main/main.js'),
});
await build({
  ...node,
  entryPoints: [join(root, 'src/preload/preload.ts')],
  outfile: join(out, 'preload/preload.js'),
});
await viteBuild({ configFile: join(root, 'vite.config.mts'), logLevel: 'warn' });

const renderer = join(out, 'renderer');
await copyAppData(renderer, { ocr: true });
console.log(`built dist/ (${readdirSync(join(renderer, 'dict')).length} dictionary files)`);
